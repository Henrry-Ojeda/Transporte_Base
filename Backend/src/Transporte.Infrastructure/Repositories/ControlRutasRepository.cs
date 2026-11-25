using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

namespace Transporte.Infrastructure.Repositories
{
    public interface IControlRutasRepository
    {
        Task<IEnumerable<ControlRutaDto>> ObtenerControlesAsync(int usuarioId, string rol, DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, int? cicloId = null);
        Task<ControlRutaDto?> ObtenerControlPorIdAsync(long id);
        Task<long> RegistrarControlAsync(RegistrarControlRutaDto dto, int usuarioId, string rol);
        Task<long> RecalcularControlAsync(DateTime fecha, int conductorId, int usuarioId, string rol);
        Task<bool> EditarControlAsync(long id, EditarControlRutaDto dto, int usuarioId, string rol);
        Task<bool> EliminarControlAsync(long id, int usuarioId, string rol);
        Task<IEnumerable<ProcesoTicketDto>> ObtenerProcesosDisponiblesAsync();
        Task<bool> CambiarProcesoAsync(long controlId, int procesoId, int usuarioId, string? observacion);
        Task<bool> AsignarRutasLogisticasAsync(long id, AsignarRutasTicketDto dto, int usuarioId, string rol);
        Task<IEnumerable<HistorialProcesoTicketDto>> ObtenerHistorialProcesosAsync(long controlId);

        // Nuevos mÃ©todos del ciclo de vida logÃ­stico de Viajes / Tickets (AGENTS_2)
        Task<ControlRutaDto?> ObtenerViajeActivoChoferAsync(int choferId);
        Task<IEnumerable<ControlRutaDto>> ObtenerViajesActivosChoferAsync(int choferId, DateTime? fecha = null);
        Task<long> CrearNuevoViajeAsync(CrearViajeDto dto, int usuarioId, string rol);
        Task<ResultadoSyncPaqueteDto> SincronizarPaqueteTicketAsync(SincronizarPaqueteTicketDto dto, int usuarioId, string rol);
        Task<long> AgregarFincaAViajeAsync(AgregarFincaViajeDto dto, int usuarioId, string rol);
        Task<IEnumerable<RutaItemDto>> ObtenerFincasDeViajeAsync(long controlRutaId, bool soloConLitros = false);
        Task<bool> EnviarAReceptoriaAsync(long controlRutaId, int usuarioId, string? observacion);
        Task<bool> RecibirEnReceptoriaAsync(long controlRutaId, RecibirEnReceptoriaDto dto, int usuarioId);
        Task<bool> EntregarDirectoCompaniaAsync(long controlRutaId, EntregarDirectoCompaniaDto dto, int usuarioId);
        Task<bool> RegistrarEntregaPlantaAsync(long controlRutaId, RegistrarEntregaPlantaDto dto, int usuarioId);
        Task<bool> FinalizarViajeContableAsync(long controlRutaId, int usuarioId, string? observacion);
        Task<bool> RevertirProcesoViajeAsync(long controlRutaId, RevertirProcesoViajeDto dto, int usuarioId, string rol);
        Task<long> EnviarDesdeRutaACompaniaAsync(long controlRutaId, EnviarDesdeRutaACompaniaDto dto, int usuarioId);
        Task<ResultadoTraspasoDto> TraspasarLecheAViajeAsync(long ticketOrigenId, TraspasarLecheDto dto, int usuarioId, string rol);
        Task<IEnumerable<ControlCompaniaDto>> ObtenerDespachosDeTicketAsync(long controlRutaId);
        Task<bool> EliminarDespachoDirectoAsync(long controlCompaniaId, int usuarioId);

        // MÃ©todos de ModificaciÃ³n Auditada desde el Control de Viaje
        Task<bool> EditarFincaDeViajeAuditadoAsync(long controlRutaId, long rutaId, EditarFincaViajeAuditadoDto dto, int usuarioId, string rol);
        Task<bool> EliminarFincaDeViajeAuditadoAsync(long controlRutaId, long rutaId, string motivo, int usuarioId, string rol);
        Task<bool> LimpiarFincaTicketAsync(long controlRutaId, long rutaId, int usuarioId, string rol);
        Task<IEnumerable<EntregaItemDto>> ObtenerEntregasDeViajeAsync(long controlRutaId);
        Task<bool> EditarEntregaDeViajeAuditadoAsync(long controlRutaId, long entregaId, EditarEntregaViajeAuditadoDto dto, int usuarioId, string rol);
        Task<IEnumerable<LogModificacionControlDto>> ObtenerLogsModificacionesControlAsync(long controlRutaId);
        Task<IEnumerable<LogModificacionControlDto>> ObtenerLogsAuditoriaGlobalAsync(DateTime? fechaDesde, DateTime? fechaHasta, string? tipoEntidad, string? busqueda, int limite = 200);
        Task<ValidarCargaMasivaExcelResponseDto> ValidarCargaMasivaExcelAsync(ValidarCargaMasivaExcelRequestDto dto, int usuarioId, string rol);
        Task<EjecutarCargaMasivaExcelResponseDto> EjecutarCargaMasivaExcelAsync(EjecutarCargaMasivaExcelRequestDto dto, int usuarioId, string rol);
    }

    // =====================================================================
    // IMPLEMENTATION: ControlRutasRepository
    // =====================================================================
    public class ControlRutasRepository : IControlRutasRepository
    {
        private readonly string _connectionString;

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, bool> _ensuredDatabases = new();
        private async Task EnsureTableNotificacionesExistsAsync(IDbConnection connection)
        {
            var dbKey = connection.Database ?? "default";
            if (_ensuredDatabases.ContainsKey(dbKey)) return;
            try
            {
                var sql = @"
                    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TB_NOTIFICACIONES_MOVIL')
                    BEGIN
                        CREATE TABLE TB_NOTIFICACIONES_MOVIL (
                            Id BIGINT IDENTITY(1,1) PRIMARY KEY,
                            UsuarioId INT NOT NULL,
                            Tipo NVARCHAR(50) NOT NULL,
                            Titulo NVARCHAR(150) NOT NULL,
                            Mensaje NVARCHAR(500) NOT NULL,
                            FechaOperativa DATE NULL,
                            ReferenciaId BIGINT NULL,
                            Leido BIT NOT NULL DEFAULT 0,
                            CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
                        );
                        CREATE INDEX IX_TB_NOTIFICACIONES_MOVIL_UsuarioId ON TB_NOTIFICACIONES_MOVIL(UsuarioId, Leido, CreatedAt DESC);
                    END
                    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TB_RUTAS_RECOLECCION') AND name = 'FotoComprobante')
                    BEGIN
                        ALTER TABLE TB_RUTAS_RECOLECCION ADD FotoComprobante NVARCHAR(MAX) NULL;
                    END
                    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TB_RUTAS_RECOLECCION') AND name = 'FotosEvidenciaJson')
                    BEGIN
                        ALTER TABLE TB_RUTAS_RECOLECCION ADD FotosEvidenciaJson NVARCHAR(MAX) NULL;
                    END";
                await connection.ExecuteAsync(sql);
                _ensuredDatabases[dbKey] = true;
            }
            catch { /* Tolerante */ }
        }

        public ControlRutasRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            var raw = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection")
                ?? configuration.GetConnectionString("BD_TRANSPORTE")
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";

            if (File.Exists("/.dockerenv") || string.Equals(Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER"), "true", StringComparison.OrdinalIgnoreCase))
            {
                raw = raw.Replace("84.247.178.194", "sql_instancia").Replace("127.0.0.1", "sql_instancia");
            }
            raw = System.Text.RegularExpressions.Regex.Replace(raw, @"Connect(?:ion)? Timeout\s*=\s*\d+", "Connect Timeout=30", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (!raw.Contains("Connect Timeout", StringComparison.OrdinalIgnoreCase))
            {
                raw += ";Connect Timeout=30;";
            }
            if (!raw.Contains("Encrypt", StringComparison.OrdinalIgnoreCase))
            {
                raw += ";Encrypt=False;";
            }
            _connectionString = raw;
        }

        public async Task<IEnumerable<ControlRutaDto>> ObtenerControlesAsync(int usuarioId, string rol, DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, int? cicloId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureTableNotificacionesExistsAsync(connection);

            // Auto-enlazar paradas huÃ©rfanas de ese conductor y fecha si tienen ControlRutaId NULL
            try
            {
                await connection.ExecuteAsync(@"
                    UPDATE r SET r.ControlRutaId = cr.Id
                    FROM TB_RUTAS_RECOLECCION r
                    INNER JOIN TB_CONTROL_RUTAS cr ON r.UsuarioId = cr.UsuarioId AND CAST(r.Fecha AS DATE) = CAST(cr.Fecha AS DATE)
                    WHERE r.ControlRutaId IS NULL;");
            }
            catch { /* Tolerante */ }

            // Sincronizar automÃ¡ticamente tickets para planificaciones de esa fecha que aÃºn no existan en TB_CONTROL_RUTAS
            try
            {
                bool hf = fecha.HasValue || fechaInicio.HasValue || fechaFin.HasValue;
                DateTime fIniSync = (fechaInicio ?? fecha ?? DateTime.Today.AddDays(-30)).Date;
                DateTime fFinSync = (fechaFin ?? fecha ?? DateTime.Today.AddDays(30)).Date;

                var planesSinTicket = await connection.QueryAsync<dynamic>(@"
                    SELECT p.Id, p.Fecha, p.CamionId, p.ConductorId, p.RutaLogisticaId, p.FincasIds, p.Observacion
                    FROM TB_PLANIFICACION_RUTAS_CHOFERES p
                    LEFT JOIN TB_CONTROL_RUTAS cr ON p.ControlRutaId = cr.Id OR (CAST(p.Fecha AS DATE) = CAST(cr.Fecha AS DATE) AND p.ConductorId = cr.UsuarioId)
                    WHERE p.Activo = 1 
                      AND (CAST(p.Fecha AS DATE) >= @fIniSync AND CAST(p.Fecha AS DATE) <= @fFinSync)
                      AND cr.Id IS NULL", new { fIniSync, fFinSync });

                foreach (var p in planesSinTicket)
                {
                    long newTicketId = await connection.ExecuteScalarAsync<long>(@"
                        INSERT INTO TB_CONTROL_RUTAS 
                        (Fecha, UsuarioId, CicloId, TotalLitrosFinca, TotalLitrosReceptoria, DiferenciaLitros, PorcentajeMerma, Estado, ProcesoActualId, RutaLogisticaId, Observacion, CreatedAt)
                        VALUES 
                        (@Fecha, @ConductorId, 1, 0, 0, 0, 0, 'ABIERTO', 1, @RutaLogisticaId, @Observacion, GETDATE());
                        SELECT CAST(SCOPE_IDENTITY() AS BIGINT);",
                        new { p.Fecha, p.ConductorId, p.RutaLogisticaId, p.Observacion });

                    await connection.ExecuteAsync("UPDATE TB_PLANIFICACION_RUTAS_CHOFERES SET ControlRutaId = @newTicketId WHERE Id = @Id", new { newTicketId, p.Id });
                    // Las fincas planificadas se muestran desde TB_PLANIFICACION_RUTAS_CHOFERES.FincasIds
                    // y solo se insertan en TB_RUTAS_RECOLECCION cuando el chofer carga litros reales (> 0).
                }
            }
            catch { /* Tolerante */ }

            bool hayFiltroFecha = fecha.HasValue || fechaInicio.HasValue || fechaFin.HasValue;
            DateTime inicio = (fechaInicio ?? fecha ?? DateTime.Today.AddDays(-30)).Date;
            DateTime fin = (fechaFin ?? fecha ?? DateTime.Today.AddDays(30)).Date;

            // Si se pasa una fecha puntual (o rango), filtramos estrictamente por esa fecha o rango.
            // Si NO se pasa ninguna fecha, mostramos el rango por defecto y tickets en curso.
            var whereFecha = hayFiltroFecha
                ? "(CAST(cr.Fecha AS DATE) >= @inicio AND CAST(cr.Fecha AS DATE) <= @fin)"
                : "((CAST(cr.Fecha AS DATE) >= @inicio AND CAST(cr.Fecha AS DATE) <= @fin) OR (cr.ProcesoActualId = 1 AND cr.Estado NOT IN ('FINALIZADO', 'CERRADO')))";

            var sql = $@"
                SELECT 
                    cr.Id, cr.Fecha, cr.UsuarioId, u.NombreCompleto AS NombreConductor,
                    cr.CicloId, 
                    COALESCE(
                        NULLIF(cr.TotalLitrosFinca, 0),
                        (SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r WHERE (r.ControlRutaId = cr.Id OR (r.ControlRutaId IS NULL AND r.UsuarioId = cr.UsuarioId AND CAST(r.Fecha AS DATE) = CAST(cr.Fecha AS DATE)))),
                        0
                    ) AS TotalLitrosFinca, 
                    cr.TotalLitrosReceptoria,
                    cr.DiferenciaLitros, cr.PorcentajeMerma, cr.Estado, cr.Observacion, cr.CreatedAt,
                    cr.ProcesoActualId,
                    pt.Codigo AS CodigoProceso,
                    pt.Nombre AS NombreProceso,
                    pt.Color AS ColorProceso,
                    pt.Icono AS IconoProceso,
                    cr.RutaLogisticaId,
                    COALESCE(rl.Nombre, CASE WHEN cr.Observacion LIKE '%[ENTRADA TERCERO]%' THEN (SELECT TOP 1 f.Nombre FROM TB_RUTAS_RECOLECCION rr INNER JOIN TB_FINCAS f ON rr.FincaId = f.Id WHERE rr.ControlRutaId = cr.Id) ELSE NULL END) AS RutaLogisticaNombre,
                    COALESCE(cam.Id, cam_plan.Id) AS CamionId,
                    COALESCE(cam.Placa, cam_plan.Placa) AS CamionPlaca,
                    COALESCE(cam.CapacidadLitros, cam_plan.CapacidadLitros) AS CapacidadCamionLitros,
                    cr.TipoDestino,
                    cr.LitrosRecibidosReceptoria,
                    uc.NombreCompleto AS NombreCerradoPor,
                    (SELECT COUNT(*) FROM TB_RUTAS_RECOLECCION r WHERE r.ControlRutaId = cr.Id OR (r.ControlRutaId IS NULL AND r.UsuarioId = cr.UsuarioId AND CAST(r.Fecha AS DATE) = CAST(cr.Fecha AS DATE))) AS TotalFincas
                FROM TB_CONTROL_RUTAS cr
                INNER JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                LEFT JOIN TB_PROCESOS_TICKET pt ON cr.ProcesoActualId = pt.Id
                LEFT JOIN TB_COMPANIAS cp ON cr.CompaniaDestinoId = cp.Id
                LEFT JOIN TB_USUARIOS uc ON cr.CerradoPor = uc.Id
                LEFT JOIN TB_RUTAS_LOGISTICA rl ON cr.RutaLogisticaId = rl.Id
                LEFT JOIN TB_CAMIONES cam ON cam.UsuarioId = cr.UsuarioId AND cam.Activo = 1
                LEFT JOIN TB_PLANIFICACION_RUTAS_CHOFERES plc ON plc.ControlRutaId = cr.Id AND plc.Activo = 1
                LEFT JOIN TB_CAMIONES cam_plan ON cam_plan.Id = plc.CamionId
                WHERE {whereFecha}
                  AND (@cicloId IS NULL OR cr.CicloId = @cicloId)
                  AND (UPPER(@rol) LIKE '%ADMIN%' OR UPPER(@rol) IN ('SUPERVISOR', 'GERENTE', 'RECEPTOR', 'RECEPTORIA', 'FINANZAS') OR (cr.UsuarioId = @usuarioId AND CAST(cr.Fecha AS DATE) <= CAST(DATEADD(hour, -4, GETUTCDATE()) AS DATE)))
                ORDER BY cr.Fecha DESC, cr.Id DESC";

            return await connection.QueryAsync<ControlRutaDto>(sql, new { inicio, fin, cicloId, rol, usuarioId });
        }

        public async Task<ControlRutaDto?> ObtenerControlPorIdAsync(long id)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT cr.Id, cr.Fecha, cr.UsuarioId, u.NombreCompleto AS NombreConductor,
                       cr.CicloId, cr.TotalLitrosFinca, cr.TotalLitrosReceptoria,
                       cr.DiferenciaLitros, cr.PorcentajeMerma, cr.Estado, cr.Observacion, cr.CreatedAt,
                       cr.ProcesoActualId,
                       pt.Codigo AS CodigoProceso,
                       pt.Nombre AS NombreProceso,
                       pt.Color AS ColorProceso,
                       pt.Icono AS IconoProceso,
                       cr.RutaLogisticaId,
                       COALESCE(rl.Nombre, CASE WHEN cr.Observacion LIKE '%[ENTRADA TERCERO]%' THEN (SELECT TOP 1 f.Nombre FROM TB_RUTAS_RECOLECCION rr INNER JOIN TB_FINCAS f ON rr.FincaId = f.Id WHERE rr.ControlRutaId = cr.Id) ELSE NULL END) AS RutaLogisticaNombre,
                       COALESCE(cam.Id, cam_plan.Id) AS CamionId,
                       COALESCE(cam.Placa, cam_plan.Placa) AS CamionPlaca,
                       COALESCE(cam.CapacidadLitros, cam_plan.CapacidadLitros) AS CapacidadCamionLitros,
                       cr.TipoDestino,
                       cr.LitrosRecibidosReceptoria,
                       cr.DiferenciaReceptoria,
                       cr.LitrosCargadosAdicional,
                       cr.CompaniaDestinoId,
                       cp.Nombre AS NombreCompaniaDestino,
                       cr.LitrosEntregadosCompania,
                       cr.DiferenciaCompania,
                       cr.MermaTotalLitros,
                       cr.FechaLlegadaReceptoria,
                       cr.FechaEntregaCompania,
                       cr.CerradoPor,
                       uc.NombreCompleto AS NombreCerradoPor,
                       (SELECT COUNT(*) FROM TB_RUTAS_RECOLECCION r WHERE r.ControlRutaId = cr.Id) AS TotalFincas
                FROM TB_CONTROL_RUTAS cr
                INNER JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                LEFT JOIN TB_PROCESOS_TICKET pt ON cr.ProcesoActualId = pt.Id
                LEFT JOIN TB_COMPANIAS cp ON cr.CompaniaDestinoId = cp.Id
                LEFT JOIN TB_USUARIOS uc ON cr.CerradoPor = uc.Id
                LEFT JOIN TB_RUTAS_LOGISTICA rl ON cr.RutaLogisticaId = rl.Id
                LEFT JOIN TB_CAMIONES cam ON cam.UsuarioId = cr.UsuarioId AND cam.Activo = 1
                LEFT JOIN TB_PLANIFICACION_RUTAS_CHOFERES plc ON plc.ControlRutaId = cr.Id AND plc.Activo = 1
                LEFT JOIN TB_CAMIONES cam_plan ON cam_plan.Id = plc.CamionId
                WHERE cr.Id = @id";
            return await connection.QueryFirstOrDefaultAsync<ControlRutaDto>(sql, new { id });
        }

        public async Task<long> RegistrarControlAsync(RegistrarControlRutaDto dto, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var fechaControl = dto.Fecha.Date;
            int conductorEfectivo;
            if (rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) || rol.Equals("SUPERVISOR", StringComparison.OrdinalIgnoreCase))
            {
                if (!dto.UsuarioId.HasValue || dto.UsuarioId.Value <= 0)
                {
                    throw new InvalidOperationException("Debe seleccionar un chofer para crear el ticket de control de ruta.");
                }
                conductorEfectivo = dto.UsuarioId.Value;
            }
            else
            {
                conductorEfectivo = usuarioId;
            }

            var rolChofer = await connection.ExecuteScalarAsync<int?>(
                "SELECT RolId FROM TB_USUARIOS WHERE Id = @conductorEfectivo", new { conductorEfectivo });
            if (rolChofer == 1 || conductorEfectivo == 2018)
            {
                throw new InvalidOperationException("El usuario seleccionado tiene rol Administrador y no puede ser asignado como conductor.");
            }

            int? cicloId = dto.CicloId;
            if (!cicloId.HasValue || cicloId.Value <= 0)
            {
                cicloId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaControl BETWEEN FechaInicio AND FechaFin AND Estado = 'ABIERTO'",
                    new { fechaControl });
                if (!cicloId.HasValue)
                    cicloId = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC");
            }

            int diferencia = dto.TotalLitrosFinca - dto.TotalLitrosReceptoria;
            decimal porcentaje = dto.TotalLitrosFinca > 0 ? Math.Round((Math.Abs(diferencia) * 100.0m) / dto.TotalLitrosFinca, 2) : 0;
            string estado = diferencia == 0 ? "CUADRADO" : (porcentaje > 5 ? "MERMA_EXCESIVA" : "PENDIENTE");

            int procesoId = dto.ProcesoActualId ?? await connection.ExecuteScalarAsync<int>(
                "SELECT TOP 1 Id FROM TB_PROCESOS_TICKET WHERE Codigo = 'ABIERTO'");
            if (procesoId == 0) procesoId = 1;

            var sqlInsert = @"
                INSERT INTO TB_CONTROL_RUTAS
                (Fecha, UsuarioId, CicloId, TotalLitrosFinca, TotalLitrosReceptoria, DiferenciaLitros, PorcentajeMerma, Estado, ProcesoActualId, TipoDestino, RutaLogisticaId, Observacion, CreatedAt, CreatedBy)
                VALUES (@fechaControl, @conductorEfectivo, @cicloId, @totalFinca, @totalReceptoria, @diferencia, @porcentaje, @estado, @procesoId, @tipoDestino, @rutaLogisticaId, @observacion, GETDATE(), @usuarioId);
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

            var nuevoId = await connection.ExecuteScalarAsync<long>(sqlInsert, new
            {
                fechaControl, conductorEfectivo, cicloId,
                totalFinca = dto.TotalLitrosFinca, totalReceptoria = dto.TotalLitrosReceptoria,
                diferencia, porcentaje, estado, procesoId, tipoDestino = dto.TipoDestino ?? "RECEPTORIA", 
                rutaLogisticaId = dto.RutaLogisticaId,
                observacion = dto.Observacion, usuarioId
            });

            // Registrar en historial inicial
            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@nuevoId, @procesoId, GETDATE(), @usuarioId, 'CreaciÃ³n de ticket');",
                new { nuevoId, procesoId, usuarioId });

            return nuevoId;
        }

        private static bool EsRolAdmin(string? rol)
        {
            var r = (rol ?? string.Empty).Trim().ToUpperInvariant();
            return r == "ADMIN" || r == "SUPERADMIN" || r == "SUPER_ADMIN" || r == "ADMINISTRADOR";
        }

        private static async Task<bool> TieneAccesoAdminOPermisoAsync(SqlConnection connection, int usuarioId, string? rol, params string[] permisos)
        {
            if (EsRolAdmin(rol)) return true;
            var sql = @"
                SELECT COUNT(1)
                FROM TB_USUARIOS u
                INNER JOIN TB_ROL_PERMISOS rp ON (u.RolId = rp.RolId OR (u.RolId IS NULL AND rp.RolId = (SELECT TOP 1 Id FROM TB_ROLES WHERE Codigo = u.Rol)))
                INNER JOIN TB_PERMISOS p ON rp.PermisoId = p.Id
                WHERE u.Id = @usuarioId AND rp.Concedido = 1 AND p.Activo = 1
                  AND (p.Codigo = 'ADMIN_TOTAL' OR p.Codigo IN @permisos)";
            var count = await connection.ExecuteScalarAsync<int>(sql, new { usuarioId, permisos });
            return count > 0;
        }

        public async Task<long> RecalcularControlAsync(DateTime fecha, int conductorId, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var fechaControl = fecha.Date;
            bool esAdmin = await TieneAccesoAdminOPermisoAsync(connection, usuarioId, rol, "CONTROL_RUTAS_EDITAR", "RUTAS_EDITAR");
            int conductorEfectivo = (esAdmin && conductorId > 0) ? conductorId : usuarioId;

            var totalFinca = await connection.ExecuteScalarAsync<int>(
                @"SELECT ISNULL(SUM(r.Litros), 0) FROM TB_RUTAS_RECOLECCION r
                  INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                  WHERE r.UsuarioId = @conductorEfectivo AND CAST(r.Fecha AS DATE) = @fechaControl
                    AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'",
                new { conductorEfectivo, fechaControl });

            var totalReceptoria = await connection.ExecuteScalarAsync<int>(
                "SELECT ISNULL(SUM(Litros), 0) FROM TB_ENTREGAS_COMPANIA WHERE UsuarioId = @conductorEfectivo AND CAST(Fecha AS DATE) = @fechaControl",
                new { conductorEfectivo, fechaControl });

            int diferencia = totalFinca - totalReceptoria;
            decimal porcentaje = totalFinca > 0 ? Math.Round((Math.Abs(diferencia) * 100.0m) / totalFinca, 2) : 0;
            string estado = diferencia == 0 ? "CUADRADO" : (porcentaje > 5 ? "MERMA_EXCESIVA" : "PENDIENTE");

            var cicloId = await connection.ExecuteScalarAsync<int?>(
                "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaControl BETWEEN FechaInicio AND FechaFin AND Estado = 'ABIERTO'",
                new { fechaControl });

            var existingId = await connection.ExecuteScalarAsync<long?>(
                "SELECT TOP 1 Id FROM TB_CONTROL_RUTAS WHERE UsuarioId = @conductorEfectivo AND CAST(Fecha AS DATE) = @fechaControl",
                new { conductorEfectivo, fechaControl });

            if (existingId.HasValue)
            {
                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET TotalLitrosFinca = @totalFinca, TotalLitrosReceptoria = @totalReceptoria,
                        DiferenciaLitros = @diferencia, PorcentajeMerma = @porcentaje,
                        Estado = @estado, CicloId = @cicloId, ModifiedAt = GETDATE(), ModifiedBy = @usuarioId
                    WHERE Id = @existingId",
                    new { totalFinca, totalReceptoria, diferencia, porcentaje, estado, cicloId, usuarioId, existingId });

                // Asociar registros de TB_RUTAS_RECOLECCION pendientes de este chofer y fecha
                await connection.ExecuteAsync(@"
                    UPDATE TB_RUTAS_RECOLECCION
                    SET ControlRutaId = @existingId
                    WHERE UsuarioId = @conductorEfectivo AND CAST(Fecha AS DATE) = @fechaControl AND ControlRutaId IS NULL",
                    new { existingId, conductorEfectivo, fechaControl });

                return existingId.Value;
            }
            else
            {
                int procesoId = await connection.ExecuteScalarAsync<int>(
                    "SELECT TOP 1 Id FROM TB_PROCESOS_TICKET WHERE Codigo = 'ABIERTO'");
                if (procesoId == 0) procesoId = 1;

                var nuevoId = await connection.ExecuteScalarAsync<long>(@"
                    INSERT INTO TB_CONTROL_RUTAS
                    (Fecha, UsuarioId, CicloId, TotalLitrosFinca, TotalLitrosReceptoria, DiferenciaLitros, PorcentajeMerma, Estado, ProcesoActualId, CreatedAt, CreatedBy)
                    VALUES (@fechaControl, @conductorEfectivo, @cicloId, @totalFinca, @totalReceptoria, @diferencia, @porcentaje, @estado, @procesoId, GETDATE(), @usuarioId);
                    SELECT CAST(SCOPE_IDENTITY() AS BIGINT);",
                    new { fechaControl, conductorEfectivo, cicloId, totalFinca, totalReceptoria, diferencia, porcentaje, estado, procesoId, usuarioId });

                // Asociar registros de TB_RUTAS_RECOLECCION al nuevo ticket
                await connection.ExecuteAsync(@"
                    UPDATE TB_RUTAS_RECOLECCION
                    SET ControlRutaId = @nuevoId
                    WHERE UsuarioId = @conductorEfectivo AND CAST(Fecha AS DATE) = @fechaControl AND ControlRutaId IS NULL",
                    new { nuevoId, conductorEfectivo, fechaControl });

                // Registrar en historial inicial
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                    VALUES (@nuevoId, @procesoId, GETDATE(), @usuarioId, 'Generado en recÃ¡lculo');",
                    new { nuevoId, procesoId, usuarioId });

                return nuevoId;
            }
        }

        public async Task<bool> EditarControlAsync(long id, EditarControlRutaDto dto, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var control = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @id", new { id });
            if (control == null) return false;

            if (rol.Equals("CHOFER", StringComparison.OrdinalIgnoreCase))
            {
                if ((int)control.UsuarioId != usuarioId)
                    throw new UnauthorizedAccessException("No tienes permiso para editar controles de otros conductores.");
                if ((int)(control.ProcesoActualId ?? 1) != 1)
                    throw new InvalidOperationException("Solo puedes modificar el ticket mientras estÃ© ABIERTO en recolecciÃ³n.");
            }

            DateTime fecha = dto.Fecha ?? (DateTime)control.Fecha;
            int usuarioIdControl = dto.UsuarioId ?? (int)control.UsuarioId;
            int totalFinca = dto.TotalLitrosFinca ?? (int)control.TotalLitrosFinca;
            int totalReceptoria = dto.TotalLitrosReceptoria ?? (int)control.TotalLitrosReceptoria;
            int? litrosRecibidos = dto.LitrosRecibidosReceptoria ?? (int?)control.LitrosRecibidosReceptoria;

            int ltsParaDiferencia = litrosRecibidos ?? totalReceptoria;
            int diferencia = totalFinca - ltsParaDiferencia;
            decimal porcentaje = totalFinca > 0 ? Math.Round((Math.Abs(diferencia) * 100.0m) / totalFinca, 2) : 0;
            string estado = dto.Estado ?? (string)control.Estado ?? (diferencia == 0 ? "CUADRADO" : (porcentaje > 5 ? "MERMA_EXCESIVA" : "PENDIENTE"));
            int? procesoActualId = dto.ProcesoActualId ?? (int?)control.ProcesoActualId;

            // Obtener el CicloId correspondiente a la fecha efectiva
            var nuevoCicloId = await connection.ExecuteScalarAsync<int?>(
                "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fecha BETWEEN FechaInicio AND FechaFin ORDER BY Id DESC",
                new { fecha });

            var rows = await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET Fecha = @fecha,
                    CicloId = ISNULL(@nuevoCicloId, CicloId),
                    UsuarioId = @usuarioIdControl,
                    TotalLitrosFinca = @totalFinca, 
                    TotalLitrosReceptoria = @totalReceptoria,
                    LitrosRecibidosReceptoria = @litrosRecibidos,
                    DiferenciaLitros = @diferencia, 
                    PorcentajeMerma = @porcentaje,
                    Estado = @estado, 
                    ProcesoActualId = @procesoActualId,
                    TipoDestino = ISNULL(@tipoDestino, TipoDestino),
                    LitrosCargadosAdicional = ISNULL(@litrosCargadosAdicional, LitrosCargadosAdicional),
                    CompaniaDestinoId = ISNULL(@companiaDestinoId, CompaniaDestinoId),
                    LitrosEntregadosCompania = ISNULL(@litrosEntregadosCompania, LitrosEntregadosCompania),
                    RutaLogisticaId = CASE WHEN @rutaLogisticaId = 0 THEN NULL ELSE ISNULL(@rutaLogisticaId, RutaLogisticaId) END,
                    Observacion = COALESCE(@observacion, Observacion), 
                    ModifiedAt = GETDATE(), 
                    ModifiedBy = @usuarioId
                WHERE Id = @id",
                new
                {
                    fecha, nuevoCicloId, usuarioIdControl, totalFinca, totalReceptoria, litrosRecibidos,
                    diferencia, porcentaje, estado, procesoActualId,
                    tipoDestino = dto.TipoDestino,
                    litrosCargadosAdicional = dto.LitrosCargadosAdicional,
                    companiaDestinoId = dto.CompaniaDestinoId,
                    litrosEntregadosCompania = dto.LitrosEntregadosCompania,
                    rutaLogisticaId = dto.RutaLogisticaId,
                    observacion = dto.Observacion, usuarioId, id
                });

            if (rows > 0)
            {
                // Cascada: Sincronizar fecha, ciclo y conductor en todas las fincas recolectadas vinculadas a este ticket
                await connection.ExecuteAsync(@"
                    UPDATE TB_RUTAS_RECOLECCION
                    SET Fecha = @fecha,
                        CicloId = ISNULL(@nuevoCicloId, CicloId),
                        UsuarioId = @usuarioIdControl,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE ControlRutaId = @id",
                    new { fecha, nuevoCicloId, usuarioIdControl, usuarioId, id });

                // Cascada: Sincronizar tambiÃ©n recepciones y entregas asociadas al ticket
                await connection.ExecuteAsync(@"
                    UPDATE TB_ENTREGAS_COMPANIA
                    SET Fecha = @fecha,
                        CicloId = ISNULL(@nuevoCicloId, CicloId),
                        UsuarioId = @usuarioIdControl,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE ControlRutaId = @id 
                       OR Observacion LIKE '%#' + CAST(@id AS VARCHAR) + '%'
                       OR Observacion LIKE '%Viaje #' + CAST(@id AS VARCHAR) + '%'",
                    new { fecha, nuevoCicloId, usuarioIdControl, usuarioId, id });

                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_COMPANIAS
                    SET Fecha = @fecha,
                        FechaSalida = CASE WHEN FechaSalida IS NOT NULL THEN @fecha ELSE FechaSalida END,
                        FechaEntrega = CASE WHEN FechaEntrega IS NOT NULL THEN @fecha ELSE FechaEntrega END,
                        CicloId = ISNULL(@nuevoCicloId, CicloId),
                        UsuarioId = @usuarioIdControl,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE ControlRutaId = @id
                       OR Observacion LIKE '%#' + CAST(@id AS VARCHAR) + '%'
                       OR Observacion LIKE '%Viaje #' + CAST(@id AS VARCHAR) + '%'",
                    new { fecha, nuevoCicloId, usuarioIdControl, usuarioId, id });

                // Registrar en log de modificaciones si hubo cambio de fecha
                if (dto.Fecha.HasValue && dto.Fecha.Value.Date != ((DateTime)control.Fecha).Date)
                {
                    var fechaAntStr = ((DateTime)control.Fecha).ToString("yyyy-MM-dd");
                    var fechaNueStr = fecha.ToString("yyyy-MM-dd");
                    try
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                            (ControlRutaId, TipoEntidad, EntidadId, TipoAccion, ValoresAnteriores, ValoresNuevos, Motivo, UsuarioId, Fecha)
                            VALUES (@id, 'TICKET', @id, 'EDITAR_FECHA', @fechaAntStr, @fechaNueStr, 'Cambio de fecha de ticket y sincronizaciÃ³n en cascada a fincas', @usuarioId, GETDATE());",
                            new { id, fechaAntStr, fechaNueStr, usuarioId });
                    }
                    catch { }
                }
            }

            if (dto.ProcesoActualId.HasValue && dto.ProcesoActualId.Value != (int?)control.ProcesoActualId)
            {
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                    VALUES (@id, @procesoId, GETDATE(), @usuarioId, @obs);",
                    new { id, procesoId = dto.ProcesoActualId.Value, usuarioId, obs = dto.Observacion ?? "Cambio de proceso en ediciÃ³n" });
            }

            return rows > 0;
        }

        public async Task<bool> AsignarRutasLogisticasAsync(long id, AsignarRutasTicketDto dto, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var control = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @id", new { id });
            if (control == null) return false;

            if (rol == "CHOFER" && (int)control.UsuarioId != usuarioId)
                throw new UnauthorizedAccessException("No tienes permiso para modificar rutas de otro chofer.");

            int? primaryRutaId = dto.RutaLogisticaId;
            if (dto.RutasLogisticasIds != null && dto.RutasLogisticasIds.Any(x => x > 0))
            {
                if (!primaryRutaId.HasValue || primaryRutaId.Value <= 0)
                {
                    primaryRutaId = dto.RutasLogisticasIds.First(x => x > 0);
                }
            }
            if (primaryRutaId.HasValue && primaryRutaId.Value <= 0) primaryRutaId = null;

            string obsActual = (string?)control.Observacion ?? string.Empty;
            obsActual = Regex.Replace(obsActual, @"\s*\[RUTAS:[^\]]*\]", "").Trim();

            if (dto.RutasLogisticasIds != null && dto.RutasLogisticasIds.Any(x => x > 0))
            {
                var validIds = dto.RutasLogisticasIds.Where(x => x > 0).Distinct().ToList();
                obsActual = $"{obsActual} [RUTAS:{string.Join(",", validIds)}]".Trim();
            }
            else if (primaryRutaId.HasValue && primaryRutaId.Value > 0)
            {
                obsActual = $"{obsActual} [RUTAS:{primaryRutaId.Value}]".Trim();
            }

            if (!string.IsNullOrWhiteSpace(dto.Observacion))
            {
                obsActual = $"{obsActual} {dto.Observacion.Trim()}".Trim();
            }

            var rows = await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET RutaLogisticaId = @primaryRutaId,
                    Observacion = @obsActual,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @id",
                new { primaryRutaId, obsActual, usuarioId, id });

            return rows > 0;
        }

        public async Task<bool> EliminarControlAsync(long id, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var control = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @id", new { id });
            if (control == null) return false;

            if (rol == "CHOFER")
            {
                if ((int)control.UsuarioId != usuarioId)
                    throw new UnauthorizedAccessException("No tienes permiso para eliminar controles de otros conductores.");

                string estadoActual = ((string)control.Estado ?? "").Trim().ToUpper();
                int procesoId = control.ProcesoActualId != null ? (int)control.ProcesoActualId : 0;
                bool esAbierto = (estadoActual == "ABIERTO" || estadoActual == "PENDIENTE" || procesoId == 1) && procesoId != 2 && procesoId != 3 && procesoId != 4;
                if (!esAbierto)
                    throw new InvalidOperationException("Los choferes solo pueden eliminar tickets en estado ABIERTO.");
            }

            // Eliminar registros de fincas vinculados a este ticket de ruta, entregas en receptorÃ­a/compaÃ±Ã­as y su historial
            var choferId = (int)control.UsuarioId;
            var fecha = (DateTime)control.Fecha;

            // Desvincular de planificaciones activas
            try { await connection.ExecuteAsync("UPDATE TB_PLANIFICACION_RUTAS_CHOFERES SET ControlRutaId = NULL WHERE ControlRutaId = @id", new { id }); } catch { }

            // Limpiar logs y tablas hijas con FK hacia TB_CONTROL_RUTAS (ej: FK_LogModificacionesControl_Ticket)
            try { await connection.ExecuteAsync("DELETE FROM TB_LOG_MODIFICACIONES_CONTROL WHERE ControlRutaId = @id", new { id }); } catch { }
            try { await connection.ExecuteAsync("DELETE FROM TB_HISTORIAL_PROCESOS_TICKET WHERE ControlRutaId = @id", new { id }); } catch { }
            try { await connection.ExecuteAsync("DELETE FROM TB_NOTIFICACIONES_PUSH WHERE TicketId = @id", new { id }); } catch { }

            await connection.ExecuteAsync("DELETE FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @id", new { id });
            await connection.ExecuteAsync(@"
                DELETE FROM TB_ENTREGAS_COMPANIA 
                WHERE ControlRutaId = @id 
                   OR Observacion LIKE '%#' + CAST(@id AS VARCHAR) + '%'
                   OR Observacion LIKE '%Viaje #' + CAST(@id AS VARCHAR) + '%'", new { id });
            await connection.ExecuteAsync(@"
                DELETE FROM TB_CONTROL_COMPANIAS 
                WHERE Observacion LIKE '%#' + CAST(@id AS VARCHAR) + '%'
                   OR Observacion LIKE '%Viaje #' + CAST(@id AS VARCHAR) + '%'", new { id });
            var rows = await connection.ExecuteAsync("DELETE FROM TB_CONTROL_RUTAS WHERE Id = @id", new { id });
            return rows > 0;
        }

        public async Task<IEnumerable<ProcesoTicketDto>> ObtenerProcesosDisponiblesAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT Id, Codigo, Nombre, Descripcion, Orden, Color, Icono, Activo
                FROM TB_PROCESOS_TICKET
                WHERE Activo = 1
                ORDER BY Orden ASC";
            return await connection.QueryAsync<ProcesoTicketDto>(sql);
        }

        public async Task<bool> CambiarProcesoAsync(long controlId, int procesoId, int usuarioId, string? observacion)
        {
            using var connection = new SqlConnection(_connectionString);
            var control = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT Id, ProcesoActualId FROM TB_CONTROL_RUTAS WHERE Id = @controlId", new { controlId });
            if (control == null) return false;

            var proceso = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT Id, Codigo, Nombre FROM TB_PROCESOS_TICKET WHERE Id = @procesoId AND Activo = 1", new { procesoId });
            if (proceso == null) throw new InvalidOperationException("El proceso seleccionado no existe o no estÃ¡ activo.");

            var rows = await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET ProcesoActualId = @procesoId,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @controlId",
                new { procesoId, usuarioId, controlId });

            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@controlId, @procesoId, GETDATE(), @usuarioId, @observacion);",
                new { controlId, procesoId, usuarioId, observacion });

            return rows > 0;
        }

        public async Task<IEnumerable<HistorialProcesoTicketDto>> ObtenerHistorialProcesosAsync(long controlId)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    h.Id,
                    h.ControlRutaId,
                    h.ProcesoId,
                    pt.Codigo AS CodigoProceso,
                    pt.Nombre AS NombreProceso,
                    pt.Color AS ColorProceso,
                    pt.Icono AS IconoProceso,
                    h.FechaCambio,
                    h.CambiadoPor,
                    u.NombreCompleto AS NombreUsuario,
                    h.Observacion
       
                    h.CambiadoPor,
                    u.NombreCompleto AS NombreUsuario,
                    h.Observacion
                FROM TB_HISTORIAL_PROCESOS_TICKET h
                INNER JOIN TB_PROCESOS_TICKET pt ON h.ProcesoId = pt.Id
                INNER JOIN TB_USUARIOS u ON h.CambiadoPor = u.Id
                WHERE h.ControlRutaId = @controlId
                ORDER BY h.FechaCambio DESC, h.Id DESC";
            return await connection.QueryAsync<HistorialProcesoTicketDto>(sql, new { controlId });
        }

        // =====================================================================
        // MÃ‰TODOS DEL NUEVO FLUJO LOGÃSTICO (AGENTS_2)
        // =====================================================================

        public async Task<ControlRutaDto?> ObtenerViajeActivoChoferAsync(int choferId)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT TOP 1 
                    cr.Id, cr.Fecha, cr.UsuarioId, u.NombreCompleto AS NombreConductor,
                    cr.CicloId, cr.TotalLitrosFinca, cr.TotalLitrosReceptoria,
                    cr.DiferenciaLitros, cr.PorcentajeMerma, cr.Estado, cr.Observacion, cr.CreatedAt,
                    cr.ProcesoActualId,
                    pt.Codigo AS CodigoProceso,
                    pt.Nombre AS NombreProceso,
                    pt.Color AS ColorProceso,
                    pt.Icono AS IconoProceso,
                    cr.RutaLogisticaId,
                    COALESCE(rl.Nombre, CASE WHEN cr.Observacion LIKE '%[ENTRADA TERCERO]%' THEN (SELECT TOP 1 f.Nombre FROM TB_RUTAS_RECOLECCION rr INNER JOIN TB_FINCAS f ON rr.FincaId = f.Id WHERE rr.ControlRutaId = cr.Id) ELSE NULL END) AS RutaLogisticaNombre,
                    COALESCE(cam.Id, cam_plan.Id) AS CamionId,
                    COALESCE(cam.Placa, cam_plan.Placa) AS CamionPlaca,
                    COALESCE(cam.CapacidadLitros, cam_plan.CapacidadLitros) AS CapacidadCamionLitros,
                    cr.TipoDestino,
                    cr.LitrosRecibidosReceptoria,
                    cr.DiferenciaReceptoria,
                    cr.LitrosCargadosAdicional,
                    cr.CompaniaDestinoId,
                    cp.Nombre AS NombreCompaniaDestino,
                    cr.LitrosEntregadosCompania,
                    cr.DiferenciaCompania,
                    cr.MermaTotalLitros,
                    cr.FechaLlegadaReceptoria,
                    cr.FechaEntregaCompania,
                    cr.CerradoPor,
                    uc.NombreCompleto AS NombreCerradoPor,
                    (SELECT COUNT(*) FROM TB_RUTAS_RECOLECCION r WHERE r.ControlRutaId = cr.Id) AS TotalFincas
                FROM TB_CONTROL_RUTAS cr
                INNER JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                LEFT JOIN TB_PROCESOS_TICKET pt ON cr.ProcesoActualId = pt.Id
                LEFT JOIN TB_COMPANIAS cp ON cr.CompaniaDestinoId = cp.Id
                LEFT JOIN TB_USUARIOS uc ON cr.CerradoPor = uc.Id
                LEFT JOIN TB_RUTAS_LOGISTICA rl ON cr.RutaLogisticaId = rl.Id
                LEFT JOIN TB_CAMIONES cam ON cam.UsuarioId = cr.UsuarioId AND cam.Activo = 1
                LEFT JOIN TB_PLANIFICACION_RUTAS_CHOFERES plc ON plc.ControlRutaId = cr.Id AND plc.Activo = 1
                LEFT JOIN TB_CAMIONES cam_plan ON cam_plan.Id = plc.CamionId
                WHERE cr.UsuarioId = @choferId 
                  AND UPPER(ISNULL(cr.Estado, '')) NOT IN ('FINALIZADO', 'CERRADO', 'ENTREGADO', 'CUADRADO')
                  AND ISNULL(cr.ProcesoActualId, 1) < 4
                ORDER BY cr.Fecha DESC, cr.Id DESC";

            var viaje = await connection.QueryFirstOrDefaultAsync<ControlRutaDto>(sql, new { choferId });
            if (viaje != null)
            {
                var fincasPlanSql = @"
                    SELECT TOP 1 FincasIds 
                    FROM TB_PLANIFICACION_RUTAS_CHOFERES 
                    WHERE (ControlRutaId = @TicketId OR (Fecha = @Fecha AND ConductorId = @ChoferId)) AND Activo = 1 
                    ORDER BY CASE WHEN ControlRutaId = @TicketId THEN 0 ELSE 1 END, Id DESC";
                var fincasStr = await connection.ExecuteScalarAsync<string?>(fincasPlanSql, new { TicketId = viaje.Id, Fecha = viaje.Fecha.Date, ChoferId = choferId });
                if (!string.IsNullOrWhiteSpace(fincasStr))
                {
                    viaje.FincasPlanificadasIds = fincasStr
                        .Split(',', StringSplitOptions.RemoveEmptyEntries)
                        .Select(s => int.TryParse(s.Trim(), out var val) ? val : 0)
                        .Where(x => x > 0)
                        .ToList();
                }
            }
            return viaje;
        }

        public async Task<IEnumerable<ControlRutaDto>> ObtenerViajesActivosChoferAsync(int choferId, DateTime? fecha = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    cr.Id, cr.Fecha, cr.UsuarioId, u.NombreCompleto AS NombreConductor,
                    cr.CicloId, 
                    COALESCE(
                        NULLIF(cr.TotalLitrosFinca, 0),
                        (SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r WHERE (r.ControlRutaId = cr.Id OR (r.ControlRutaId IS NULL AND r.UsuarioId = cr.UsuarioId AND CAST(r.Fecha AS DATE) = CAST(cr.Fecha AS DATE)))),
                        0
                    ) AS TotalLitrosFinca, 
                    cr.TotalLitrosReceptoria,
                    cr.DiferenciaLitros, cr.PorcentajeMerma, cr.Estado, cr.Observacion, cr.CreatedAt,
                    cr.ProcesoActualId,
                    pt.Codigo AS CodigoProceso,
                    pt.Nombre AS NombreProceso,
                    pt.Color AS ColorProceso,
                    pt.Icono AS IconoProceso,
                    cr.RutaLogisticaId,
                    COALESCE(rl.Nombre, CASE WHEN cr.Observacion LIKE '%[ENTRADA TERCERO]%' THEN (SELECT TOP 1 f.Nombre FROM TB_RUTAS_RECOLECCION rr INNER JOIN TB_FINCAS f ON rr.FincaId = f.Id WHERE rr.ControlRutaId = cr.Id) ELSE NULL END) AS RutaLogisticaNombre,
                    COALESCE(cam.Id, cam_plan.Id) AS CamionId,
                    COALESCE(cam.Placa, cam_plan.Placa) AS CamionPlaca,
                    COALESCE(cam.CapacidadLitros, cam_plan.CapacidadLitros) AS CapacidadCamionLitros,
                    cr.TipoDestino,
                    cr.LitrosRecibidosReceptoria,
                    cr.DiferenciaReceptoria,
                    cr.LitrosCargadosAdicional,
                    cr.CompaniaDestinoId,
                    cp.Nombre AS NombreCompaniaDestino,
                    cr.LitrosEntregadosCompania,
                    cr.DiferenciaCompania,
                    cr.MermaTotalLitros,
                    cr.FechaLlegadaReceptoria,
                    cr.FechaEntregaCompania,
                    cr.CerradoPor,
                    uc.NombreCompleto AS NombreCerradoPor,
                    (SELECT COUNT(*) FROM TB_RUTAS_RECOLECCION r WHERE r.ControlRutaId = cr.Id) AS TotalFincas
                FROM TB_CONTROL_RUTAS cr
                INNER JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                LEFT JOIN TB_PROCESOS_TICKET pt ON cr.ProcesoActualId = pt.Id
                LEFT JOIN TB_COMPANIAS cp ON cr.CompaniaDestinoId = cp.Id
                LEFT JOIN TB_USUARIOS uc ON cr.CerradoPor = uc.Id
                LEFT JOIN TB_RUTAS_LOGISTICA rl ON cr.RutaLogisticaId = rl.Id
                LEFT JOIN TB_CAMIONES cam ON cam.UsuarioId = cr.UsuarioId AND cam.Activo = 1
                LEFT JOIN TB_PLANIFICACION_RUTAS_CHOFERES plc ON plc.ControlRutaId = cr.Id AND plc.Activo = 1
                LEFT JOIN TB_CAMIONES cam_plan ON cam_plan.Id = plc.CamionId
                WHERE cr.UsuarioId = @choferId 
                  AND (
                      (@fecha IS NOT NULL AND CAST(cr.Fecha AS DATE) = CAST(@fecha AS DATE))
                      OR (
                          @fecha IS NULL AND (
                              CAST(cr.Fecha AS DATE) = CAST(DATEADD(hour, -4, GETUTCDATE()) AS DATE)
                              OR (
                                  UPPER(ISNULL(cr.Estado, '')) NOT IN ('FINALIZADO', 'CERRADO') 
                                  AND ISNULL(cr.ProcesoActualId, 1) < 4
                                  AND DATEDIFF(day, cr.Fecha, DATEADD(hour, -4, GETUTCDATE())) <= 30
                              )
                          )
                      )
                  )
                ORDER BY cr.Fecha DESC, cr.Id ASC";

            var viajes = (await connection.QueryAsync<ControlRutaDto>(sql, new { choferId, fecha })).ToList();
            
            foreach (var v in viajes)
            {
                var fincasPlanSql = @"
                    SELECT TOP 1 FincasIds 
                    FROM TB_PLANIFICACION_RUTAS_CHOFERES 
                    WHERE (ControlRutaId = @TicketId OR (Fecha = @Fecha AND ConductorId = @ChoferId)) AND Activo = 1 
                    ORDER BY CASE WHEN ControlRutaId = @TicketId THEN 0 ELSE 1 END, Id DESC";
                var fincasStr = await connection.ExecuteScalarAsync<string?>(fincasPlanSql, new { TicketId = v.Id, Fecha = v.Fecha.Date, ChoferId = choferId });
                if (!string.IsNullOrWhiteSpace(fincasStr))
                {
                    v.FincasPlanificadasIds = fincasStr
                        .Split(',', StringSplitOptions.RemoveEmptyEntries)
                        .Select(s => int.TryParse(s.Trim(), out var val) ? val : 0)
                        .Where(x => x > 0)
                        .ToList();
                }
            }

            return viajes;
        }

        public async Task<long> CrearNuevoViajeAsync(CrearViajeDto dto, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var fecha = (dto.Fecha ?? DateTime.Today).Date;

            // Idempotencia: un turno iniciado desde el mÃ³vil (posiblemente sin internet) lleva una marca Ãºnica [LOCAL:uuid].
            // Si ese mismo turno llega mÃ¡s de una vez (reintento, seÃ±al dÃ©bil, doble envÃ­o) se devuelve el ticket ya creado.
            var marcaLocal = System.Text.RegularExpressions.Regex.Match(dto.Observacion ?? string.Empty, @"\[LOCAL:[A-Za-z0-9\-]{8,64}\]");
            if (marcaLocal.Success)
            {
                var ticketExistente = await connection.ExecuteScalarAsync<long?>(
                    "SELECT TOP 1 Id FROM TB_CONTROL_RUTAS WHERE CHARINDEX(@marca, Observacion) > 0 ORDER BY Id",
                    new { marca = marcaLocal.Value });
                if (ticketExistente.HasValue && ticketExistente.Value > 0)
                    return ticketExistente.Value;
            }

            int conductorEfectivo = 0;
            if (rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) || rol.Equals("SUPERVISOR", StringComparison.OrdinalIgnoreCase))
            {
                if (dto.ConductorId.HasValue && dto.ConductorId.Value > 0)
                {
                    conductorEfectivo = dto.ConductorId.Value;
                }
                else if (dto.CamionId.HasValue && dto.CamionId.Value > 0)
                {
                    var choferDelCamion = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 UsuarioId FROM TB_CAMIONES WHERE Id = @camionId AND UsuarioId IS NOT NULL",
                        new { camionId = dto.CamionId.Value });
                    if (choferDelCamion.HasValue && choferDelCamion.Value > 0)
                    {
                        conductorEfectivo = choferDelCamion.Value;
                    }
                }

                if (conductorEfectivo <= 0)
                {
                    var choferDefault = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_USUARIOS WHERE UPPER(Rol) = 'CHOFER' AND Activo = 1 ORDER BY NombreCompleto");
                    conductorEfectivo = choferDefault ?? usuarioId;
                }
            }
            else
            {
                conductorEfectivo = usuarioId;
            }

            var esChoferValido = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM TB_USUARIOS WHERE Id = @conductorId AND Activo = 1",
                new { conductorId = conductorEfectivo });
            if (esChoferValido == 0)
            {
                conductorEfectivo = usuarioId;
            }

            // Regla para CHOFER: No puede crear un segundo ticket mientras tenga uno ABIERTO en recolecciÃ³n (ProcesoActualId = 1)
            bool esAdminOSuperCrear = rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) || rol.Equals("SUPERVISOR", StringComparison.OrdinalIgnoreCase);
            if (!esAdminOSuperCrear)
            {
                var abiertoEnRuta = await connection.QueryFirstOrDefaultAsync<dynamic>(@"
                    SELECT TOP 1 cr.Id, cr.TotalLitrosFinca,
                           (SELECT COUNT(1) FROM TB_RUTAS_RECOLECCION r WHERE r.ControlRutaId = cr.Id) AS TotalParadas
                    FROM TB_CONTROL_RUTAS cr
                    WHERE cr.UsuarioId = @conductorEfectivo
                      AND CAST(cr.Fecha AS DATE) = @fecha
                      AND ISNULL(cr.ProcesoActualId, 1) = 1
                      AND UPPER(ISNULL(cr.Estado, '')) NOT IN ('FINALIZADO', 'CERRADO')
                    ORDER BY cr.Id DESC",
                    new { conductorEfectivo, fecha });

                if (abiertoEnRuta != null)
                {
                    long idAbierto = (long)abiertoEnRuta.Id;
                    int totalParadas = (int)abiertoEnRuta.TotalParadas;
                    decimal totalLitros = (decimal)(abiertoEnRuta.TotalLitrosFinca ?? 0m);

                    if (totalParadas == 0 && totalLitros == 0)
                    {
                        // Reutilizar el ticket vacÃ­o abierto en lugar de duplicar tickets en 0 L
                        if (dto.RutaLogisticaId.HasValue && dto.RutaLogisticaId.Value > 0)
                        {
                            await connection.ExecuteAsync(
                                "UPDATE TB_CONTROL_RUTAS SET RutaLogisticaId = COALESCE(RutaLogisticaId, @rutaId), ModifiedAt = GETDATE() WHERE Id = @id",
                                new { rutaId = dto.RutaLogisticaId.Value, id = idAbierto });
                        }
                        return idAbierto;
                    }

                    throw new InvalidOperationException($"Ya tienes el Ticket #{idAbierto} abierto en recolecciÃ³n. Debes enviarlo a ReceptorÃ­a/Planta antes de iniciar uno nuevo.");
                }
            }

            // Validar si el ciclo operativo correspondiente a la fecha estÃ¡ cerrado
            var cicloFecha = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT TOP 1 Id, Codigo, Estado, FechaInicio, FechaFin 
                  FROM TB_CICLOS_OPERATIVOS 
                  WHERE @fecha >= CAST(FechaInicio AS DATE) AND @fecha <= CAST(FechaFin AS DATE)",
                new { fecha });

            if (cicloFecha != null && string.Equals((string)cicloFecha.Estado, "CERRADO", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"No se puede iniciar el viaje. El ciclo operativo ({cicloFecha.Codigo}) para la fecha {fecha:dd/MM/yyyy} se encuentra CERRADO.");
            }

            int? cicloId = cicloFecha?.Id;
            if (!cicloId.HasValue)
            {
                cicloId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC");
            }

            var primaryRutaId = dto.RutaLogisticaId;
            var observacionFinal = dto.Observacion ?? "Viaje iniciado por el chofer";
            if (dto.RutasLogisticasIds != null && dto.RutasLogisticasIds.Any())
            {
                if (!primaryRutaId.HasValue || primaryRutaId.Value <= 0)
                {
                    primaryRutaId = dto.RutasLogisticasIds.First();
                }
                var rutasTag = $"[RUTAS:{string.Join(",", dto.RutasLogisticasIds)}]";
                if (!observacionFinal.Contains("[RUTAS:"))
                {
                    observacionFinal = $"{rutasTag} {observacionFinal}".Trim();
                }
            }

            var sqlInsert = @"
                INSERT INTO TB_CONTROL_RUTAS
                (Fecha, UsuarioId, CicloId, TotalLitrosFinca, TotalLitrosReceptoria, DiferenciaLitros, PorcentajeMerma, Estado, ProcesoActualId, RutaLogisticaId, Observacion, CreatedAt, CreatedBy)
                VALUES (@fecha, @conductorEfectivo, @cicloId, 0, 0, 0, 0, 'ABIERTO', 1, @rutaLogisticaId, @observacion, DATEADD(hour, -4, GETUTCDATE()), @usuarioId);
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

            var nuevoId = await connection.ExecuteScalarAsync<long>(sqlInsert, new
            {
                fecha, conductorEfectivo, cicloId, 
                rutaLogisticaId = primaryRutaId,
                observacion = observacionFinal, usuarioId
            });

            // Si se especificÃ³ un CamionId, asociarlo a la planificaciÃ³n del viaje para que la cisterna figure en la App
            if (nuevoId > 0 && dto.CamionId.HasValue && dto.CamionId.Value > 0)
            {
                try
                {
                    await connection.ExecuteAsync(@"
                        IF NOT EXISTS (SELECT 1 FROM TB_PLANIFICACION_RUTAS_CHOFERES WHERE ControlRutaId = @nuevoId)
                        BEGIN
                            INSERT INTO TB_PLANIFICACION_RUTAS_CHOFERES
                            (Fecha, CamionId, ConductorId, RutaLogisticaId, ControlRutaId, Observacion, Activo, CreatedAt)
                            VALUES
                            (@fecha, @camionId, @conductorEfectivo, @primaryRutaId, @nuevoId, @obs, 1, DATEADD(hour, -4, GETUTCDATE()));
                        END",
                        new { fecha, camionId = dto.CamionId.Value, conductorEfectivo, primaryRutaId, nuevoId, obs = observacionFinal });
                }
                catch { /* Tolerante */ }
            }

            // Guardar lista de fincas planificadas del viaje en TB_PLANIFICACION_RUTAS_CHOFERES (SIN pre-insertar filas Litros=0 en TB_RUTAS_RECOLECCION)
            if (nuevoId > 0)
            {
                var fincasInicialesIds = new List<int>();
                if (dto.FincaIds != null && dto.FincaIds.Any())
                {
                    fincasInicialesIds.AddRange(dto.FincaIds);
                }
                else
                {
                    var rutasAConsultar = new List<int>();
                    if (primaryRutaId.HasValue && primaryRutaId.Value > 0) rutasAConsultar.Add(primaryRutaId.Value);
                    if (dto.RutasLogisticasIds != null && dto.RutasLogisticasIds.Any()) rutasAConsultar.AddRange(dto.RutasLogisticasIds);
                    rutasAConsultar = rutasAConsultar.Distinct().ToList();

                    if (rutasAConsultar.Any())
                    {
                        var fIdsRuta = await connection.QueryAsync<int>(@"
                            SELECT DISTINCT f.Id
                            FROM TB_FINCAS f
                            LEFT JOIN TB_RUTAS_LOGISTICA_FINCAS rlf ON rlf.FincaId = f.Id
                            WHERE (f.RutaId IN @rutasAConsultar OR rlf.RutaLogisticaId IN @rutasAConsultar)
                              AND f.Activo = 1
                              AND (f.IsDeleted = 0 OR f.IsDeleted IS NULL)",
                            new { rutasAConsultar });
                        fincasInicialesIds.AddRange(fIdsRuta);
                    }
                }

                var fincasUnicas = fincasInicialesIds.Distinct().ToList();
                if (fincasUnicas.Any())
                {
                    var fincasStr = string.Join(",", fincasUnicas);
                    try
                    {
                        var camionEfectivoId = (dto.CamionId.HasValue && dto.CamionId.Value > 0)
                            ? dto.CamionId.Value
                            : (await connection.ExecuteScalarAsync<int?>("SELECT TOP 1 Id FROM TB_CAMIONES WHERE UsuarioId = @conductorEfectivo AND Activo = 1", new { conductorEfectivo }) ?? 0);

                        await connection.ExecuteAsync(@"
                            IF EXISTS (SELECT 1 FROM TB_PLANIFICACION_RUTAS_CHOFERES WHERE ControlRutaId = @nuevoId)
                            BEGIN
                                UPDATE TB_PLANIFICACION_RUTAS_CHOFERES
                                SET FincasIds = @fincasStr,
                                    TotalFincas = @totalFincas,
                                    RutaLogisticaId = COALESCE(RutaLogisticaId, @primaryRutaId),
                                    ModifiedAt = DATEADD(hour, -4, GETUTCDATE())
                                WHERE ControlRutaId = @nuevoId;
                            END
                            ELSE
                            BEGIN
                                INSERT INTO TB_PLANIFICACION_RUTAS_CHOFERES
                                (Fecha, CamionId, ConductorId, RutaLogisticaId, ControlRutaId, FincasIds, TotalFincas, Observacion, Activo, CreatedAt)
                                VALUES
                                (@fecha, @camionEfectivoId, @conductorEfectivo, @primaryRutaId, @nuevoId, @fincasStr, @totalFincas, @obs, 1, DATEADD(hour, -4, GETUTCDATE()));
                            END",
                            new { nuevoId, fincasStr, totalFincas = fincasUnicas.Count, primaryRutaId, fecha, camionEfectivoId, conductorEfectivo, obs = observacionFinal });
                    }
                    catch { /* Tolerante */ }
                }
            }

            // NotificaciÃ³n automÃ¡tica al chofer de asignaciÃ³n de ruta
            if (nuevoId > 0 && conductorEfectivo > 0)
            {
                try
                {
                    var nombresRutas = new List<string>();
                    if (dto.RutasLogisticasIds != null && dto.RutasLogisticasIds.Any())
                    {
                        var rNombres = await connection.QueryAsync<string>(
                            "SELECT Nombre FROM TB_RUTAS_LOGISTICA WHERE Id IN @ids",
                            new { ids = dto.RutasLogisticasIds });
                        nombresRutas.AddRange(rNombres);
                    }
                    else if (primaryRutaId.HasValue && primaryRutaId.Value > 0)
                    {
                        var rNom = await connection.QueryFirstOrDefaultAsync<string>(
                            "SELECT Nombre FROM TB_RUTAS_LOGISTICA WHERE Id = @id",
                            new { id = primaryRutaId.Value });
                        if (!string.IsNullOrWhiteSpace(rNom)) nombresRutas.Add(rNom);
                    }

                    var rutasStr = nombresRutas.Any() ? string.Join(", ", nombresRutas) : "Ruta General";

                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                        VALUES (@UsuarioId, 'RUTA_ASIGNADA', @Titulo, @Mensaje, @FechaOperativa, @ReferenciaId, 0, GETDATE())",
                        new
                        {
                            UsuarioId = conductorEfectivo,
                            Titulo = $"Nueva Ruta Asignada (Ticket #{nuevoId})",
                            Mensaje = $"Se te asignó la recolección para el {fecha:dd/MM/yyyy}. Rutas: {rutasStr}. Ticket #{nuevoId}.",
                            FechaOperativa = fecha,
                            ReferenciaId = nuevoId
                        });
                }
                catch { /* Tolerante */ }
            }

            // Registrar en historial inicial
            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@nuevoId, 1, GETDATE(), @usuarioId, 'Inicio de viaje / Apertura de ticket');",
                new { nuevoId, usuarioId });

            return nuevoId;
        }

        public async Task<ResultadoSyncPaqueteDto> SincronizarPaqueteTicketAsync(SincronizarPaqueteTicketDto dto, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureTableNotificacionesExistsAsync(connection);

            bool esAdminOSuper = rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) ||
                                 rol.Equals("SUPERVISOR", StringComparison.OrdinalIgnoreCase) ||
                                 rol.Equals("GERENTE", StringComparison.OrdinalIgnoreCase);

            int choferEfectivo = (esAdminOSuper && dto.ChoferId > 0) ? dto.ChoferId : usuarioId;
            if (!esAdminOSuper && dto.ChoferId > 0 && dto.ChoferId != usuarioId)
            {
                throw new UnauthorizedAccessException("No tienes permiso para sincronizar un paquete de otro chofer.");
            }

            var fechaPaquete = dto.Fecha.Date;
            long ticketId = 0;
            bool creadoNuevo = false;

            // CASO 1: El paquete trae un TicketId real (#111111) -> buscarlo y validar estrictamente Chofer + Fecha
            if (dto.TicketId.HasValue && dto.TicketId.Value > 0)
            {
                var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT Id, UsuarioId, Fecha, ProcesoActualId, RutaLogisticaId FROM TB_CONTROL_RUTAS WHERE Id = @id",
                    new { id = dto.TicketId.Value });

                if (viaje == null)
                    throw new InvalidOperationException($"El Ticket #{dto.TicketId.Value} no existe en la base de datos.");

                if ((int)viaje.UsuarioId != choferEfectivo)
                    throw new InvalidOperationException($"El Ticket #{dto.TicketId.Value} pertenece a otro chofer.");

                if (((DateTime)viaje.Fecha).Date != fechaPaquete)
                    throw new InvalidOperationException($"La fecha del Ticket #{dto.TicketId.Value} ({((DateTime)viaje.Fecha):dd/MM/yyyy}) no coincide con la fecha del paquete ({fechaPaquete:dd/MM/yyyy}).");

                if ((int)viaje.ProcesoActualId != 1)
                    throw new InvalidOperationException($"El Ticket #{dto.TicketId.Value} ya no estÃ¡ ABIERTO.");

                ticketId = (long)viaje.Id;

                if (string.Equals(dto.Modo, "RUTA", StringComparison.OrdinalIgnoreCase) && dto.RutaLogisticaId.HasValue && dto.RutaLogisticaId.Value > 0 && viaje.RutaLogisticaId == null)
                {
                    await connection.ExecuteAsync(
                        "UPDATE TB_CONTROL_RUTAS SET RutaLogisticaId = @rutaId, ModifiedAt = GETDATE(), ModifiedBy = @usuarioId WHERE Id = @ticketId",
                        new { rutaId = dto.RutaLogisticaId.Value, usuarioId, ticketId });
                }
            }
            else
            {
                // CASO 2: Ticket creado sin internet (sin #TicketId real)
                // 2.1 Idempotencia por marca [LOCAL:uuid]
                if (!string.IsNullOrWhiteSpace(dto.LocalUuid))
                {
                    var marca = dto.LocalUuid.StartsWith("[LOCAL:") ? dto.LocalUuid : $"[LOCAL:{dto.LocalUuid}]";
                    var existentePorUuid = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT TOP 1 Id, UsuarioId, Fecha, ProcesoActualId FROM TB_CONTROL_RUTAS WHERE CHARINDEX(@marca, Observacion) > 0 ORDER BY Id",
                        new { marca });

                    if (existentePorUuid != null)
                    {
                        if ((int)existentePorUuid.UsuarioId != choferEfectivo || ((DateTime)existentePorUuid.Fecha).Date != fechaPaquete)
                            throw new InvalidOperationException("El identificador local corresponde a un ticket de otro chofer o fecha.");

                        ticketId = (long)existentePorUuid.Id;
                    }
                }

                // 2.2 ValidaciÃ³n previa: si no hay TicketId pero ya existe un ticket abierto para el mismo Chofer + Fecha con alguna de estas Fincas
                if (ticketId <= 0 && dto.Fincas != null && dto.Fincas.Any())
                {
                    var fincaIds = dto.Fincas.Select(f => f.FincaId).Where(id => id > 0).Distinct().ToList();
                    if (fincaIds.Any())
                    {
                        var existentePorFincas = await connection.ExecuteScalarAsync<long?>(@"
                            SELECT TOP 1 cr.Id
                            FROM TB_CONTROL_RUTAS cr
                            INNER JOIN TB_RUTAS_RECOLECCION r ON r.ControlRutaId = cr.Id
                            WHERE cr.UsuarioId = @choferEfectivo
                              AND CAST(cr.Fecha AS DATE) = @fechaPaquete
                              AND cr.ProcesoActualId = 1
                              AND r.FincaId IN @fincaIds
                            ORDER BY cr.Id DESC",
                            new { choferEfectivo, fechaPaquete, fincaIds });

                        if (existentePorFincas.HasValue && existentePorFincas.Value > 0)
                        {
                            ticketId = existentePorFincas.Value;
                        }
                    }
                }

                // 2.3 Si no existÃ­a, crear el ticket completo ahora
                if (ticketId <= 0)
                {
                    var obsMarca = !string.IsNullOrWhiteSpace(dto.LocalUuid)
                        ? (dto.LocalUuid.StartsWith("[LOCAL:") ? dto.LocalUuid : $"[LOCAL:{dto.LocalUuid}]")
                        : string.Empty;
                    var obsCompleta = $"{obsMarca} {dto.Observacion ?? "Viaje sincronizado desde App MÃ³vil"}".Trim();

                    var crearDto = new CrearViajeDto
                    {
                        Fecha = fechaPaquete,
                        ConductorId = choferEfectivo,
                        CamionId = dto.CamionId,
                        RutaLogisticaId = string.Equals(dto.Modo, "RUTA", StringComparison.OrdinalIgnoreCase) ? dto.RutaLogisticaId : null,
                        Observacion = obsCompleta
                    };
                    ticketId = await CrearNuevoViajeAsync(crearDto, usuarioId, rol);
                    creadoNuevo = true;
                }
            }

            int fincasSincronizadas = 0;
            if (ticketId > 0 && dto.Fincas != null && dto.Fincas.Any())
            {
                foreach (var f in dto.Fincas)
                {
                    if (f.FincaId <= 0) continue;
                    var fincaDto = new AgregarFincaViajeDto
                    {
                        ControlRutaId = ticketId,
                        ChoferId = choferEfectivo,
                        FincaId = f.FincaId,
                        Litros = f.Litros,
                        EsAcida = f.EsAcida,
                        TipoLeche = f.TipoLeche,
                        EsDiferido = f.EsDiferido,
                        Fecha = fechaPaquete,
                        Hora = f.Hora,
                        Observacion = f.Observacion,
                        FotoComprobante = f.FotoComprobante,
                        Latitud = f.Latitud,
                        Longitud = f.Longitud,
                        PrecisionMetros = f.PrecisionMetros
                    };
                    await AgregarFincaAViajeAsync(fincaDto, usuarioId, rol);
                    fincasSincronizadas++;
                }
            }

            return new ResultadoSyncPaqueteDto
            {
                TicketId = ticketId,
                FincasSincronizadas = fincasSincronizadas,
                CreadoNuevo = creadoNuevo,
                Mensaje = creadoNuevo
                    ? $"Ticket #{ticketId} creado y sincronizado con {fincasSincronizadas} finca(s)."
                    : $"Ticket #{ticketId} validado y actualizado con {fincasSincronizadas} finca(s)."
            };
        }

        /// <summary>
        /// Red de seguridad autocurativa: si un ticket tiene la misma finca registrada más de una vez
        /// con los mismos litros y el mismo tipo de leche, elimina los duplicados conservando el registro
        /// más completo (con foto/evidencia y el Id más reciente) y recalcula TotalLitrosFinca.
        /// </summary>
        private async Task<int> LimpiarDuplicadosExactosTicketAsync(
            SqlConnection connection,
            long controlRutaId,
            int? usuarioId = null,
            SqlTransaction? transaction = null)
        {
            var sqlDedup = @"
                ;WITH Duplicados AS (
                    SELECT
                        Id,
                        ROW_NUMBER() OVER (
                            PARTITION BY FincaId, UPPER(ISNULL(TipoLeche, 'VACA')), Litros
                            ORDER BY
                                CASE WHEN LEN(ISNULL(FotoComprobante, '')) > 0 THEN 0 ELSE 1 END ASC,
                                CASE WHEN LEN(ISNULL(FotosEvidenciaJson, '')) > 2 THEN 0 ELSE 1 END ASC,
                                Id DESC
                        ) AS rn
                    FROM TB_RUTAS_RECOLECCION
                    WHERE ControlRutaId = @controlRutaId
                      AND ISNULL(Litros, 0) > 0
                )
                DELETE FROM TB_RUTAS_RECOLECCION
                WHERE Id IN (SELECT Id FROM Duplicados WHERE rn > 1);";

            int eliminados = await connection.ExecuteAsync(sqlDedup, new { controlRutaId }, transaction: transaction);
            if (eliminados > 0)
            {
                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET TotalLitrosFinca = (SELECT ISNULL(SUM(Litros), 0) FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @controlRutaId),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = ISNULL(@usuarioId, ModifiedBy)
                    WHERE Id = @controlRutaId;",
                    new { controlRutaId, usuarioId },
                    transaction: transaction);
            }
            return eliminados;
        }

        public async Task<long> AgregarFincaAViajeAsync(AgregarFincaViajeDto dto, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await EnsureTableNotificacionesExistsAsync(connection);
            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @ControlRutaId", new { dto.ControlRutaId });
            if (viaje == null) throw new InvalidOperationException("El Viaje / Ticket no existe.");

            bool esAdminOSuper = rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) || 
                                 rol.Equals("SUPERVISOR", StringComparison.OrdinalIgnoreCase) ||
                                 rol.Equals("GERENTE", StringComparison.OrdinalIgnoreCase);

            if (!esAdminOSuper && rol.Equals("CHOFER", StringComparison.OrdinalIgnoreCase) && (int)viaje.UsuarioId != usuarioId)
                throw new UnauthorizedAccessException("No tienes permiso para agregar fincas a viajes de otro chofer.");

            if (dto.ChoferId.HasValue && dto.ChoferId.Value > 0 && (int)viaje.UsuarioId != dto.ChoferId.Value)
                throw new InvalidOperationException($"El Ticket #{dto.ControlRutaId} pertenece a otro chofer y no coincide con el paquete.");

            if (dto.Fecha.HasValue && ((DateTime)viaje.Fecha).Date != dto.Fecha.Value.Date)
                throw new InvalidOperationException($"La fecha del registro ({dto.Fecha.Value:dd/MM/yyyy}) no coincide con la fecha del Ticket #{dto.ControlRutaId} ({((DateTime)viaje.Fecha):dd/MM/yyyy}).");

            if ((int)viaje.ProcesoActualId != 1)
                throw new InvalidOperationException("El viaje no estÃ¡ en estado ABIERTO. No se pueden agregar mÃ¡s fincas.");

            // Obtener datos de la finca
            var finca = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT PrecioLitroUSD, PrecioLitroAcidaUSD, PropietarioId, TipoServicioId FROM TB_FINCAS WHERE Id = @FincaId",
                new { dto.FincaId });
            if (finca == null) throw new InvalidOperationException("La finca seleccionada no existe.");

            var tasaActual = await connection.ExecuteScalarAsync<decimal?>("SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC") ?? 1.0m;
            decimal precioAplicado = dto.EsAcida ? (decimal)(finca.PrecioLitroAcidaUSD ?? finca.PrecioLitroUSD ?? 0.0m) : (decimal)(finca.PrecioLitroUSD ?? 0.0m);

            DateTime fechaEfectiva = dto.Fecha ?? (DateTime)viaje.Fecha;
            string tipoLecheEfectivo = string.IsNullOrWhiteSpace(dto.TipoLeche) ? "VACA" : dto.TipoLeche.ToUpper();
            bool esDiferidoEfectivo = dto.EsDiferido;

            // Resolver CicloId y ChoferId efectivos para cumplir restricciones de NOT NULL en TB_RUTAS_RECOLECCION
            int? efectivoCicloId = (int?)viaje.CicloId;
            if (!efectivoCicloId.HasValue || efectivoCicloId.Value <= 0)
            {
                efectivoCicloId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaEfectiva >= CAST(FechaInicio AS DATE) AND @fechaEfectiva <= CAST(FechaFin AS DATE)",
                    new { fechaEfectiva });
                if (!efectivoCicloId.HasValue || efectivoCicloId.Value <= 0)
                {
                    efectivoCicloId = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS ORDER BY FechaInicio DESC") ?? 1;
                }
            }

            int efectivoChoferId = (int?)viaje.UsuarioId ?? usuarioId;

            DateTime createdAtEfectivo = DateTime.UtcNow.AddHours(-4);
            if (!string.IsNullOrWhiteSpace(dto.Hora))
            {
                var hStr = dto.Hora.Trim()
                    .Replace("a. m.", "AM", StringComparison.OrdinalIgnoreCase)
                    .Replace("p. m.", "PM", StringComparison.OrdinalIgnoreCase)
                    .Replace("a.m.", "AM", StringComparison.OrdinalIgnoreCase)
                    .Replace("p.m.", "PM", StringComparison.OrdinalIgnoreCase);
                if (DateTime.TryParse($"{fechaEfectiva:yyyy-MM-dd} {hStr}", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var parsedDt) ||
                    DateTime.TryParse($"{fechaEfectiva:yyyy-MM-dd} {hStr}", out parsedDt))
                {
                    createdAtEfectivo = parsedDt;
                }
            }

            int? cicloLiquidacionEfectivo = null;
            if (esDiferidoEfectivo && efectivoCicloId.HasValue)
            {
                int sigCiclo = await RutasRepository.ResolveSiguienteCicloAsync(connection, efectivoCicloId.Value);
                if (sigCiclo > 0) cicloLiquidacionEfectivo = sigCiclo;
            }

            // Bloqueo transaccional por (Ticket + Finca + TipoLeche) para impedir duplicados por race condition
            long nuevaRutaId;
            using (var tx = connection.BeginTransaction())
            {
                var lockResource = $"TICKET_FINCA_{dto.ControlRutaId}_{dto.FincaId}_{tipoLecheEfectivo}";
                await connection.ExecuteAsync(
                    "EXEC sp_getapplock @Resource = @lockResource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;",
                    new { lockResource },
                    transaction: tx);

                // Unificación Anti-Duplicados por (Ticket + Finca + TipoLeche):
                // Si la parada está en 0 litros (planificada) o ya existe con el MISMO TipoLeche (VACA/BUFALA), se actualiza;
                // si es de distinto TipoLeche (ej. ya tiene BUFALA y se agrega VACA), se inserta un registro separado en el mismo ticket.
                var paradaExistenteId = await connection.ExecuteScalarAsync<long?>(@"
                    SELECT TOP 1 Id FROM TB_RUTAS_RECOLECCION WITH (UPDLOCK, HOLDLOCK)
                    WHERE ControlRutaId = @controlRutaId AND FincaId = @fincaId
                      AND (Litros = 0 OR Litros IS NULL OR UPPER(ISNULL(TipoLeche, 'VACA')) = @tipoLeche)
                    ORDER BY CASE WHEN Litros = 0 OR Litros IS NULL THEN 0 ELSE 1 END ASC, Id DESC",
                    new { controlRutaId = dto.ControlRutaId, fincaId = dto.FincaId, tipoLeche = tipoLecheEfectivo },
                    transaction: tx);

                if (paradaExistenteId.HasValue)
                {
                    var sqlUpdateRuta = @"
                        UPDATE TB_RUTAS_RECOLECCION
                        SET Litros = @litros,
                            EsAcida = @esAcida,
                            TipoLeche = @tipoLeche,
                            EsDiferido = @esDiferido,
                            CicloLiquidacionId = @cicloLiquidacionId,
                            LitrosOriginales = CASE WHEN @esDiferido = 1 THEN @litros ELSE LitrosOriginales END,
                            PrecioLitroUSDAplicado = @precioAplicado,
                            TasaDolarBsAplicada = @tasaActual,
                            Observacion = @observacion,
                            FotoComprobante = ISNULL(@fotoComprobante, FotoComprobante),
                            FotosEvidenciaJson = ISNULL(@fotosEvidenciaJson, FotosEvidenciaJson),
                            CreatedAt = CASE WHEN CreatedAt IS NULL OR ISNULL(Litros, 0) = 0 OR CAST(CreatedAt AS DATE) != CAST(@fechaEfectiva AS DATE) THEN @createdAtEfectivo ELSE CreatedAt END,
                            ModifiedAt = @createdAtEfectivo,
                            ModifiedBy = @usuarioId
                        WHERE Id = @paradaExistenteId;

                        -- Limpieza preventiva de duplicados accidentales de la misma finca y MISMO tipo de leche en el ticket
                        DELETE FROM TB_RUTAS_RECOLECCION 
                        WHERE ControlRutaId = @controlRutaId 
                          AND FincaId = @fincaId 
                          AND UPPER(ISNULL(TipoLeche, 'VACA')) = @tipoLeche
                          AND Id != @paradaExistenteId;";

                    await connection.ExecuteAsync(sqlUpdateRuta, new
                    {
                        litros = dto.Litros,
                        esAcida = dto.EsAcida,
                        tipoLeche = tipoLecheEfectivo,
                        esDiferido = esDiferidoEfectivo,
                        cicloLiquidacionId = cicloLiquidacionEfectivo,
                        precioAplicado,
                        tasaActual,
                        observacion = dto.Observacion,
                        fotoComprobante = dto.FotoComprobante,
                        fotosEvidenciaJson = dto.FotosEvidenciaJson,
                        usuarioId,
                        controlRutaId = dto.ControlRutaId,
                        fincaId = dto.FincaId,
                        paradaExistenteId = paradaExistenteId.Value,
                        fechaEfectiva,
                        createdAtEfectivo
                    }, transaction: tx);
                    nuevaRutaId = paradaExistenteId.Value;
                }
                else
                {
                    var sqlInsertRuta = @"
                        INSERT INTO TB_RUTAS_RECOLECCION
                        (CicloId, Fecha, FincaId, UsuarioId, Litros, EsAcida, TipoLeche, EsDiferido, CicloLiquidacionId, LitrosOriginales, PrecioLitroUSDAplicado, TasaDolarBsAplicada, UuidLocal, Observacion, FotoComprobante, FotosEvidenciaJson, ControlRutaId, CreatedAt, CreatedBy, ModifiedAt, ModifiedBy)
                        VALUES (@cicloId, @fecha, @fincaId, @choferId, @litros, @esAcida, @tipoLeche, @esDiferido, @cicloLiquidacionId, CASE WHEN @esDiferido = 1 THEN @litros ELSE NULL END, @precioAplicado, @tasaActual, @uuidLocal, @observacion, @fotoComprobante, @fotosEvidenciaJson, @controlRutaId, @createdAtEfectivo, @usuarioId, @createdAtEfectivo, @usuarioId);
                        SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

                    nuevaRutaId = await connection.ExecuteScalarAsync<long>(sqlInsertRuta, new
                    {
                        cicloId = efectivoCicloId.Value,
                        fecha = fechaEfectiva,
                        fincaId = dto.FincaId,
                        choferId = efectivoChoferId,
                        litros = dto.Litros,
                        esAcida = dto.EsAcida,
                        tipoLeche = tipoLecheEfectivo,
                        esDiferido = esDiferidoEfectivo,
                        cicloLiquidacionId = cicloLiquidacionEfectivo,
                        precioAplicado,
                        tasaActual,
                        uuidLocal = Guid.NewGuid().ToString(),
                        observacion = dto.Observacion,
                        fotoComprobante = dto.FotoComprobante,
                        fotosEvidenciaJson = dto.FotosEvidenciaJson,
                        controlRutaId = dto.ControlRutaId,
                        createdAtEfectivo,
                        usuarioId
                    }, transaction: tx);
                }

                // Red de seguridad autocurativa: eliminar duplicados exactos (Finca + Litros + TipoLeche)
                await LimpiarDuplicadosExactosTicketAsync(connection, dto.ControlRutaId, usuarioId, tx);

                // Actualizar total litros finca en el viaje
                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET TotalLitrosFinca = (SELECT ISNULL(SUM(Litros), 0) FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @controlRutaId),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @controlRutaId",
                    new { dto.ControlRutaId, usuarioId },
                    transaction: tx);

                tx.Commit();
            }

            // Privacidad GPS: solo registrar coordenadas si el ticket estÃ¡ ABIERTO (ProcesoActualId = 1)
            if (dto.Latitud.HasValue && dto.Longitud.HasValue && (int)viaje.ProcesoActualId == 1)
            {
                try
                {
                    await connection.ExecuteAsync(@"
                        UPDATE TB_RUTAS_RECOLECCION
                        SET Latitud = @lat, Longitud = @lng, GpsCapturadoAt = @gpsAt
                        WHERE Id = @nuevaRutaId;

                        INSERT INTO TB_GPS_PUNTOS_VIAJE (ControlRutaId, UsuarioId, CamionId, FincaId, Latitud, Longitud, PrecisionMetros, Evento, FechaHoraDispositivo, CreatedAt)
                        VALUES (@controlRutaId, @choferId, (SELECT TOP 1 CamionId FROM TB_USUARIOS WHERE Id = @choferId), @fincaId, @lat, @lng, @precision, 'REGISTRO_LITROS', @gpsAt, GETDATE());",
                        new
                        {
                            lat = dto.Latitud.Value,
                            lng = dto.Longitud.Value,
                            precision = dto.PrecisionMetros,
                            gpsAt = createdAtEfectivo,
                            nuevaRutaId,
                            controlRutaId = dto.ControlRutaId,
                            choferId = (int)viaje.UsuarioId,
                            fincaId = dto.FincaId
                        });
                }
                catch { /* No bloquear guardado de litros si falla registro GPS */ }
            }

            // Notificar a supervisores y administradores que se agregÃ³ una finca a este ticket
            try
            {
                var nombreFinca = await connection.ExecuteScalarAsync<string>("SELECT Nombre FROM TB_FINCAS WHERE Id = @fincaId", new { fincaId = dto.FincaId }) ?? $"Finca #{dto.FincaId}";
                var choferNombre = await connection.ExecuteScalarAsync<string>("SELECT NombreCompleto FROM TB_USUARIOS WHERE Id = @id", new { id = (int)viaje.UsuarioId }) ?? "Conductor";
                var ticketCodigo = viaje.CodigoTicket != null ? viaje.CodigoTicket.ToString() : viaje.Id.ToString();

                await EnsureTableNotificacionesExistsAsync(connection);

                var usuariosNotif = await connection.QueryAsync<int>(@"
                    SELECT DISTINCT u.Id 
                    FROM TB_USUARIOS u
                    LEFT JOIN TB_ROLES r ON u.RolId = r.Id OR (u.RolId IS NULL AND u.Rol = r.Codigo)
                    WHERE (UPPER(ISNULL(u.Rol, '')) IN ('ADMIN', 'SUPERADMIN', 'SUPERVISOR', 'ADMINISTRADOR') 
                        OR UPPER(ISNULL(r.Codigo, '')) IN ('ADMIN', 'SUPERADMIN', 'SUPERVISOR', 'ADMINISTRADOR')
                        OR UPPER(ISNULL(r.Nombre, '')) LIKE '%ADMIN%'
                        OR UPPER(ISNULL(r.Nombre, '')) LIKE '%SUPERVIS%')
                      AND u.Activo = 1");

                // Si la acciÃ³n fue ejecutada por un Administrador/Supervisor (o alguien distinto al chofer), NOTIFICAR AL CHOFER
                if (viaje.UsuarioId != null && (int)viaje.UsuarioId != usuarioId)
                {
                    await connection.ExecuteAsync(@"
                        IF NOT EXISTS (
                            SELECT 1 FROM TB_NOTIFICACIONES_MOVIL
                            WHERE UsuarioId = @UsuarioId
                              AND Tipo = 'FINCA_AGREGADA'
                              AND ReferenciaId = @ReferenciaId
                              AND Titulo = @Titulo
                              AND Mensaje = @Mensaje
                              AND CreatedAt >= DATEADD(minute, -30, GETDATE())
                        )
                        INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                        VALUES (@UsuarioId, 'FINCA_AGREGADA', @Titulo, @Mensaje, @FechaOperativa, @ReferenciaId, 0, GETDATE())",
                        new
                        {
                            UsuarioId = (int)viaje.UsuarioId,
                            Titulo = $"âž• Finca Agregada a tu Recorrido",
                            Mensaje = $"Se ha incorporado la finca {nombreFinca} a tu recorrido en el Ticket #{ticketCodigo}.",
                            FechaOperativa = fechaEfectiva,
                            ReferenciaId = dto.ControlRutaId
                        });
                }

                foreach (var destUserId in usuariosNotif)
                {
                    await connection.ExecuteAsync(@"
                        IF NOT EXISTS (
                            SELECT 1 FROM TB_NOTIFICACIONES_MOVIL
                            WHERE UsuarioId = @UsuarioId
                              AND Tipo = 'FINCA_AGREGADA'
                              AND ReferenciaId = @ReferenciaId
                              AND Titulo = @Titulo
                              AND Mensaje = @Mensaje
                              AND CreatedAt >= DATEADD(minute, -30, GETDATE())
                        )
                        INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                        VALUES (@UsuarioId, 'FINCA_AGREGADA', @Titulo, @Mensaje, @FechaOperativa, @ReferenciaId, 0, GETDATE())",
                        new
                        {
                            UsuarioId = destUserId,
                            Titulo = $"Finca en Ticket #{ticketCodigo}",
                            Mensaje = $"{choferNombre} agregó {nombreFinca} ({dto.Litros:N0} Lts) al Ticket #{ticketCodigo}.",
                            FechaOperativa = fechaEfectiva,
                            ReferenciaId = dto.ControlRutaId
                        });
                }
            }
            catch { /* Tolerante */ }

            return nuevaRutaId;
        }

        public async Task<IEnumerable<RutaItemDto>> ObtenerFincasDeViajeAsync(long controlRutaId, bool soloConLitros = false)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureTableNotificacionesExistsAsync(connection);

            // Auto-enlazar recolecciones huÃ©rfanas de ese viaje
            try
            {
                var viajeInfo = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT TOP 1 UsuarioId, Fecha FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
                if (viajeInfo != null && viajeInfo.UsuarioId != null && viajeInfo.Fecha != null)
                {
                    int uId = (int)viajeInfo.UsuarioId;
                    DateTime fViaje = (DateTime)viajeInfo.Fecha;
                    await connection.ExecuteAsync(@"
                        UPDATE TB_RUTAS_RECOLECCION
                        SET ControlRutaId = @controlRutaId
                        WHERE UsuarioId = @uId 
                          AND CAST(Fecha AS DATE) = CAST(@fViaje AS DATE) 
                          AND ControlRutaId IS NULL",
                        new { controlRutaId, uId, fViaje });
                }
            }
            catch { /* Tolerante */ }

            var filtroLitros = soloConLitros ? " AND (r.Litros > 0)" : "";

            var sql = $@"
                SELECT 
                    r.Id AS Id,
                    r.Fecha AS Fecha,
                    r.FincaId AS FincaId,
                    ISNULL(f.Nombre, 'Finca #' + CAST(r.FincaId AS varchar(10))) AS FincaNombre,
                    ISNULL(f.Propietario, '-') AS Propietario,
                    ISNULL(f.TipoServicioId, 1) AS TipoServicioId,
                    f.CompaniaId AS CompaniaId,
                    comp.Nombre AS CompaniaNombre,
                    r.UsuarioId AS ConductorId,
                    ISNULL(u.NombreCompleto, 'Conductor') AS ConductorNombre,
                    r.Litros AS Litros,
                    r.EsAcida AS EsAcida,
                    ISNULL(r.TipoLeche, 'VACA') AS TipoLeche,
                    ISNULL(f.TieneDosTiposLeche, 0) AS TieneDosTiposLeche,
                    ISNULL(r.PrecioLitroUSDAplicado, CASE WHEN r.EsAcida = 1 THEN ISNULL(f.PrecioLitroAcidaUSD, 0) ELSE ISNULL(f.PrecioLitroUSD, 0) END) AS PrecioLitroUSD,
                    r.Observacion AS Observacion,
                    r.FotoComprobante AS FotoComprobante,
                    r.FotosEvidenciaJson AS FotosEvidenciaJson,
                    ISNULL(r.EsDiferido, 0) AS EsDiferido,
                    r.LitrosOriginales AS LitrosOriginales,
                    r.RecoleccionOrigenId AS RecoleccionOrigenId,
                    r.ControlRutaId AS ControlRutaId,
                    r.CreatedAt AS CreatedAt,
                    r.ModifiedAt AS ModifiedAt,
                    1 AS PuedeModificar
                FROM TB_RUTAS_RECOLECCION r
                LEFT JOIN TB_FINCAS f ON r.FincaId = f.Id
                LEFT JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS comp ON f.CompaniaId = comp.Id
                WHERE (r.ControlRutaId = @controlRutaId
                   OR (r.ControlRutaId IS NULL 
                       AND r.UsuarioId = (SELECT TOP 1 UsuarioId FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId)
                       AND CAST(r.Fecha AS DATE) = (SELECT TOP 1 CAST(Fecha AS DATE) FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId)))
                   {filtroLitros}
                ORDER BY COALESCE(r.ModifiedAt, r.CreatedAt, r.Fecha) ASC, r.Id ASC";

            return await connection.QueryAsync<RutaItemDto>(sql, new { controlRutaId });
        }

        public async Task<bool> EnviarAReceptoriaAsync(long controlRutaId, int usuarioId, string? observacion)
        {
            using var connection = new SqlConnection(_connectionString);
            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) return false;

            var rows = await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET ProcesoActualId = 2,
                    TipoDestino = 'RECEPTORIA',
                    FechaLlegadaReceptoria = DATEADD(hour, -4, GETUTCDATE()),
                    ModifiedAt = DATEADD(hour, -4, GETUTCDATE()),
                    ModifiedBy = @usuarioId
                WHERE Id = @controlRutaId",
                new { controlRutaId, usuarioId });

            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@controlRutaId, 2, DATEADD(hour, -4, GETUTCDATE()), @usuarioId, @obs);",
                new { controlRutaId, usuarioId, obs = observacion ?? "Viaje despachado y enviado a ReceptorÃ­a" });

            // Los choferes ya no requieren permiso para crear tickets: no se revoca nada al despachar.

            return rows > 0;
        }

        public async Task<bool> RecibirEnReceptoriaAsync(long controlRutaId, RecibirEnReceptoriaDto dto, int usuarioId)
        {
            using var connection = new SqlConnection(_connectionString);
            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) return false;

            int totalFincaBruto = Convert.ToInt32(viaje.TotalLitrosFinca ?? 0);
            int totalDespachadoExterno = await connection.ExecuteScalarAsync<int>(@"
                SELECT ISNULL(SUM(cc.LitrosDespachados), 0)
                FROM TB_CONTROL_COMPANIAS cc
                INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE cc.ControlRutaId = @controlRutaId
                  AND ISNULL(c.EsPrincipal, 0) = 0
                  AND UPPER(ISNULL(c.Nombre, '')) NOT LIKE '%RECEPTORIA%'
                  AND UPPER(ISNULL(c.Nombre, '')) NOT LIKE '%RECEPTORÃA%'
                  AND UPPER(ISNULL(c.Nombre, '')) NOT LIKE '%PLANTA PRINCIPAL%';",
                new { controlRutaId });
            int totalFinca = totalDespachadoExterno > 0 ? Math.Max(0, totalFincaBruto - totalDespachadoExterno) : totalFincaBruto;
            int diferenciaRec = totalFinca - dto.LitrosRecibidos;
            decimal porcentajeRec = totalFinca > 0 ? Math.Round((Math.Abs(diferenciaRec) * 100.0m) / totalFinca, 2) : 0;

            if (dto.Accion == "DEJAR_EN_RECEPTORIA")
            {
                // La leche se queda en receptorÃ­a -> entrada concluida con Ã©xito
                string estado = "FINALIZADO";
                var rows = await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET LitrosRecibidosReceptoria = @litrosRecibidos,
                        DiferenciaReceptoria = @diferenciaRec,
                        TotalLitrosReceptoria = @litrosRecibidos,
                        DiferenciaLitros = @diferenciaRec,
                        PorcentajeMerma = @porcentajeRec,
                        MermaTotalLitros = @diferenciaRec,
                        ProcesoActualId = 4,
                        Estado = @estado,
                        FechaLlegadaReceptoria = ISNULL(FechaLlegadaReceptoria, DATEADD(hour, -4, GETUTCDATE())),
                        CerradoPor = @usuarioId,
                        ModifiedAt = DATEADD(hour, -4, GETUTCDATE()),
                        ModifiedBy = @usuarioId
                    WHERE Id = @controlRutaId",
                    new { litrosRecibidos = dto.LitrosRecibidos, diferenciaRec, porcentajeRec, estado, usuarioId, controlRutaId });

                await connection.ExecuteAsync(@"
                    INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                    VALUES (@controlRutaId, 4, DATEADD(hour, -4, GETUTCDATE()), @usuarioId, @obs);",
                    new
                    {
                        controlRutaId,
                        usuarioId,
                        obs = $"Leche descargada en ReceptorÃ­a. Litros recibidos: {dto.LitrosRecibidos} L (Dif: {diferenciaRec:+0;-0;0} L). Cierre del viaje. {dto.Observacion}".Trim()
                    });

                // Registrar entrada a ReceptorÃ­a en TB_ENTREGAS_COMPANIA (evitar duplicados si ya existe)
                var compReceptoriaId = await connection.ExecuteScalarAsync<int?>(
                    @"SELECT TOP 1 Id FROM TB_COMPANIAS 
                      WHERE Activo = 1 
                      ORDER BY CASE 
                        WHEN EsPrincipal = 1 THEN 0
                        WHEN UPPER(Nombre) LIKE '%RECEPTOR%' THEN 1 
                        WHEN UPPER(Nombre) LIKE '%PLANTA%' THEN 2 
                        ELSE 3 END, Id ASC")
                    ?? await connection.ExecuteScalarAsync<int?>("SELECT TOP 1 Id FROM TB_COMPANIAS WHERE Activo = 1 ORDER BY Id ASC")
                    ?? throw new InvalidOperationException("No existe ninguna compañía activa configurada como Receptoría Principal en TB_COMPANIAS.");

                var entregaExistenteId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_ENTREGAS_COMPANIA WHERE ControlRutaId = @controlRutaId AND CompaniaId = @compReceptoriaId",
                    new { controlRutaId, compReceptoriaId });

                if (entregaExistenteId.HasValue)
                {
                    await connection.ExecuteAsync(@"
                        UPDATE TB_ENTREGAS_COMPANIA
                        SET Litros = @litros,
                            Observacion = @obs,
                            Fecha = @fecha,
                            UsuarioId = @choferId,
                            ModifiedAt = DATEADD(hour, -4, GETUTCDATE()),
                            ModifiedBy = @usuarioId
                        WHERE Id = @entregaExistenteId;",
                        new
                        {
                            entregaExistenteId = entregaExistenteId.Value,
                            litros = dto.LitrosRecibidos,
                            obs = $"Descarga en ReceptorÃ­a desde Viaje #{controlRutaId}",
                            fecha = (DateTime)viaje.Fecha,
                            choferId = (int)viaje.UsuarioId,
                            usuarioId
                        });
                }
                else
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_ENTREGAS_COMPANIA (CicloId, CompaniaId, UsuarioId, Fecha, Litros, Observacion, ControlRutaId, CreatedAt, CreatedBy)
                        VALUES (@cicloId, @compReceptoriaId, @choferId, @fecha, @litros, @obs, @controlRutaId, DATEADD(hour, -4, GETUTCDATE()), @usuarioId);",
                        new
                        {
                            cicloId = (int?)viaje.CicloId,
                            compReceptoriaId,
                            choferId = (int)viaje.UsuarioId,
                            fecha = (DateTime)viaje.Fecha,
                            litros = dto.LitrosRecibidos,
                            obs = $"Descarga en ReceptorÃ­a desde Viaje #{controlRutaId}",
                            controlRutaId,
                            usuarioId
                        });
                }

                try
                {
                    await connection.ExecuteAsync(@"
                        UPDATE TB_CONTROL_COMPANIAS
                        SET LitrosRecibidosCompania = @litrosRecibidos,
                            DiferenciaLitros = @diferenciaRec,
                            PorcentajeMerma = @porcentajeRec,
                            Estado = 'FINALIZADO',
                            FechaEntrega = ISNULL(FechaEntrega, GETDATE()),
                            ModifiedAt = GETDATE(),
                            ModifiedBy = @usuarioId
                        WHERE ControlRutaId = @controlRutaId
                          AND Estado != 'FINALIZADO'
                          AND CompaniaId IN (
                              SELECT Id FROM TB_COMPANIAS
                              WHERE Id = @compReceptoriaId
                                 OR UPPER(ISNULL(Nombre, '')) LIKE '%RECEPTORIA%'
                                 OR UPPER(ISNULL(Nombre, '')) LIKE '%RECEPTORÃA%'
                                 OR UPPER(ISNULL(Nombre, '')) LIKE '%PLANTA PRINCIPAL%'
                          );",
                        new { litrosRecibidos = dto.LitrosRecibidos, diferenciaRec, porcentajeRec, usuarioId, controlRutaId, compReceptoriaId });
                }
                catch { /* Tolerante */ }

                return rows > 0;
            }
            else
            {
                // RECARGAR_Y_DESPACHAR -> Sale a compaÃ±Ã­a
                int recarga = dto.LitrosCargadosAdicional ?? 0;
                int totalLitrosDespacho = dto.LitrosRecibidos + recarga;
                int choferDespacho = (viaje.UsuarioId != null && (int)viaje.UsuarioId > 0) ? (int)viaje.UsuarioId : usuarioId;
                var fecha = (DateTime)viaje.Fecha;
                var cicloId = (int?)viaje.CicloId;

                var insertCompSql = @"
                    INSERT INTO TB_CONTROL_COMPANIAS 
                    (Fecha, UsuarioId, CompaniaId, CicloId, LitrosDespachados, LitrosRecibidosCompania, DiferenciaLitros, PorcentajeMerma, Estado, TipoLeche, Observacion, ControlRutaId, FechaSalida, CreatedAt, CreatedBy)
                    VALUES 
                    (@fecha, @choferDespacho, @companiaId, @cicloId, @litrosDespacho, NULL, 0, 0.00, 'EN VIA', @tipoLeche, @obs, @controlRutaId, GETDATE(), GETDATE(), @usuarioId);
                    SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

                int primerCompaniaId = 0;
                int totalDespachadoReal = 0;

                if (dto.Destinos != null && dto.Destinos.Count > 0)
                {
                    foreach (var d in dto.Destinos)
                    {
                        int ltsItem = d.LitrosDespachados > 0 ? d.LitrosDespachados : d.Litros;
                        if (d.CompaniaId <= 0 || ltsItem <= 0) continue;
                        if (primerCompaniaId == 0) primerCompaniaId = d.CompaniaId;

                        var tipoLeche = string.IsNullOrWhiteSpace(d.TipoLeche) ? "VACA" : d.TipoLeche.Trim().ToUpper();
                        var obsItem = $"Recarga y Despacho desde ReceptorÃ­a (Viaje #{controlRutaId}). {d.Observacion ?? dto.Observacion}".Trim();

                        await connection.ExecuteAsync(insertCompSql, new
                        {
                            fecha,
                            choferDespacho,
                            companiaId = d.CompaniaId,
                            cicloId,
                            litrosDespacho = ltsItem,
                            tipoLeche,
                            obs = obsItem,
                            controlRutaId,
                            usuarioId
                        });
                        totalDespachadoReal += ltsItem;
                    }
                }
                else if (dto.CompaniaDestinoId.HasValue && dto.CompaniaDestinoId.Value > 0)
                {
                    primerCompaniaId = dto.CompaniaDestinoId.Value;
                    var tipoLeche = "VACA";
                    var obsItem = $"Recarga y Despacho desde ReceptorÃ­a (Viaje #{controlRutaId}). {dto.Observacion}".Trim();
                    await connection.ExecuteAsync(insertCompSql, new
                    {
                        fecha,
                        choferDespacho,
                        companiaId = primerCompaniaId,
                        cicloId,
                        litrosDespacho = totalLitrosDespacho,
                        tipoLeche,
                        obs = obsItem,
                        controlRutaId,
                        usuarioId
                    });
                    totalDespachadoReal = totalLitrosDespacho;
                }

                if (primerCompaniaId == 0 && dto.CompaniaDestinoId.HasValue)
                {
                    primerCompaniaId = dto.CompaniaDestinoId.Value;
                }

                int finalDespachado = totalDespachadoReal > 0 ? totalDespachadoReal : totalLitrosDespacho;

                var rows = await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET LitrosRecibidosReceptoria = @litrosRecibidos,
                        DiferenciaReceptoria = @diferenciaRec,
                        LitrosCargadosAdicional = @recarga,
                        TotalLitrosReceptoria = @litrosRecibidos,
                        CompaniaDestinoId = @primerCompaniaId,
                        TipoDestino = 'RECEPTORIA_Y_COMPANIA',
                        ProcesoActualId = 3,
                        Estado = 'RECEPCIONADO',
                        FechaLlegadaReceptoria = ISNULL(FechaLlegadaReceptoria, GETDATE()),
                        FechaSalida = GETDATE(),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @controlRutaId",
                    new
                    {
                        litrosRecibidos = dto.LitrosRecibidos,
                        diferenciaRec,
                        recarga,
                        primerCompaniaId = primerCompaniaId > 0 ? primerCompaniaId : (int?)null,
                        usuarioId,
                        controlRutaId
                    });

                await connection.ExecuteAsync(@"
                    INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                    VALUES (@controlRutaId, 3, GETDATE(), @usuarioId, @obs);",
                    new
                    {
                        controlRutaId,
                        usuarioId,
                        obs = $"RecepciÃ³n verificada ({dto.LitrosRecibidos} L). Recarga adicional: {recarga} L. Despachado a CompaÃ±Ã­a ({finalDespachado} L). {dto.Observacion}".Trim()
                    });

                try
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_LOG_MODIFICACIONES_CONTROL 
                        (ControlRutaId, TipoEntidad, EntidadId, TipoAccion, ValoresAnteriores, ValoresNuevos, Motivo, UsuarioId, Fecha)
                        VALUES 
                        (@controlRutaId, 'RECEPTORIA', @controlRutaId, 'RECARGAR_Y_DESPACHAR', @valAnt, @valNue, @motivo, @usuarioId, GETDATE());",
                        new
                        {
                            controlRutaId,
                            valAnt = $"LitrosFinca={totalFinca}",
                            valNue = $"LitrosRecibidos={dto.LitrosRecibidos}, RecargaSilos={recarga}, TotalDespachado={finalDespachado}, CompaniaId={primerCompaniaId}",
                            motivo = $"Recarga y despacho a compaÃ±Ã­a desde ReceptorÃ­a. {dto.Observacion}".Trim(),
                            usuarioId
                        });
                }
                catch { /* Tolerante */ }

                return rows > 0;
            }
        }

        public async Task<bool> EntregarDirectoCompaniaAsync(long controlRutaId, EntregarDirectoCompaniaDto dto, int usuarioId)
        {
            using var connection = new SqlConnection(_connectionString);
            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) return false;

            int totalFinca = (int)viaje.TotalLitrosFinca;
            int diferencia = totalFinca - dto.LitrosEntregados;
            decimal porcentaje = totalFinca > 0 ? Math.Round((Math.Abs(diferencia) * 100.0m) / totalFinca, 2) : 0;
            string estado = diferencia == 0 ? "CUADRADO" : (porcentaje > 5 ? "MERMA_EXCESIVA" : "PENDIENTE");

            var rows = await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET TipoDestino = 'COMPANIA_DIRECTA',
                    CompaniaDestinoId = @companiaDestinoId,
                    LitrosEntregadosCompania = @litrosEntregados,
                    DiferenciaCompania = @diferencia,
                    MermaTotalLitros = @diferencia,
                    TotalLitrosReceptoria = @litrosEntregados,
                    DiferenciaLitros = @diferencia,
                    PorcentajeMerma = @porcentaje,
                    ProcesoActualId = 3,
                    Estado = @estado,
                    FechaEntregaCompania = GETDATE(),
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @controlRutaId",
                new { companiaDestinoId = dto.CompaniaDestinoId, litrosEntregados = dto.LitrosEntregados, diferencia, porcentaje, estado, usuarioId, controlRutaId });

            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@controlRutaId, 3, GETDATE(), @usuarioId, @obs);",
                new
                {
                    controlRutaId,
                    usuarioId,
                    obs = $"Entrega directa a CompaÃ±Ã­a ID: {dto.CompaniaDestinoId}. Litros entregados: {dto.LitrosEntregados} L (Dif: {diferencia:+0;-0;0} L). {dto.Observacion}".Trim()
                });

            // Registrar entrega en TB_ENTREGAS_COMPANIA (evitar duplicados si ya existe)
            var entregaDirExistenteId = await connection.ExecuteScalarAsync<int?>(
                "SELECT TOP 1 Id FROM TB_ENTREGAS_COMPANIA WHERE ControlRutaId = @controlRutaId AND CompaniaId = @companiaId",
                new { controlRutaId, companiaId = dto.CompaniaDestinoId });

            if (entregaDirExistenteId.HasValue)
            {
                await connection.ExecuteAsync(@"
                    UPDATE TB_ENTREGAS_COMPANIA
                    SET Litros = @litros,
                        Observacion = @obs,
                        Fecha = @fecha,
                        UsuarioId = @choferId,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @entregaDirExistenteId;",
                    new
                    {
                        entregaDirExistenteId = entregaDirExistenteId.Value,
                        litros = dto.LitrosEntregados,
                        obs = $"Entrega directa desde Viaje #{controlRutaId}. {dto.Observacion}".Trim(),
                        fecha = (DateTime)viaje.Fecha,
                        choferId = (int)viaje.UsuarioId,
                        usuarioId
                    });
            }
            else
            {
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_ENTREGAS_COMPANIA (CicloId, CompaniaId, UsuarioId, Fecha, Litros, Observacion, ControlRutaId, CreatedAt, CreatedBy)
                    VALUES (@cicloId, @companiaId, @choferId, @fecha, @litros, @obs, @controlRutaId, GETDATE(), @usuarioId);",
                    new
                    {
                        cicloId = (int?)viaje.CicloId,
                        companiaId = dto.CompaniaDestinoId,
                        choferId = (int)viaje.UsuarioId,
                        fecha = (DateTime)viaje.Fecha,
                        litros = dto.LitrosEntregados,
                        obs = $"Entrega directa desde Viaje #{controlRutaId}. {dto.Observacion}".Trim(),
                        controlRutaId,
                        usuarioId
                    });
            }

            return rows > 0;
        }

        public async Task<bool> RegistrarEntregaPlantaAsync(long controlRutaId, RegistrarEntregaPlantaDto dto, int usuarioId)
        {
            using var connection = new SqlConnection(_connectionString);
            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) return false;

            int litrosRecibidosRec = viaje.LitrosRecibidosReceptoria ?? (int)viaje.TotalLitrosFinca;
            int recarga = (int)(viaje.LitrosCargadosAdicional ?? 0);
            int totalSaliendo = litrosRecibidosRec + recarga;

            int difPlanta = totalSaliendo - dto.LitrosEntregados;
            int difRec = (int)(viaje.DiferenciaReceptoria ?? 0);
            int mermaTotal = difRec + difPlanta;

            var rows = await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET LitrosEntregadosCompania = @litrosEntregados,
                    DiferenciaCompania = @difPlanta,
                    MermaTotalLitros = @mermaTotal,
                    TotalLitrosReceptoria = @litrosEntregados,
                    DiferenciaLitros = @mermaTotal,
                    ProcesoActualId = 3,
                    FechaEntregaCompania = GETDATE(),
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @controlRutaId",
                new { litrosEntregados = dto.LitrosEntregados, difPlanta, mermaTotal, usuarioId, controlRutaId });

            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@controlRutaId, 3, GETDATE(), @usuarioId, @obs);",
                new
                {
                    controlRutaId,
                    usuarioId,
                    obs = $"Entrega en planta completada. Litros entregados: {dto.LitrosEntregados} L (Dif tramo: {difPlanta:+0;-0;0} L, Merma total: {mermaTotal:+0;-0;0} L). {dto.Observacion}".Trim()
                });

            // Sincronizar entregas en TB_ENTREGAS_COMPANIA respetando el desglose por tipo de leche y destino
            var despachosRuta = (await connection.QueryAsync<dynamic>(
                "SELECT Id, CompaniaId, LitrosDespachados, LitrosRecibidosCompania, TipoLeche, Observacion FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @controlRutaId",
                new { controlRutaId })).ToList();

            if (despachosRuta.Count > 0)
            {
                // Sincronizar cada despacho en TB_ENTREGAS_COMPANIA respetando su TipoLeche y Litros individuales
                foreach (var desp in despachosRuta)
                {
                    long despId = (long)desp.Id;
                    int targetCompId = (int)desp.CompaniaId;
                    int ltsDesp = (int)(desp.LitrosRecibidosCompania ?? desp.LitrosDespachados ?? 0);
                    string tipoLecheDesp = (string)(desp.TipoLeche ?? "VACA");
                    string obsDesp = (string)(desp.Observacion ?? $"Entrega en planta desde Viaje #{controlRutaId}");

                    var existId = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_ENTREGAS_COMPANIA WHERE ControlCompaniaId = @despId",
                        new { despId });

                    if (existId.HasValue)
                    {
                        await connection.ExecuteAsync(@"
                            UPDATE TB_ENTREGAS_COMPANIA
                            SET CompaniaId = @targetCompId,
                                Litros = @ltsDesp,
                                TipoLeche = @tipoLecheDesp,
                                Observacion = @obsDesp,
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @usuarioId
                            WHERE Id = @existId",
                            new { targetCompId, ltsDesp, tipoLecheDesp, obsDesp, usuarioId, existId = existId.Value });
                    }
                    else
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_ENTREGAS_COMPANIA (CicloId, CompaniaId, UsuarioId, Fecha, Litros, TipoLeche, Observacion, ControlRutaId, ControlCompaniaId, CreatedAt, CreatedBy)
                            VALUES (@cicloId, @targetCompId, @choferId, @fecha, @ltsDesp, @tipoLecheDesp, @obsDesp, @controlRutaId, @despId, GETDATE(), @usuarioId);",
                            new
                            {
                                cicloId = (int?)viaje.CicloId,
                                targetCompId,
                                choferId = (int)viaje.UsuarioId,
                                fecha = (DateTime)viaje.Fecha,
                                ltsDesp,
                                tipoLecheDesp,
                                obsDesp,
                                controlRutaId,
                                despId,
                                usuarioId
                            });
                    }
                }

                // Eliminar cualquier entrega monolÃ­tica residual que no tenga ControlCompaniaId
                await connection.ExecuteAsync(
                    "DELETE FROM TB_ENTREGAS_COMPANIA WHERE ControlRutaId = @controlRutaId AND ControlCompaniaId IS NULL",
                    new { controlRutaId });
            }
            else if (viaje.CompaniaDestinoId != null)
            {
                var totalEntregasPrevias = await connection.ExecuteScalarAsync<int>(
                    "SELECT COUNT(*) FROM TB_ENTREGAS_COMPANIA WHERE ControlRutaId = @controlRutaId",
                    new { controlRutaId });

                int compDestinoId = (int)viaje.CompaniaDestinoId;
                if (totalEntregasPrevias == 0)
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_ENTREGAS_COMPANIA (CicloId, CompaniaId, UsuarioId, Fecha, Litros, TipoLeche, Observacion, ControlRutaId, CreatedAt, CreatedBy)
                        VALUES (@cicloId, @companiaId, @choferId, @fecha, @litros, 'VACA', @obs, @controlRutaId, GETDATE(), @usuarioId);",
                        new
                        {
                            cicloId = (int?)viaje.CicloId,
                            companiaId = compDestinoId,
                            choferId = (int)viaje.UsuarioId,
                            fecha = (DateTime)viaje.Fecha,
                            litros = dto.LitrosEntregados,
                            obs = $"Entrega en planta desde Viaje #{controlRutaId}. {dto.Observacion}".Trim(),
                            controlRutaId,
                            usuarioId
                        });
                }
                else
                {
                    await connection.ExecuteAsync(@"
                        UPDATE TB_ENTREGAS_COMPANIA 
                        SET Litros = @litros, 
                            Observacion = @obs, 
                            ModifiedAt = GETDATE(), 
                            ModifiedBy = @usuarioId 
                        WHERE ControlRutaId = @controlRutaId;",
                        new
                        {
                            litros = dto.LitrosEntregados,
                            obs = $"Entrega en planta desde Viaje #{controlRutaId}. {dto.Observacion}".Trim(),
                            usuarioId,
                            controlRutaId
                        });
                }
            }

            return rows > 0;
        }

        public async Task<bool> FinalizarViajeContableAsync(long controlRutaId, int usuarioId, string? observacion)
        {
            using var connection = new SqlConnection(_connectionString);
            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) return false;

            int merma = (int)(viaje.MermaTotalLitros ?? viaje.DiferenciaLitros ?? 0);
            string estado = merma == 0 ? "CUADRADO" : (Math.Abs(merma) > 100 ? "MERMA_EXCESIVA" : "PENDIENTE");

            var rows = await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET ProcesoActualId = 4,
                    Estado = @estado,
                    CerradoPor = @usuarioId,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @controlRutaId",
                new { estado, usuarioId, controlRutaId });

            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@controlRutaId, 4, GETDATE(), @usuarioId, @obs);",
                new
                {
                    controlRutaId,
                    usuarioId,
                    obs = $"Viaje auditado y finalizado por Administrador. Estado: {estado}. Merma global: {merma:+0;-0;0} L. {observacion}".Trim()
                });

            // Los choferes ya no requieren permiso para crear tickets: no se revoca nada al finalizar.

            return rows > 0;
        }

        public async Task<bool> RevertirProcesoViajeAsync(long controlRutaId, RevertirProcesoViajeDto dto, int usuarioId, string rol)
        {
            var motivo = string.IsNullOrWhiteSpace(dto?.Motivo) ? "ReversiÃ³n de proceso a ruta" : dto.Motivo;

            using var connection = new SqlConnection(_connectionString);
            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) return false;

            int targetProcesoId = dto.NuevoProcesoId > 0 ? dto.NuevoProcesoId : 1;
            string targetEstado = targetProcesoId switch
            {
                1 => "ABIERTO",
                2 => "RECEPCIONADO",
                3 => "CAMINO A COMPAÃ‘IA",
                _ => "ABIERTO"
            };

            int oldProcesoId = (int)(viaje.ProcesoActualId ?? 1);
            string oldEstado = (string)(viaje.Estado ?? "ABIERTO");

            var procesoInfo = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT Codigo, Nombre FROM TB_PROCESOS_TICKET WHERE Id = @targetProcesoId", new { targetProcesoId });
            string nombreProceso = procesoInfo != null ? (string)procesoInfo.Nombre : $"Proceso #{targetProcesoId}";

            int rows = 0;
            if (targetProcesoId == 1)
            {
                // ReversiÃ³n a Proceso 1 (En Ruta / Abierto): Dejar el proceso en CERO (solo fincas y litros recogidos)
                rows = await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET ProcesoActualId = 1,
                        Estado = 'ABIERTO',
                        TotalLitrosReceptoria = 0,
                        LitrosRecibidosReceptoria = NULL,
                        DiferenciaLitros = 0,
                        DiferenciaReceptoria = 0,
                        PorcentajeMerma = 0,
                        LitrosEntregadosCompania = NULL,
                        DiferenciaCompania = 0,
                        MermaTotalLitros = 0,
                        CompaniaDestinoId = NULL,
                        TipoDestino = NULL,
                        FechaLlegadaReceptoria = NULL,
                        FechaEntregaCompania = NULL,
                        CerradoPor = NULL,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @controlRutaId;

                    DELETE FROM TB_ENTREGAS_COMPANIA 
                    WHERE ControlRutaId = @controlRutaId 
                       OR ControlCompaniaId IN (SELECT Id FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @controlRutaId);

                    DELETE FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @controlRutaId;
                ", new { controlRutaId, usuarioId });
            }
            else if (targetProcesoId == 2)
            {
                // ReversiÃ³n a Proceso 2 (ReceptorÃ­a): Limpiar despacho a compaÃ±Ã­as para permitir re-asignar destino
                rows = await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET ProcesoActualId = 2,
                        Estado = 'RECEPCIONADO',
                        LitrosEntregadosCompania = NULL,
                        DiferenciaCompania = 0,
                        MermaTotalLitros = 0,
                        CompaniaDestinoId = NULL,
                        TipoDestino = NULL,
                        FechaEntregaCompania = NULL,
                        CerradoPor = NULL,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @controlRutaId;

                    DELETE FROM TB_ENTREGAS_COMPANIA 
                    WHERE ControlRutaId = @controlRutaId 
                       OR ControlCompaniaId IN (SELECT Id FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @controlRutaId);

                    DELETE FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @controlRutaId;
                ", new { controlRutaId, usuarioId });
            }
            else
            {
                rows = await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET ProcesoActualId = @targetProcesoId,
                        Estado = @targetEstado,
                        CerradoPor = NULL,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @controlRutaId",
                    new { targetProcesoId, targetEstado, usuarioId, controlRutaId });
            }

            // Registrar en historial de procesos
            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@controlRutaId, @targetProcesoId, GETDATE(), @usuarioId, @obs);",
                new
                {
                    controlRutaId,
                    targetProcesoId,
                    usuarioId,
                    obs = $"Proceso revertido a {nombreProceso}. Motivo: {dto.Motivo.Trim()}"
                });

            // Registrar en log de modificaciones auditadas
            await connection.ExecuteAsync(@"
                INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                (ControlRutaId, UsuarioId, TipoEntidad, TipoAccion, EntidadId, ValoresAnteriores, ValoresNuevos, Motivo, Fecha)
                VALUES
                (@controlRutaId, @usuarioId, 'TICKET', 'REVERTIR_PROCESO', @controlRutaId, @valAnt, @valNue, @motivo, GETDATE());",
                new
                {
                    controlRutaId,
                    usuarioId,
                    valAnt = $"Proceso {oldProcesoId} ({oldEstado})",
                    valNue = $"Proceso {targetProcesoId} ({targetEstado})",
                    motivo = dto.Motivo.Trim()
                });

            return rows > 0;
        }

        public async Task<long> EnviarDesdeRutaACompaniaAsync(long controlRutaId, EnviarDesdeRutaACompaniaDto dto, int usuarioId)
        {
            using var connection = new SqlConnection(_connectionString);
            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) throw new Exception("Viaje de ruta no encontrado.");

            // Evitar despachos duplicados (idempotencia ante reintentos offline / seÃ±al inestable)
            string estadoActual = Convert.ToString(viaje.Estado ?? "").Trim().ToUpperInvariant();
            int procesoActual = viaje.ProcesoActualId != null ? Convert.ToInt32(viaje.ProcesoActualId) : 1;
            if (estadoActual == "RECEPCIONADO" || estadoActual == "FINALIZADO" || estadoActual == "CERRADO" || procesoActual >= 3)
            {
                throw new InvalidOperationException($"El ticket #{controlRutaId} ya fue recepcionado y despachado a compaÃ±Ã­a.");
            }

            // Priorizar el chofer asignado explÃ­citamente o el que recolectÃ³ la ruta (no el admin creador)
            int choferDespacho = (dto.ChoferId.HasValue && dto.ChoferId.Value > 0)
                ? dto.ChoferId.Value
                : ((viaje.UsuarioId != null && (int)viaje.UsuarioId > 0) ? (int)viaje.UsuarioId : 0);

            if (choferDespacho <= 0)
            {
                throw new InvalidOperationException("Debe especificar un conductor asignado vÃ¡lido para el traslado.");
            }

            var esChoferValido = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM TB_USUARIOS WHERE Id = @choferId AND UPPER(Rol) = 'CHOFER' AND Activo = 1",
                new { choferId = choferDespacho });
            if (esChoferValido == 0)
            {
                throw new InvalidOperationException("El conductor asignado para el traslado debe tener el rol de CHOFER.");
            }
            var cicloId = (int?)viaje.CicloId;
            var fecha = (DateTime)viaje.Fecha;
            // Autolimpieza de duplicados exactos (Finca + Litros + TipoLeche) antes de despachar
            int dupLimpiados = await LimpiarDuplicadosExactosTicketAsync(connection, controlRutaId, usuarioId);
            int totalLitrosFinca = dupLimpiados > 0
                ? await connection.ExecuteScalarAsync<int>("SELECT ISNULL(TotalLitrosFinca, 0) FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId })
                : (int)(viaje.TotalLitrosFinca ?? 0);

            var insertSql = @"
                INSERT INTO TB_CONTROL_COMPANIAS 
                (Fecha, UsuarioId, CompaniaId, CicloId, LitrosDespachados, LitrosRecibidosCompania, DiferenciaLitros, PorcentajeMerma, Estado, TipoLeche, Observacion, ControlRutaId, FechaSalida, CreatedAt, CreatedBy)
                VALUES 
                (@fecha, @choferDespacho, @companiaId, @cicloId, @litrosDespacho, NULL, 0, 0.00, 'EN VIA', @tipoLeche, @obs, @controlRutaId, GETDATE(), GETDATE(), @usuarioId);
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

            long primerControlCompaniaId = 0;
            int primerCompaniaId = 0;

            if (dto.Destinos != null && dto.Destinos.Count > 0)
            {
                foreach (var d in dto.Destinos)
                {
                    int ltsItem = d.LitrosDespachados > 0 ? d.LitrosDespachados : d.Litros;
                    if (d.CompaniaId <= 0 || ltsItem <= 0) continue;
                    if (primerCompaniaId == 0) primerCompaniaId = d.CompaniaId;

                    var tipoLeche = string.IsNullOrWhiteSpace(d.TipoLeche) ? "VACA" : d.TipoLeche.Trim().ToUpper();
                    var obs = $"Despacho directo desde Ruta de Campo (Ticket #{controlRutaId}). {d.Observacion ?? dto.Observacion}".Trim();
                    var cid = await connection.ExecuteScalarAsync<long>(insertSql, new
                    {
                        fecha,
                        choferDespacho,
                        companiaId = d.CompaniaId,
                        cicloId,
                        litrosDespacho = ltsItem,
                        tipoLeche,
                        obs,
                        controlRutaId,
                        usuarioId
                    });
                    if (primerControlCompaniaId == 0) primerControlCompaniaId = cid;
                }
            }
            else
            {
                int companiaId = dto.CompaniaId ?? 0;
                if (companiaId <= 0) throw new Exception("Debe especificar al menos una compaÃ±Ã­a de destino.");
                int litrosDespacho = dto.LitrosDespachados.HasValue && dto.LitrosDespachados.Value > 0 ? dto.LitrosDespachados.Value : totalLitrosFinca;
                primerCompaniaId = companiaId;

                var tipoLeche = "VACA";
                var obs = $"Despacho directo desde Ruta de Campo (Ticket #{controlRutaId}). {dto.Observacion}".Trim();
                primerControlCompaniaId = await connection.ExecuteScalarAsync<long>(insertSql, new
                {
                    fecha,
                    choferDespacho,
                    companiaId,
                    cicloId,
                    litrosDespacho,
                    tipoLeche,
                    obs,
                    controlRutaId,
                    usuarioId
                });
            }

            // Separar despachos a ReceptorÃ­a (1. Entradas) vs CompaÃ±Ã­as/Queseras externas (2. Salidas)
            int totalDespachadoReceptoria = await connection.ExecuteScalarAsync<int>(@"
                SELECT ISNULL(SUM(cc.LitrosDespachados), 0)
                FROM TB_CONTROL_COMPANIAS cc
                INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE cc.ControlRutaId = @controlRutaId
                  AND (ISNULL(c.EsPrincipal, 0) = 1
                    OR UPPER(ISNULL(c.Nombre, '')) LIKE '%RECEPTORIA%'
                    OR UPPER(ISNULL(c.Nombre, '')) LIKE '%RECEPTORÃA%'
                    OR UPPER(ISNULL(c.Nombre, '')) LIKE '%PLANTA PRINCIPAL%')",
                new { controlRutaId });

            int totalDespachadoExterno = await connection.ExecuteScalarAsync<int>(@"
                SELECT ISNULL(SUM(cc.LitrosDespachados), 0)
                FROM TB_CONTROL_COMPANIAS cc
                INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE cc.ControlRutaId = @controlRutaId
                  AND ISNULL(c.EsPrincipal, 0) = 0
                  AND UPPER(ISNULL(c.Nombre, '')) NOT LIKE '%RECEPTORIA%'
                  AND UPPER(ISNULL(c.Nombre, '')) NOT LIKE '%RECEPTORÃA%'
                  AND UPPER(ISNULL(c.Nombre, '')) NOT LIKE '%PLANTA PRINCIPAL%'",
                new { controlRutaId });

            int totalDespachado = totalDespachadoReceptoria + totalDespachadoExterno;
            if (totalDespachado <= 0) totalDespachado = totalLitrosFinca;
            int dif = totalLitrosFinca - totalDespachado;
            decimal merma = totalLitrosFinca > 0 ? Math.Round((Math.Abs(dif) * 100.0m) / totalLitrosFinca, 2) : 0;

            int? finalCompaniaDestinoId = primerCompaniaId > 0 
                ? primerCompaniaId 
                : ((dto.CompaniaId.HasValue && dto.CompaniaId.Value > 0) ? dto.CompaniaId.Value : (int?)null);

            if (finalCompaniaDestinoId.HasValue && finalCompaniaDestinoId.Value > 0)
            {
                var existeComp = await connection.ExecuteScalarAsync<int>(
                    "SELECT COUNT(1) FROM TB_COMPANIAS WHERE Id = @id", new { id = finalCompaniaDestinoId.Value });
                if (existeComp == 0) finalCompaniaDestinoId = null;
            }
            else
            {
                finalCompaniaDestinoId = null;
            }

            // Si hay leche destinada a ReceptorÃ­a Principal, queda EN_RECEPTORIA (Proceso 2: En Silos / Por Recibir) hasta ser verificada en Planta
            bool tieneEntradaReceptoria = totalDespachadoReceptoria > 0 || (totalLitrosFinca - totalDespachadoExterno) > 0;
            string estadoRuta = tieneEntradaReceptoria ? "EN_RECEPTORIA" : "FINALIZADO";
            int procesoRuta = tieneEntradaReceptoria ? 2 : 4;
            string tipoDestinoRuta = (totalDespachadoReceptoria > 0 && totalDespachadoExterno > 0)
                ? "RECEPTORIA_Y_COMPANIA"
                : (tieneEntradaReceptoria ? "RECEPTORIA" : "COMPANIA_DIRECTA");

            await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET Estado = @estadoRuta,
                    TipoDestino = @tipoDestinoRuta,
                    ProcesoActualId = @procesoRuta,
                    CompaniaDestinoId = @companiaId,
                    TotalLitrosReceptoria = 0,
                    LitrosRecibidosReceptoria = CASE WHEN @tieneEntradaReceptoria = 1 THEN NULL ELSE 0 END,
                    LitrosEntregadosCompania = @totalDespachadoExterno,
                    DiferenciaLitros = @dif,
                    DiferenciaCompania = @dif,
                    MermaTotalLitros = @dif,
                    PorcentajeMerma = @merma,
                    FechaLlegadaReceptoria = CASE WHEN @tieneEntradaReceptoria = 1 THEN ISNULL(FechaLlegadaReceptoria, GETDATE()) ELSE FechaLlegadaReceptoria END,
                    FechaEntregaCompania = CASE WHEN @totalDespachadoExterno > 0 THEN GETDATE() ELSE NULL END,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @controlRutaId",
                new
                {
                    estadoRuta,
                    tipoDestinoRuta,
                    procesoRuta,
                    companiaId = finalCompaniaDestinoId,
                    tieneEntradaReceptoria = tieneEntradaReceptoria ? 1 : 0,
                    totalDespachadoExterno,
                    dif,
                    merma,
                    usuarioId,
                    controlRutaId
                });

            // Los choferes ya no requieren permiso de "un solo uso" para crear tickets: no se revoca nada.

            return primerControlCompaniaId;
        }

        public async Task<bool> EliminarDespachoDirectoAsync(long controlCompaniaId, int usuarioId)
        {
            using var connection = new SqlConnection(_connectionString);
            var despacho = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_COMPANIAS WHERE Id = @controlCompaniaId", new { controlCompaniaId });
            if (despacho == null) return false;

            long? controlRutaId = (long?)despacho.ControlRutaId;

            // Eliminar registros de entrega asociados en TB_ENTREGAS_COMPANIA para evitar error de FK
            await connection.ExecuteAsync(@"
                DELETE FROM TB_ENTREGAS_COMPANIA 
                WHERE ControlCompaniaId = @controlCompaniaId
                   OR Observacion LIKE '%Control CompaÃ±Ã­as #' + CAST(@controlCompaniaId AS VARCHAR) + '.%'
                   OR Observacion LIKE '%Control Companias #' + CAST(@controlCompaniaId AS VARCHAR) + '.%'
                   OR Observacion LIKE '%Control CompaÃ±Ã­as #' + CAST(@controlCompaniaId AS VARCHAR) + '%'
                   OR Observacion LIKE '%Control Companias #' + CAST(@controlCompaniaId AS VARCHAR) + '%'",
                new { controlCompaniaId });

            await connection.ExecuteAsync("DELETE FROM TB_CONTROL_COMPANIAS WHERE Id = @controlCompaniaId", new { controlCompaniaId });

            if (controlRutaId.HasValue && controlRutaId.Value > 0)
            {
                var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @id", new { id = controlRutaId.Value });
                if (viaje != null)
                {
                    int totalLitrosFinca = (int)(viaje.TotalLitrosFinca ?? 0);
                    int totalDespachado = await connection.ExecuteScalarAsync<int>(
                        "SELECT ISNULL(SUM(LitrosDespachados), 0) FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @id",
                        new { id = controlRutaId.Value });

                    int dif = totalLitrosFinca - totalDespachado;
                    decimal merma = totalLitrosFinca > 0 ? Math.Round((Math.Abs(dif) * 100.0m) / totalLitrosFinca, 2) : 0;

                    await connection.ExecuteAsync(@"
                        UPDATE TB_CONTROL_RUTAS
                        SET TotalLitrosReceptoria = @totalDespachado,
                            LitrosEntregadosCompania = @totalDespachado,
                            DiferenciaLitros = @dif,
                            DiferenciaCompania = @dif,
                            MermaTotalLitros = @dif,
                            PorcentajeMerma = @merma,
                            ModifiedAt = GETDATE(),
                            ModifiedBy = @usuarioId
                        WHERE Id = @id",
                        new { totalDespachado, dif, merma, usuarioId, id = controlRutaId.Value });
                }
            }

            return true;
        }

        public async Task<ResultadoTraspasoDto> TraspasarLecheAViajeAsync(long ticketOrigenId, TraspasarLecheDto dto, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var viajeOrigen = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT cr.*, u.NombreCompleto AS NombreConductor 
                  FROM TB_CONTROL_RUTAS cr
                  INNER JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                  WHERE cr.Id = @ticketOrigenId", new { ticketOrigenId });

            if (viajeOrigen == null) throw new InvalidOperationException("El Ticket de origen no existe.");

            string nombreChoferOrigen = (string)viajeOrigen.NombreConductor;

            if (rol == "CHOFER" && (int)viajeOrigen.UsuarioId != usuarioId)
            {
                throw new UnauthorizedAccessException("No tienes permiso para traspasar leche de viajes de otro conductor.");
            }

            int totalFincaOrigen = (int)(viajeOrigen.TotalLitrosFinca ?? 0);
            int litrosATraspasar = (dto.LitrosTraspaso.HasValue && dto.LitrosTraspaso.Value > 0)
                ? dto.LitrosTraspaso.Value
                : totalFincaOrigen;

            if (litrosATraspasar <= 0)
            {
                throw new InvalidOperationException("El volumen a traspasar debe ser mayor a 0 litros.");
            }

            long ticketDestinoId = 0;
            string nombreChoferDestino = "";
            int choferDestinoId = 0;

            if (dto.TicketDestinoId.HasValue && dto.TicketDestinoId.Value > 0)
            {
                // Caso 1: Asignar a un ticket ya creado
                ticketDestinoId = dto.TicketDestinoId.Value;
                if (ticketDestinoId == ticketOrigenId)
                {
                    throw new InvalidOperationException("No se puede traspasar leche al mismo ticket de origen.");
                }

                var viajeDestino = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    @"SELECT cr.*, u.NombreCompleto AS NombreConductor 
                      FROM TB_CONTROL_RUTAS cr
                      INNER JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                      WHERE cr.Id = @ticketDestinoId", new { ticketDestinoId });

                if (viajeDestino == null)
                {
                    throw new InvalidOperationException($"El Ticket de destino #{ticketDestinoId} no existe.");
                }

                choferDestinoId = (int)viajeDestino.UsuarioId;
                nombreChoferDestino = (string)viajeDestino.NombreConductor;

                // Sumar litros al ticket destino en LitrosCargadosAdicional
                int cargadosPrevios = (int)(viajeDestino.LitrosCargadosAdicional ?? 0);
                int nuevosCargados = cargadosPrevios + litrosATraspasar;
                string obsDestinoActual = (string)(viajeDestino.Observacion ?? "");
                string textoTraspaso = $"RecibiÃ³ TRASPASO de +{litrosATraspasar} Lts desde Ticket #{ticketOrigenId} ({nombreChoferOrigen}). {dto.Observacion}".Trim();
                string obsDestinoFinal = string.IsNullOrWhiteSpace(obsDestinoActual)
                    ? textoTraspaso
                    : $"{obsDestinoActual} | {textoTraspaso}".Trim();

                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET LitrosCargadosAdicional = @nuevosCargados,
                        Observacion = @obsDestinoFinal,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @ticketDestinoId",
                    new { nuevosCargados, obsDestinoFinal, usuarioId, ticketDestinoId });
            }
            else
            {
                // Caso 2: Crear automÃ¡ticamente el ticket de destino
                if (!dto.ChoferDestinoId.HasValue || dto.ChoferDestinoId.Value <= 0)
                {
                    throw new InvalidOperationException("Debe seleccionar el Chofer de destino para crear el nuevo ticket.");
                }

                choferDestinoId = dto.ChoferDestinoId.Value;
                var choferDestino = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT Id, NombreCompleto FROM TB_USUARIOS WHERE Id = @choferDestinoId AND Activo = 1",
                    new { choferDestinoId });

                if (choferDestino == null)
                {
                    throw new InvalidOperationException("El Chofer de destino seleccionado no es vÃ¡lido o estÃ¡ inactivo.");
                }

                nombreChoferDestino = (string)choferDestino.NombreCompleto;
                DateTime fechaDestino = (dto.FechaDestino ?? (DateTime)viajeOrigen.Fecha).Date;

                var cicloId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaDestino BETWEEN FechaInicio AND FechaFin AND Estado = 'ABIERTO'",
                    new { fechaDestino });

                if (!cicloId.HasValue)
                {
                    cicloId = (int?)viajeOrigen.CicloId;
                }

                string obsNuevoTicket = $"Ticket generado por TRASPASO de {litrosATraspasar} Lts desde Ticket #{ticketOrigenId} (Chofer: {viajeOrigen.NombreConductor}). {dto.Observacion}".Trim();

                var sqlInsertNuevo = @"
                    INSERT INTO TB_CONTROL_RUTAS
                    (Fecha, UsuarioId, CicloId, TotalLitrosFinca, TotalLitrosReceptoria, DiferenciaLitros, PorcentajeMerma, Estado, ProcesoActualId, LitrosCargadosAdicional, TipoDestino, Observacion, CreatedAt, CreatedBy)
                    VALUES (@fechaDestino, @choferDestinoId, @cicloId, 0, 0, 0, 0, 'ABIERTO', 1, @litrosATraspasar, 'RECEPTORIA', @obsNuevoTicket, GETDATE(), @usuarioId);
                    SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

                ticketDestinoId = await connection.ExecuteScalarAsync<long>(sqlInsertNuevo, new
                {
                    fechaDestino,
                    choferDestinoId,
                    cicloId,
                    litrosATraspasar,
                    obsNuevoTicket,
                    usuarioId
                });
            }

            // Actualizar historial y bitÃ¡cora del ticket destino
            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@ticketDestinoId, 1, GETDATE(), @usuarioId, @obsDestino);",
                new
                {
                    ticketDestinoId,
                    usuarioId,
                    obsDestino = $"RecepciÃ³n de TRASPASO: +{litrosATraspasar} Lts transferidos desde Ticket #{ticketOrigenId} ({nombreChoferOrigen}). {dto.Observacion}".Trim()
                });

            await connection.ExecuteAsync(@"
                INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                (ControlRutaId, UsuarioId, TipoEntidad, TipoAccion, EntidadId, ValoresAnteriores, ValoresNuevos, Motivo, Fecha)
                VALUES
                (@ticketDestinoId, @usuarioId, 'TICKET', 'TRASPASO_RECIBIDO', @ticketOrigenId, '0 Lts', @valNue, @motivo, GETDATE());",
                new
                {
                    ticketDestinoId,
                    usuarioId,
                    ticketOrigenId,
                    valNue = $"+{litrosATraspasar} Lts recibidos desde Ticket #{ticketOrigenId} ({nombreChoferOrigen})",
                    motivo = dto.Observacion ?? "Traspaso de leche entre choferes"
                });

            // Actualizar Ticket Origen: Finalizar / Traspasar
            int diferenciaOrigen = totalFincaOrigen - litrosATraspasar;
            decimal mermaOrigen = totalFincaOrigen > 0 ? Math.Round((Math.Abs(diferenciaOrigen) * 100.0m) / totalFincaOrigen, 2) : 0;
            string estadoOrigen = "TRASPASADO";
            string obsOrigen = $"Traspaso de {litrosATraspasar} Lts completado hacia Chofer {nombreChoferDestino} (Ticket #{ticketDestinoId}). {dto.Observacion}".Trim();

            await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET TotalLitrosReceptoria = @litrosATraspasar,
                    DiferenciaLitros = @diferenciaOrigen,
                    MermaTotalLitros = @diferenciaOrigen,
                    PorcentajeMerma = @mermaOrigen,
                    TipoDestino = 'TRASPASO_CHOFER',
                    ProcesoActualId = 4,
                    Estado = @estadoOrigen,
                    CerradoPor = @usuarioId,
                    Observacion = ISNULL(Observacion + ' | ', '') + @obsOrigen,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @ticketOrigenId",
                new
                {
                    litrosATraspasar,
                    diferenciaOrigen,
                    mermaOrigen,
                    estadoOrigen,
                    obsOrigen,
                    usuarioId,
                    ticketOrigenId
                });

            // Registrar en historial y bitÃ¡cora del ticket origen
            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@ticketOrigenId, 4, GETDATE(), @usuarioId, @obsHistOrigen);",
                new
                {
                    ticketOrigenId,
                    usuarioId,
                    obsHistOrigen = $"Leche TRASPASADA a Chofer {nombreChoferDestino} (Ticket #{ticketDestinoId}). Volumen: {litrosATraspasar} Lts. {dto.Observacion}".Trim()
                });

            await connection.ExecuteAsync(@"
                INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                (ControlRutaId, UsuarioId, TipoEntidad, TipoAccion, EntidadId, ValoresAnteriores, ValoresNuevos, Motivo, Fecha)
                VALUES
                (@ticketOrigenId, @usuarioId, 'TICKET', 'TRASPASO_ENVIADO', @ticketDestinoId, @valAnt, @valNue, @motivo, GETDATE());",
                new
                {
                    ticketOrigenId,
                    usuarioId,
                    ticketDestinoId,
                    valAnt = $"{totalFincaOrigen} Lts recolectados en fincas",
                    valNue = $"Traspasados {litrosATraspasar} Lts al Ticket #{ticketDestinoId} ({nombreChoferDestino})",
                    motivo = dto.Observacion ?? "Traspaso de leche a otro chofer"
                });

            return new ResultadoTraspasoDto
            {
                TicketOrigenId = ticketOrigenId,
                TicketDestinoId = ticketDestinoId,
                ChoferOrigenNombre = nombreChoferOrigen,
                ChoferDestinoNombre = nombreChoferDestino,
                LitrosTraspasados = litrosATraspasar,
                Mensaje = $"Se traspasaron exitosamente {litrosATraspasar:N0} Lts del Chofer {nombreChoferOrigen} (Ticket #{ticketOrigenId}) al Chofer {nombreChoferDestino} (Ticket #{ticketDestinoId})."
            };
        }

        public async Task<IEnumerable<ControlCompaniaDto>> ObtenerDespachosDeTicketAsync(long controlRutaId)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    c.Id,
                    c.Fecha,
                    c.UsuarioId,
                    u.NombreCompleto AS NombreConductor,
                    c.CompaniaId,
                    comp.Nombre AS NombreCompania,
                    c.CicloId,
                    c.LitrosDespachados,
                    c.LitrosRecibidosCompania,
                    c.DiferenciaLitros,
                    c.PorcentajeMerma,
                    c.Estado,
                    c.TipoLeche,
                    c.Observacion,
                    c.FechaSalida,
                    c.FechaEntrega,
                    c.ControlRutaId,
                    c.CreatedAt
                FROM TB_CONTROL_COMPANIAS c
                LEFT JOIN TB_COMPANIAS comp ON c.CompaniaId = comp.Id
                LEFT JOIN TB_USUARIOS u ON c.UsuarioId = u.Id
                WHERE c.ControlRutaId = @controlRutaId
                ORDER BY c.Id ASC";
            var result = await connection.QueryAsync<ControlCompaniaDto>(sql, new { controlRutaId });
            return result;
        }

        public async Task<ControlTanquesDiarioDto?> ObtenerControlTanquesDiarioAsync(DateTime fecha, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    Id, Fecha,
                    Tanque1Inicial, Tanque2Inicial, Tanque3Inicial, Tanque4Inicial, Tanque5Inicial, TotalInicialLitros,
                    AperturaConfirmada, AperturaConfirmadaPorId, AperturaConfirmadaPorNombre, AperturaConfirmadaAt,
                    TotalEntradasRutasLitros, TotalSalidasPlantasLitros,
                    Tanque1Final, Tanque2Final, Tanque3Final, Tanque4Final, Tanque5Final, TotalFinalFisicoLitros,
                    TotalFinalTeoricoLitros AS TotalTeoricoLitros,
                    DiferenciaLitros AS DiferenciaMermaLitros,
                    CierreConfirmado, CierreConfirmadoPorId, CierreConfirmadoPorNombre, CierreConfirmadoAt,
                    Estado, FilasRecepcionJson, Observaciones
                FROM TB_CONTROL_TANQUES_DIARIO 
                WHERE Fecha = @fecha";

            var record = await connection.QueryFirstOrDefaultAsync<ControlTanquesDiarioDto>(sql, new { fecha = fecha.Date });

            bool esAdmin = rol.Equals("ADMIN", StringComparison.OrdinalIgnoreCase) || rol.Equals("ADMINISTRADOR", StringComparison.OrdinalIgnoreCase);

            // Obtener tanques iniciales del dÃ­a anterior como base
            var sqlPrev = @"SELECT TOP 1 Tanque1Final, Tanque2Final, Tanque3Final, Tanque4Final, Tanque5Final, TotalFinalFisicoLitros 
                            FROM TB_CONTROL_TANQUES_DIARIO WHERE Fecha < @fecha ORDER BY Fecha DESC";
            var prevDia = await connection.QueryFirstOrDefaultAsync<dynamic>(sqlPrev, new { fecha = fecha.Date });

            int t1Ini = prevDia?.Tanque1Final ?? 0;
            int t2Ini = prevDia?.Tanque2Final ?? 0;
            int t3Ini = prevDia?.Tanque3Final ?? 0;
            int t4Ini = prevDia?.Tanque4Final ?? 0;
            int t5Ini = prevDia?.Tanque5Final ?? 0;
            int totalIni = prevDia?.TotalFinalFisicoLitros ?? (t1Ini + t2Ini + t3Ini + t4Ini + t5Ini);

            // Obtener Entradas y Salidas reales del dÃ­a (Servicio Tipo 1: RUTA)
            var sqlMovimientos = @"
                -- ENTRADAS A SILOS (Compañía Principal / Receptoría)
                SELECT 
                    e.Id,
                    CONVERT(varchar(10), e.Fecha, 120) AS FechaStr,
                    ISNULL(u.NombreCompleto, u.Username) AS Chofer,
                    e.Litros AS Litros,
                    'ENTRADA' AS TipoMovimiento,
                    ISNULL(e.TipoLeche, 'VACA') AS TipoLeche,
                    ISNULL(cr.DiferenciaLitros, 0) AS Diferencias,
                    'GENERAL' AS PorTipoLeche,
                    ISNULL(cr.Observacion, 'Descarga Silos') AS Detalle
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON e.ControlRutaId = cr.Id
                WHERE CAST(e.Fecha AS DATE) = @fecha 
                  AND (ISNULL(c.EsPrincipal, 0) = 1 OR UPPER(c.Nombre) LIKE '%RECEPTORIA%')

                UNION ALL

                -- SALIDAS / DESPACHOS A PLANTAS / QUESERAS DESDE SILOS
                SELECT 
                    e.Id,
                    CONVERT(varchar(10), e.Fecha, 120) AS FechaStr,
                    'Despacho: ' + ISNULL(c.Nombre, 'Planta') AS Chofer,
                    e.Litros AS Litros,
                    'SALIDA' AS TipoMovimiento,
                    ISNULL(e.TipoLeche, 'VACA') AS TipoLeche,
                    ISNULL(cc.DiferenciaLitros, 0) AS Diferencias,
                    'GENERAL' AS PorTipoLeche,
                    'Salida Cisterna a ' + ISNULL(c.Nombre, 'Cliente') AS Detalle
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                LEFT JOIN TB_CONTROL_COMPANIAS cc ON e.ControlCompaniaId = cc.Id
                WHERE CAST(e.Fecha AS DATE) = @fecha 
                  AND ISNULL(c.EsPrincipal, 0) = 0
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORIA%'
                  AND e.ControlRutaId IS NULL

                ORDER BY TipoMovimiento DESC, Id ASC";

            var movimientos = (await connection.QueryAsync<dynamic>(sqlMovimientos, new { fecha = fecha.Date })).ToList();
            var filasAuto = new List<object>();
            int sumEntradas = 0;
            int sumSalidas = 0;

            int filaId = 1;
            foreach (var m in movimientos)
            {
                string mov = Convert.ToString(m.TipoMovimiento) ?? "ENTRADA";
                int lts = Convert.ToInt32(m.Litros ?? 0);
                if (mov == "ENTRADA") sumEntradas += lts;
                else sumSalidas += lts;

                filasAuto.Add(new
                {
                    id = filaId++,
                    fecha = Convert.ToString(m.FechaStr) ?? "",
                    chofer = Convert.ToString(m.Chofer) ?? "",
                    litros = lts,
                    tipoMovimiento = mov,
                    tipoLeche = Convert.ToString(m.TipoLeche) ?? "VACA",
                    diferencias = Convert.ToInt32(m.Diferencias ?? 0),
                    porTipoLeche = Convert.ToString(m.PorTipoLeche) ?? "GENERAL",
                    detalle = Convert.ToString(m.Detalle) ?? ""
                });
            }

            // Si no hubiera entregas en TB_ENTREGAS_COMPANIA pero sÃ­ controles de ruta registrados
            if (filasAuto.Count == 0)
            {
                var sqlRutasFallback = @"
                    SELECT 
                        cr.Id,
                        CONVERT(varchar(10), cr.Fecha, 120) AS FechaStr,
                        ISNULL(u.NombreCompleto, u.Username) AS Chofer,
                        ISNULL(cr.LitrosRecibidosReceptoria, ISNULL(cr.TotalLitrosReceptoria, cr.TotalLitrosFinca)) AS Litros,
                        'ENTRADA' AS TipoMovimiento,
                        'VACA' AS TipoLeche,
                        ISNULL(cr.DiferenciaLitros, 0) AS Diferencias,
                        'GENERAL' AS PorTipoLeche,
                        ISNULL(rl.Nombre, 'Ruta') AS Detalle
                    FROM TB_CONTROL_RUTAS cr
                    LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                    LEFT JOIN TB_RUTAS_LOGISTICA rl ON cr.RutaLogisticaId = rl.Id
                    WHERE CAST(cr.Fecha AS DATE) = @fecha
                    ORDER BY cr.Id ASC";

                var fallback = (await connection.QueryAsync<dynamic>(sqlRutasFallback, new { fecha = fecha.Date })).ToList();
                foreach (var fb in fallback)
                {
                    int lts = Convert.ToInt32(fb.Litros ?? 0);
                    sumEntradas += lts;
                    filasAuto.Add(new
                    {
                        id = filaId++,
                        fecha = Convert.ToString(fb.FechaStr) ?? "",
                        chofer = Convert.ToString(fb.Chofer) ?? "",
                        litros = lts,
                        tipoMovimiento = "ENTRADA",
                        tipoLeche = Convert.ToString(fb.TipoLeche) ?? "VACA",
                        diferencias = Convert.ToInt32(fb.Diferencias ?? 0),
                        porTipoLeche = Convert.ToString(fb.PorTipoLeche) ?? "GENERAL",
                        detalle = Convert.ToString(fb.Detalle) ?? ""
                    });
                }
            }

            string jsonAuto = System.Text.Json.JsonSerializer.Serialize(filasAuto);

            if (record != null)
            {
                bool esPasadoOConfirmado = record.CierreConfirmado;
                record.PuedeModificar = esAdmin || !esPasadoOConfirmado;

                // Si no tiene tanques iniciales cargados, auto-asignar del dÃ­a previo
                if (record.Tanque1Inicial == 0 && record.Tanque2Inicial == 0 && record.Tanque3Inicial == 0 && record.Tanque4Inicial == 0 && record.Tanque5Inicial == 0 && totalIni > 0)
                {
                    record.Tanque1Inicial = t1Ini;
                    record.Tanque2Inicial = t2Ini;
                    record.Tanque3Inicial = t3Ini;
                    record.Tanque4Inicial = t4Ini;
                    record.Tanque5Inicial = t5Ini;
                    record.TotalInicialLitros = totalIni;
                }

                // Si no tiene filas de recepciÃ³n registradas o estÃ¡n vacÃ­as, auto-llenar con los movimientos de hoy
                if (string.IsNullOrWhiteSpace(record.FilasRecepcionJson) || record.FilasRecepcionJson == "[]" || record.TotalEntradasRutasLitros == 0)
                {
                    if (filasAuto.Count > 0)
                    {
                        record.FilasRecepcionJson = jsonAuto;
                        record.TotalEntradasRutasLitros = sumEntradas;
                        record.TotalSalidasPlantasLitros = sumSalidas;
                    }
                }

                return record;
            }

            return new ControlTanquesDiarioDto
            {
                Fecha = fecha.Date,
                Tanque1Inicial = t1Ini,
                Tanque2Inicial = t2Ini,
                Tanque3Inicial = t3Ini,
                Tanque4Inicial = t4Ini,
                Tanque5Inicial = t5Ini,
                TotalInicialLitros = totalIni,
                FilasRecepcionJson = jsonAuto,
                TotalEntradasRutasLitros = sumEntradas,
                TotalSalidasPlantasLitros = sumSalidas,
                PuedeModificar = true,
                Estado = "BORRADOR"
            };
        }

        public async Task<int> GuardarControlTanquesDiarioAsync(ControlTanquesDiarioDto dto, int userId, string userName, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            bool esAdmin = rol.Equals("ADMIN", StringComparison.OrdinalIgnoreCase) || rol.Equals("ADMINISTRADOR", StringComparison.OrdinalIgnoreCase);

            // Verificar si ya existe
            var existente = await connection.QueryFirstOrDefaultAsync<ControlTanquesDiarioDto>(
                "SELECT * FROM TB_CONTROL_TANQUES_DIARIO WHERE Fecha = @fecha", new { fecha = dto.Fecha.Date });

            if (existente != null && (existente.CierreConfirmado || existente.Fecha.Date < DateTime.UtcNow.Date))
            {
                if (!esAdmin)
                {
                    throw new UnauthorizedAccessException("Este control diario ya estÃ¡ confirmado y cerrado. De allÃ­ para atrÃ¡s solo el Administrador puede modificar datos.");
                }
            }

            dto.TotalInicialLitros = dto.Tanque1Inicial + dto.Tanque2Inicial + dto.Tanque3Inicial + dto.Tanque4Inicial + dto.Tanque5Inicial;
            dto.TotalFinalFisicoLitros = dto.Tanque1Final + dto.Tanque2Final + dto.Tanque3Final + dto.Tanque4Final + dto.Tanque5Final;
            dto.TotalTeoricoLitros = dto.TotalInicialLitros + dto.TotalEntradasRutasLitros - dto.TotalSalidasPlantasLitros;
            dto.DiferenciaMermaLitros = dto.TotalFinalFisicoLitros - dto.TotalTeoricoLitros;

            if (existente == null)
            {
                var sqlInsert = @"
                    INSERT INTO TB_CONTROL_TANQUES_DIARIO (
                        Fecha, Tanque1Inicial, Tanque2Inicial, Tanque3Inicial, Tanque4Inicial, Tanque5Inicial, TotalInicialLitros,
                        AperturaConfirmada, AperturaConfirmadaPorId, AperturaConfirmadaPorNombre, AperturaConfirmadaAt,
                        TotalEntradasRutasLitros, TotalSalidasPlantasLitros,
                        Tanque1Final, Tanque2Final, Tanque3Final, Tanque4Final, Tanque5Final, TotalFinalFisicoLitros,
                        TotalTeoricoLitros, DiferenciaMermaLitros, CierreConfirmado, Estado, FilasRecepcionJson, Observaciones,
                        CreatedBy, CreatedAt
                    )
                    VALUES (
                        @Fecha, @Tanque1Inicial, @Tanque2Inicial, @Tanque3Inicial, @Tanque4Inicial, @Tanque5Inicial, @TotalInicialLitros,
                        @AperturaConfirmada, @AperturaConfirmadaPorId, @AperturaConfirmadaPorNombre, @AperturaConfirmadaAt,
                        @TotalEntradasRutasLitros, @TotalSalidasPlantasLitros,
                        @Tanque1Final, @Tanque2Final, @Tanque3Final, @Tanque4Final, @Tanque5Final, @TotalFinalFisicoLitros,
                        @TotalTeoricoLitros, @DiferenciaMermaLitros, @CierreConfirmado, @Estado, @FilasRecepcionJson, @Observaciones,
                        @CreatedBy, GETDATE()
                    );
                    SELECT CAST(SCOPE_IDENTITY() AS INT);";

                return await connection.ExecuteScalarAsync<int>(sqlInsert, new
                {
                    dto.Fecha,
                    dto.Tanque1Inicial,
                    dto.Tanque2Inicial,
                    dto.Tanque3Inicial,
                    dto.Tanque4Inicial,
                    dto.Tanque5Inicial,
                    dto.TotalInicialLitros,
                    dto.AperturaConfirmada,
                    dto.AperturaConfirmadaPorId,
                    dto.AperturaConfirmadaPorNombre,
                    dto.AperturaConfirmadaAt,
                    dto.TotalEntradasRutasLitros,
                    dto.TotalSalidasPlantasLitros,
                    dto.Tanque1Final,
                    dto.Tanque2Final,
                    dto.Tanque3Final,
                    dto.Tanque4Final,
                    dto.Tanque5Final,
                    dto.TotalFinalFisicoLitros,
                    dto.TotalTeoricoLitros,
                    dto.DiferenciaMermaLitros,
                    dto.CierreConfirmado,
                    dto.Estado,
                    dto.FilasRecepcionJson,
                    dto.Observaciones,
                    CreatedBy = userId
                });
            }
            else
            {
                var sqlUpdate = @"
                    UPDATE TB_CONTROL_TANQUES_DIARIO
                    SET Tanque1Inicial = @Tanque1Inicial,
                        Tanque2Inicial = @Tanque2Inicial,
                        Tanque3Inicial = @Tanque3Inicial,
                        Tanque4Inicial = @Tanque4Inicial,
                        Tanque5Inicial = @Tanque5Inicial,
                        TotalInicialLitros = @TotalInicialLitros,
                        TotalEntradasRutasLitros = @TotalEntradasRutasLitros,
                        TotalSalidasPlantasLitros = @TotalSalidasPlantasLitros,
                        Tanque1Final = @Tanque1Final,
                        Tanque2Final = @Tanque2Final,
                        Tanque3Final = @Tanque3Final,
                        Tanque4Final = @Tanque4Final,
                        Tanque5Final = @Tanque5Final,
                        TotalFinalFisicoLitros = @TotalFinalFisicoLitros,
                        TotalTeoricoLitros = @TotalTeoricoLitros,
                        DiferenciaMermaLitros = @DiferenciaMermaLitros,
                        FilasRecepcionJson = @FilasRecepcionJson,
                        Observaciones = @Observaciones,
                        ModifiedBy = @ModifiedBy,
                        ModifiedAt = GETDATE()
                    WHERE Fecha = @Fecha";

                await connection.ExecuteAsync(sqlUpdate, new
                {
                    dto.Fecha,
                    dto.Tanque1Inicial,
                    dto.Tanque2Inicial,
                    dto.Tanque3Inicial,
                    dto.Tanque4Inicial,
                    dto.Tanque5Inicial,
                    dto.TotalInicialLitros,
                    dto.TotalEntradasRutasLitros,
                    dto.TotalSalidasPlantasLitros,
                    dto.Tanque1Final,
                    dto.Tanque2Final,
                    dto.Tanque3Final,
                    dto.Tanque4Final,
                    dto.Tanque5Final,
                    dto.TotalFinalFisicoLitros,
                    dto.TotalTeoricoLitros,
                    dto.DiferenciaMermaLitros,
                    dto.FilasRecepcionJson,
                    dto.Observaciones,
                    ModifiedBy = userId
                });

                return existente.Id;
            }
        }

        public async Task<bool> ConfirmarAperturaTanquesAsync(DateTime fecha, int userId, string userName, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            bool esAdminOSup = rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) || rol.Contains("SUPERVISOR", StringComparison.OrdinalIgnoreCase);
            if (!esAdminOSup) throw new UnauthorizedAccessException("Solo un Supervisor o Administrador puede confirmar la apertura del dÃ­a.");

            var sql = @"
                UPDATE TB_CONTROL_TANQUES_DIARIO
                SET AperturaConfirmada = 1,
                    AperturaConfirmadaPorId = @userId,
                    AperturaConfirmadaPorNombre = @userName,
                    AperturaConfirmadaAt = GETDATE(),
                    ModifiedBy = @userId,
                    ModifiedAt = GETDATE()
                WHERE Fecha = @fecha";

            var rows = await connection.ExecuteAsync(sql, new { fecha = fecha.Date, userId, userName });
            return rows > 0;
        }

        public async Task<bool> ConfirmarCierreTanquesAsync(DateTime fecha, int userId, string userName, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            bool esAdminOSup = rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) || rol.Contains("SUPERVISOR", StringComparison.OrdinalIgnoreCase);
            if (!esAdminOSup) throw new UnauthorizedAccessException("Solo un Supervisor o Administrador puede confirmar el cierre del dÃ­a.");

            var sql = @"
                UPDATE TB_CONTROL_TANQUES_DIARIO
                SET CierreConfirmado = 1,
                    Estado = 'CONFIRMADO',
                    CierreConfirmadoPorId = @userId,
                    CierreConfirmadoPorNombre = @userName,
                    CierreConfirmadoAt = GETDATE(),
                    ModifiedBy = @userId,
                    ModifiedAt = GETDATE()
                WHERE Fecha = @fecha";

            var rows = await connection.ExecuteAsync(sql, new { fecha = fecha.Date, userId, userName });
            return rows > 0;
        }

        public async Task<bool> EditarFincaDeViajeAuditadoAsync(long controlRutaId, long rutaId, EditarFincaViajeAuditadoDto dto, int usuarioId, string rol)
        {
            if (string.IsNullOrWhiteSpace(dto.Motivo)) throw new ArgumentException("El motivo o justificación de la modificación es obligatorio.");

            using var connection = new SqlConnection(_connectionString);
            if (!await TieneAccesoAdminOPermisoAsync(connection, usuarioId, rol, "CONTROL_RUTAS_EDITAR", "RUTAS_EDITAR"))
                throw new UnauthorizedAccessException("No tienes permisos de Administrador o edición de rutas para modificar fincas desde el Control de Viaje.");

            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) throw new InvalidOperationException("El Viaje / Ticket no existe.");

            var rutaActual = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT r.*, f.Nombre AS FincaNombre, f.PrecioLitroUSD, f.PrecioLitroAcidaUSD 
                  FROM TB_RUTAS_RECOLECCION r 
                  INNER JOIN TB_FINCAS f ON r.FincaId = f.Id 
                  WHERE r.Id = @rutaId AND r.ControlRutaId = @controlRutaId", new { rutaId, controlRutaId });
            if (rutaActual == null) throw new InvalidOperationException("La recolecciÃ³n de finca no pertenece a este ticket o no existe.");

            string tipoLeche = string.IsNullOrWhiteSpace(dto.TipoLeche) ? ((string?)rutaActual.TipoLeche ?? "VACA") : dto.TipoLeche.Trim().ToUpper();

            var fincaNueva = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT Id, Nombre, PrecioLitroUSD, PrecioLitroAcidaUSD, TieneDosTiposLeche, PrecioBufalaLitroUSD FROM TB_FINCAS WHERE Id = @FincaId", new { dto.FincaId });
            if (fincaNueva == null) throw new InvalidOperationException("La finca seleccionada no existe.");

            decimal precioAplicado;
            if (dto.EsAcida)
            {
                precioAplicado = (decimal)(fincaNueva.PrecioLitroAcidaUSD ?? 0.2000m);
            }
            else if (tipoLeche == "BUFALA" && fincaNueva.TieneDosTiposLeche == true && fincaNueva.PrecioBufalaLitroUSD != null)
            {
                precioAplicado = (decimal)fincaNueva.PrecioBufalaLitroUSD;
            }
            else
            {
                precioAplicado = (decimal)(fincaNueva.PrecioLitroUSD ?? 0.3500m);
            }

            string valAnt = $"Finca: {rutaActual.FincaNombre} (ID: {rutaActual.FincaId}), Tipo: {rutaActual.TipoLeche ?? "VACA"}, Litros: {rutaActual.Litros}, EsAcida: {((bool)rutaActual.EsAcida ? "SI" : "NO")}, Diferido: {((bool)(rutaActual.EsDiferido ?? false) ? "SI" : "NO")}, Obs: {rutaActual.Observacion ?? "-"}";
            string valNue = $"Finca: {fincaNueva.Nombre} (ID: {dto.FincaId}), Tipo: {tipoLeche}, Litros: {dto.Litros}, EsAcida: {(dto.EsAcida ? "SI" : "NO")}, Diferido: {(dto.EsDiferido ? "SI" : "NO")}, Obs: {dto.Observacion ?? "-"}";

            // 1. Actualizar la recolecciÃ³n
            await connection.ExecuteAsync(@"
                UPDATE TB_RUTAS_RECOLECCION
                SET FincaId = @FincaId,
                    Litros = @Litros,
                    EsAcida = @EsAcida,
                    EsDiferido = @EsDiferido,
                    TipoLeche = @tipoLeche,
                    PrecioLitroUSDAplicado = @precioAplicado,
                    Observacion = @Observacion,
                    FotoComprobante = ISNULL(@FotoComprobante, FotoComprobante),
                    FotosEvidenciaJson = ISNULL(@FotosEvidenciaJson, FotosEvidenciaJson),
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @rutaId",
                new { dto.FincaId, dto.Litros, dto.EsAcida, dto.EsDiferido, tipoLeche, precioAplicado, dto.Observacion, dto.FotoComprobante, dto.FotosEvidenciaJson, usuarioId, rutaId });

            // 2. Registrar en BitÃ¡cora de AuditorÃ­a
            await connection.ExecuteAsync(@"
                INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                (ControlRutaId, TipoEntidad, EntidadId, TipoAccion, ValoresAnteriores, ValoresNuevos, Motivo, UsuarioId, Fecha)
                VALUES (@controlRutaId, 'FINCA_RUTA', @rutaId, 'EDITAR_FINCA', @valAnt, @valNue, @Motivo, @usuarioId, GETDATE());",
                new { controlRutaId, rutaId, valAnt, valNue, dto.Motivo, usuarioId });

            // 3. Recalcular mÃ©tricas del ticket
            await _RecalcularMetricasTicketAsync(connection, controlRutaId, usuarioId);

            return true;
        }

        public async Task<bool> EliminarFincaDeViajeAuditadoAsync(long controlRutaId, long rutaId, string motivo, int usuarioId, string rol)
        {
            if (string.IsNullOrWhiteSpace(motivo)) throw new ArgumentException("El motivo o justificación de la eliminación es obligatorio.");

            using var connection = new SqlConnection(_connectionString);
            if (!await TieneAccesoAdminOPermisoAsync(connection, usuarioId, rol, "CONTROL_RUTAS_ELIMINAR", "RUTAS_ELIMINAR"))
                throw new UnauthorizedAccessException("No tienes permisos de Administrador o eliminación de rutas para eliminar fincas desde el Control de Viaje.");

            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) throw new InvalidOperationException("El Viaje / Ticket no existe.");

            var rutaActual = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT r.*, f.Nombre AS FincaNombre 
                  FROM TB_RUTAS_RECOLECCION r 
                  INNER JOIN TB_FINCAS f ON r.FincaId = f.Id 
                  WHERE r.Id = @rutaId AND r.ControlRutaId = @controlRutaId", new { rutaId, controlRutaId });
            if (rutaActual == null) throw new InvalidOperationException("La recolecciÃ³n de finca no pertenece a este ticket o no existe.");

            string valAnt = $"Finca: {rutaActual.FincaNombre} (ID: {rutaActual.FincaId}), Litros: {rutaActual.Litros}, EsAcida: {((bool)rutaActual.EsAcida ? "SI" : "NO")}, Obs: {rutaActual.Observacion ?? "-"}";

            // 1. Eliminar la recolecciÃ³n
            await connection.ExecuteAsync("DELETE FROM TB_RUTAS_RECOLECCION WHERE Id = @rutaId", new { rutaId });

            // 2. Registrar en BitÃ¡cora de AuditorÃ­a
            await connection.ExecuteAsync(@"
                INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                (ControlRutaId, TipoEntidad, EntidadId, TipoAccion, ValoresAnteriores, ValoresNuevos, Motivo, UsuarioId, Fecha)
                VALUES (@controlRutaId, 'FINCA_RUTA', @rutaId, 'ELIMINAR_FINCA', @valAnt, NULL, @motivo, @usuarioId, GETDATE());",
                new { controlRutaId, rutaId, valAnt, motivo, usuarioId });

            // 3. Recalcular mÃ©tricas del ticket
            await _RecalcularMetricasTicketAsync(connection, controlRutaId, usuarioId);

            return true;
        }

        public async Task<bool> LimpiarFincaTicketAsync(long controlRutaId, long rutaId, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);

            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) throw new InvalidOperationException("El Viaje / Ticket no existe.");

            var rutaActual = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT r.*, f.Nombre AS FincaNombre 
                  FROM TB_RUTAS_RECOLECCION r 
                  INNER JOIN TB_FINCAS f ON r.FincaId = f.Id 
                  WHERE r.Id = @rutaId AND r.ControlRutaId = @controlRutaId", new { rutaId, controlRutaId });
            if (rutaActual == null) throw new InvalidOperationException("La recolecciÃ³n de finca no pertenece a este ticket o no existe.");

            string valAnt = $"Finca: {rutaActual.FincaNombre}, Litros: {rutaActual.Litros}, EsAcida: {((bool)rutaActual.EsAcida ? "SI" : "NO")}, Obs: {rutaActual.Observacion ?? "-"}, Foto: {(string.IsNullOrEmpty((string)rutaActual.FotoComprobante) ? "NO" : "SI")}";

            // Eliminar recolección de TB_RUTAS_RECOLECCION (la finca sigue visible en gris desde la ruta planificada)
            await connection.ExecuteAsync(@"
                DELETE FROM TB_RUTAS_RECOLECCION
                WHERE Id = @rutaId", new { rutaId });

            // Registrar en auditorÃ­a
            try
            {
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                    (ControlRutaId, TipoEntidad, EntidadId, TipoAccion, ValoresAnteriores, ValoresNuevos, Motivo, UsuarioId, Fecha)
                    VALUES (@controlRutaId, 'FINCA_RUTA', @rutaId, 'LIMPIAR_RECOLECCION', @valAnt, 'Litros: 0 (No Recogida)', 'InformaciÃ³n de recolecciÃ³n eliminada (marcada como no recogida)', @usuarioId, GETDATE());",
                    new { controlRutaId, rutaId, valAnt, usuarioId });
            }
            catch { /* Tolerante */ }

            // Recalcular mÃ©tricas del ticket
            await _RecalcularMetricasTicketAsync(connection, controlRutaId, usuarioId);

            // Notificar al conductor si aplica
            if (viaje.UsuarioId != null)
            {
                int chofId = (int)viaje.UsuarioId;
                string fNom = (string)rutaActual.FincaNombre;
                try
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                        VALUES (@chofId, 'RECOLECCION_RESETEADA', 'ðŸ”„ Parada Marcada como Pendiente', @msg, GETDATE(), @controlRutaId, 0, GETDATE())",
                        new { 
                            chofId, 
                            controlRutaId, 
                            msg = $"La informaciÃ³n de \"{fNom}\" fue limpiada y colocada como NO RECOGIDA para tu recorrido en el Ticket #{controlRutaId}." 
                        });
                }
                catch { /* Tolerante */ }
            }

            return true;
        }

        public async Task<ValidarCargaMasivaExcelResponseDto> ValidarCargaMasivaExcelAsync(ValidarCargaMasivaExcelRequestDto dto, int usuarioId, string rol)
        {
            var response = new ValidarCargaMasivaExcelResponseDto
            {
                TotalFilas = dto.Filas?.Count ?? 0,
            };

            if (dto.Filas == null || !dto.Filas.Any())
            {
                response.DataValida = true;
                response.MensajeGeneral = "No se recibieron filas para validar.";
                return response;
            }

            using var connection = new SqlConnection(_connectionString);

            // Obtener camiones activos asociados a choferes
            var camiones = (await connection.QueryAsync<dynamic>(
                @"SELECT c.Id, c.Placa, c.CapacidadLitros, c.UsuarioId 
                  FROM TB_CAMIONES c 
                  WHERE c.Activo = 1 AND c.IsDeleted = 0")).ToList();

            // Fechas Ãºnicas y Fincas Ãºnicas para consultar duplicados eficientemente
            var fechas = dto.Filas.Where(f => f.Fecha.HasValue).Select(f => f.Fecha.Value.Date).Distinct().ToList();
            var fincasIds = dto.Filas.Where(f => f.FincaId > 0).Select(f => f.FincaId).Distinct().ToList();

            IEnumerable<dynamic> existentes = new List<dynamic>();
            if (fechas.Any() && fincasIds.Any())
            {
                existentes = await connection.QueryAsync<dynamic>(
                    @"SELECT r.Id AS RutaId, r.ControlRutaId, r.Fecha, r.FincaId, r.Litros, r.EsAcida, r.TipoLeche, r.UsuarioId AS RutaChoferId,
                             cr.Id AS TicketId, CAST(cr.Id AS VARCHAR(50)) AS CodigoTicket, cr.UsuarioId AS TicketChoferId, cr.Estado AS TicketEstado
                      FROM TB_RUTAS_RECOLECCION r
                      LEFT JOIN TB_CONTROL_RUTAS cr ON r.ControlRutaId = cr.Id
                      WHERE CAST(r.Fecha AS DATE) IN @fechas AND r.FincaId IN @fincasIds",
                    new { fechas, fincasIds });
            }

            var resultados = new List<FilaResultadoValidacionDto>();
            int validas = 0;
            int duplicadas = 0;
            int conError = 0;

            foreach (var fila in dto.Filas)
            {
                var res = new FilaResultadoValidacionDto
                {
                    Index = fila.Index,
                    EsValido = true,
                    EsDuplicado = false,
                };

                // 1. Validaciones bÃ¡sicas
                if (!fila.Fecha.HasValue)
                {
                    res.EsValido = false;
                    res.Mensaje = "Fecha no especificada o invÃ¡lida.";
                    conError++;
                    resultados.Add(res);
                    continue;
                }

                if (fila.FincaId <= 0)
                {
                    res.EsValido = false;
                    res.Mensaje = string.IsNullOrWhiteSpace(fila.FincaNombre) 
                        ? "Finca no identificada." 
                        : $"La finca \"{fila.FincaNombre}\" no existe en el catÃ¡logo activo.";
                    conError++;
                    resultados.Add(res);
                    continue;
                }

                if (fila.ConductorId <= 0)
                {
                    res.EsValido = false;
                    res.Mensaje = string.IsNullOrWhiteSpace(fila.ConductorNombre) 
                        ? "Conductor no identificado." 
                        : $"El conductor \"{fila.ConductorNombre}\" no existe o no estÃ¡ activo.";
                    conError++;
                    resultados.Add(res);
                    continue;
                }

                if (fila.Litros <= 0)
                {
                    res.EsValido = false;
                    res.Mensaje = "La cantidad de litros debe ser mayor a 0.";
                    conError++;
                    resultados.Add(res);
                    continue;
                }

                // 2. Asociar CamiÃ³n automÃ¡ticamente por conductor
                var camionAsociado = camiones.FirstOrDefault(c => c.UsuarioId == fila.ConductorId) 
                                     ?? camiones.FirstOrDefault(c => c.Placa == "S/P-9" || c.Placa == "S/P-4")
                                     ?? camiones.FirstOrDefault();
                if (camionAsociado != null)
                {
                    res.CamionId = (int)camionAsociado.Id;
                    res.CamionPlaca = (string)camionAsociado.Placa;
                    res.CamionCapacidadLitros = camionAsociado.CapacidadLitros != null ? (int)camionAsociado.CapacidadLitros : 10000;
                }

                // 3. Validar si ya estÃ¡ registrada (DetecciÃ³n de Duplicados)
                var fechaFila = fila.Fecha.Value.Date;
                var tipoFila = !string.IsNullOrWhiteSpace(fila.TipoLeche) ? fila.TipoLeche.Trim().ToUpper() : "VACA";
                var match = existentes.FirstOrDefault(e => 
                    ((DateTime)e.Fecha).Date == fechaFila &&
                    (int)e.FincaId == fila.FincaId &&
                    (int)e.Litros == fila.Litros &&
                    (((string)e.TipoLeche ?? "VACA").Trim().ToUpper() == tipoFila) &&
                    ((e.RutaChoferId != null && (int)e.RutaChoferId == fila.ConductorId) ||
                     (e.TicketChoferId != null && (int)e.TicketChoferId == fila.ConductorId)));

                if (match == null)
                {
                    match = existentes.FirstOrDefault(e => 
                        ((DateTime)e.Fecha).Date == fechaFila &&
                        (int)e.FincaId == fila.FincaId &&
                        (((string)e.TipoLeche ?? "VACA").Trim().ToUpper() == tipoFila) &&
                        ((e.RutaChoferId != null && (int)e.RutaChoferId == fila.ConductorId) ||
                         (e.TicketChoferId != null && (int)e.TicketChoferId == fila.ConductorId)));
                }

                if (match != null)
                {
                    res.EsDuplicado = true;
                    res.TicketExistenteId = match.TicketId != null ? (long)match.TicketId : (match.ControlRutaId != null ? (long)match.ControlRutaId : null);
                    res.TicketCodigo = match.CodigoTicket ?? (res.TicketExistenteId?.ToString());
                    res.TicketEstado = match.TicketEstado ?? "REGISTRADO";
                    res.Mensaje = $"Ya registrada en Ticket #{res.TicketCodigo ?? res.TicketExistenteId?.ToString()} ({res.TicketEstado}) con {match.Litros} Lts.";
                    duplicadas++;
                }
                else
                {
                    res.Mensaje = "Fila vÃ¡lida. Lista para crear ticket.";
                    validas++;
                }

                resultados.Add(res);
            }

            response.Resultados = resultados;
            response.FilasValidas = validas;
            response.FilasDuplicadas = duplicadas;
            response.FilasConError = conError;
            response.DataValida = conError == 0;

            if (conError > 0)
            {
                response.MensajeGeneral = $"Se detectaron {conError} fila(s) con errores crÃ­ticos que deben corregirse.";
            }
            else if (duplicadas > 0)
            {
                response.MensajeGeneral = $"Data analizada correctamente. Se detectaron {duplicadas} registro(s) que ya existen en el sistema (pueden ser omitidos automÃ¡ticamente).";
            }
            else
            {
                response.MensajeGeneral = "Â¡Data 100% vÃ¡lida! No se encontraron inconsistencias ni registros duplicados. Lista para generar tickets.";
            }

            return response;
        }

        public async Task<EjecutarCargaMasivaExcelResponseDto> EjecutarCargaMasivaExcelAsync(EjecutarCargaMasivaExcelRequestDto dto, int usuarioId, string rol)
        {
            if (!rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase))
            {
                throw new UnauthorizedAccessException("Solo usuarios con rol Administrador o SuperAdmin tienen autorizaciÃ³n para importar tickets masivos.");
            }

            if (dto.Filas == null || !dto.Filas.Any())
            {
                throw new InvalidOperationException("No se recibieron filas para procesar.");
            }

            using var connection = new SqlConnection(_connectionString);
            await EnsureTableNotificacionesExistsAsync(connection);

            var tasaBcv = await connection.ExecuteScalarAsync<decimal?>("SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC") ?? 1.0m;
            var fincas = (await connection.QueryAsync<dynamic>("SELECT Id, Codigo, Nombre, PrecioLitroUSD, PrecioLitroAcidaUSD, TieneDosTiposLeche, PrecioBufalaLitroUSD FROM TB_FINCAS")).ToDictionary(f => (int)f.Id);
            var choferes = (await connection.QueryAsync<dynamic>("SELECT Id, NombreCompleto FROM TB_USUARIOS")).ToDictionary(u => (int)u.Id);
            var camiones = (await connection.QueryAsync<dynamic>("SELECT Id, Placa, CapacidadLitros, UsuarioId FROM TB_CAMIONES WHERE Activo = 1 AND IsDeleted = 0")).ToList();

            // Agrupar filas por (Fecha, ConductorId)
            var grupos = dto.Filas
                .Where(f => f.Fecha != default && f.FincaId > 0 && f.ConductorId > 0 && f.Litros > 0)
                .GroupBy(f => new { Fecha = f.Fecha.Date, f.ConductorId })
                .ToList();

            var ticketsCreados = new List<ResumenTicketCreadoDto>();
            int totalParadas = 0;
            int totalLitrosGlobal = 0;

            foreach (var grupo in grupos)
            {
                var fechaGrupo = grupo.Key.Fecha;
                var conductorId = grupo.Key.ConductorId;

                // Determinar camiÃ³n
                var camion = camiones.FirstOrDefault(c => c.UsuarioId == conductorId) 
                             ?? camiones.FirstOrDefault(c => c.Placa == "S/P-9" || c.Placa == "S/P-4") 
                             ?? camiones.FirstOrDefault();
                string camionPlaca = camion != null ? (string)camion.Placa : "S/P";
                int? camionId = camion != null ? (int?)camion.Id : null;

                // Determinar Ciclo Operativo
                var cicloId = await connection.ExecuteScalarAsync<int?>(
                    @"SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS 
                      WHERE @fechaGrupo >= CAST(FechaInicio AS DATE) AND @fechaGrupo <= CAST(FechaFin AS DATE)",
                    new { fechaGrupo });

                if (!cicloId.HasValue)
                {
                    cicloId = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC");
                }

                // Crear el Ticket en TB_CONTROL_RUTAS (En estado ABIERTO para que SuperAdmin lo verifique y finalice)
                var sqlInsertTicket = @"
                    INSERT INTO TB_CONTROL_RUTAS
                    (Fecha, UsuarioId, CicloId, TotalLitrosFinca, TotalLitrosReceptoria, DiferenciaLitros, PorcentajeMerma, Estado, ProcesoActualId, Observacion, CreatedAt, CreatedBy)
                    VALUES (@fechaGrupo, @conductorId, @cicloId, 0, 0, 0, 0, 'ABIERTO', 1, '[CARGA_EXCEL] Ticket generado por ImportaciÃ³n Masiva', GETDATE(), @usuarioId);
                    SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

                long ticketId = await connection.ExecuteScalarAsync<long>(sqlInsertTicket, new
                {
                    fechaGrupo, conductorId, cicloId, usuarioId
                });

                if (ticketId <= 0) continue;

                int ticketLitros = 0;
                int ticketFincasCount = 0;

                // Insertar paradas en TB_RUTAS_RECOLECCION
                foreach (var fila in grupo)
                {
                    fincas.TryGetValue(fila.FincaId, out var fincaObj);
                    decimal precioUSD = 0.0m;
                    string tipoLeche = !string.IsNullOrWhiteSpace(fila.TipoLeche) ? fila.TipoLeche.Trim().ToUpper() : "VACA";

                    if (fila.PrecioLitroUSDAplicado.HasValue && fila.PrecioLitroUSDAplicado.Value > 0)
                    {
                        precioUSD = fila.PrecioLitroUSDAplicado.Value;
                    }
                    else if (fincaObj != null)
                    {
                        if (fila.EsAcida)
                        {
                            precioUSD = (decimal)(fincaObj.PrecioLitroAcidaUSD ?? fincaObj.PrecioLitroUSD ?? 0.0m);
                        }
                        else if (tipoLeche == "BUFALA")
                        {
                            precioUSD = (decimal)(fincaObj.PrecioBufalaLitroUSD ?? fincaObj.PrecioLitroUSD ?? 0.0m);
                        }
                        else
                        {
                            precioUSD = (decimal)(fincaObj.PrecioLitroUSD ?? 0.0m);
                        }
                    }

                    var sqlInsertRuta = @"
                        INSERT INTO TB_RUTAS_RECOLECCION
                        (ControlRutaId, CicloId, FincaId, UsuarioId, Litros, EsAcida, TipoLeche, Fecha, Observacion, PrecioLitroUSDAplicado, TasaDolarBsAplicada, CreatedAt, CreatedBy)
                        VALUES (@ticketId, @cicloId, @FincaId, @conductorId, @Litros, @EsAcida, @tipoLeche, @fechaGrupo, @Observacion, @precioUSD, @tasaBcv, GETDATE(), @usuarioId);";

                    await connection.ExecuteAsync(sqlInsertRuta, new
                    {
                        ticketId,
                        cicloId,
                        fila.FincaId,
                        conductorId,
                        fila.Litros,
                        fila.EsAcida,
                        tipoLeche,
                        fechaGrupo,
                        Observacion = string.IsNullOrWhiteSpace(fila.Observacion) ? "[ORIGEN_EXCEL]" : $"[ORIGEN_EXCEL] {fila.Observacion}".Trim(),
                        precioUSD,
                        tasaBcv,
                        usuarioId
                    });

                    ticketLitros += fila.Litros;
                    ticketFincasCount++;
                    totalParadas++;
                    totalLitrosGlobal += fila.Litros;
                }

                // Recalcular mÃ©tricas del ticket
                await _RecalcularMetricasTicketAsync(connection, ticketId, usuarioId);

                // Registrar en historial de procesos
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                    VALUES (@ticketId, 1, GETDATE(), @usuarioId, 'Apertura de Ticket por Carga Masiva Excel SuperAdmin');",
                    new { ticketId, usuarioId });

                // Notificar al conductor
                try
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                        VALUES (@conductorId, 'TICKET_ASIGNADO', 'Nuevo Ticket Creado (Excel)', @msg, @fechaGrupo, @ticketId, 0, GETDATE())",
                        new
                        {
                            conductorId,
                            msg = $"Se ha generado el Ticket #{ticketId} con {ticketFincasCount} paradas ({ticketLitros:N0} Lts) para el {fechaGrupo:dd/MM/yyyy}.",
                            fechaGrupo,
                            ticketId
                        });
                }
                catch { /* Tolerante */ }

                choferes.TryGetValue(conductorId, out var chofObj);
                string choferNombre = chofObj != null ? (string)chofObj.NombreCompleto : $"Chofer #{conductorId}";

                ticketsCreados.Add(new ResumenTicketCreadoDto
                {
                    TicketId = ticketId,
                    CodigoTicket = ticketId.ToString(),
                    Fecha = fechaGrupo,
                    ConductorId = conductorId,
                    ConductorNombre = choferNombre,
                    CamionPlaca = camionPlaca,
                    TotalLitros = ticketLitros,
                    CantidadFincas = ticketFincasCount
                });
            }

            return new EjecutarCargaMasivaExcelResponseDto
            {
                Success = true,
                Message = $"Se crearon {ticketsCreados.Count} tickets exitosamente con un total de {totalParadas} paradas y {totalLitrosGlobal:N0} Lts.",
                TicketsCreadosCount = ticketsCreados.Count,
                ParadasCreadasCount = totalParadas,
                LitrosTotales = totalLitrosGlobal,
                Tickets = ticketsCreados
            };
        }

        public async Task<IEnumerable<EntregaItemDto>> ObtenerEntregasDeViajeAsync(long controlRutaId)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                WITH EntregasRanked AS (
                    SELECT 
                        e.Id AS Id,
                        e.Fecha AS Fecha,
                        e.CompaniaId AS CompaniaId,
                        c.Nombre AS CompaniaNombre,
                        c.Encargado AS Encargado,
                        ISNULL(c.TipoServicioId, 1) AS TipoServicioId,
                        e.UsuarioId AS ConductorId,
                        u.NombreCompleto AS ConductorNombre,
                        e.Litros AS Litros,
                        e.Observacion AS Observacion,
                        ISNULL(e.TipoLeche, 'VACA') AS TipoLeche,
                        1 AS PuedeModificar,
                        ROW_NUMBER() OVER(PARTITION BY CASE WHEN e.ControlCompaniaId IS NOT NULL THEN CAST(e.ControlCompaniaId AS VARCHAR) ELSE CAST(e.Id AS VARCHAR) END ORDER BY ISNULL(e.ModifiedAt, e.CreatedAt) DESC, e.Id DESC) as rn
                    FROM TB_ENTREGAS_COMPANIA e
                    INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                    INNER JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                    WHERE e.ControlRutaId = @controlRutaId 
                       OR e.Observacion LIKE '%#' + CAST(@controlRutaId AS VARCHAR) + '%'
                       OR e.Observacion LIKE '%Viaje #' + CAST(@controlRutaId AS VARCHAR) + '%'
                ),
                EntregasFiltradas AS (
                    SELECT Id, Fecha, CompaniaId, CompaniaNombre, Encargado, TipoServicioId, ConductorId, ConductorNombre, Litros, Observacion, TipoLeche, PuedeModificar
                    FROM EntregasRanked WHERE rn = 1
                ),
                EntregasUnificadas AS (
                    SELECT * FROM EntregasFiltradas

                    UNION ALL

                    SELECT 
                        (cc.Id + 1000000) AS Id,
                        cc.Fecha AS Fecha,
                        cc.CompaniaId AS CompaniaId,
                        c.Nombre AS CompaniaNombre,
                        c.Encargado AS Encargado,
                        ISNULL(c.TipoServicioId, 1) AS TipoServicioId,
                        cc.UsuarioId AS ConductorId,
                        u.NombreCompleto AS ConductorNombre,
                        ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados) AS Litros,
                        CONCAT('Entrega validada desde Control CompaÃ±Ã­as #', cc.Id, '. Falla: ', cc.DiferenciaLitros, ' L. [', cc.TipoLeche, '] ', cc.Observacion) AS Observacion,
                        ISNULL(cc.TipoLeche, 'VACA') AS TipoLeche,
                        1 AS PuedeModificar
                    FROM TB_CONTROL_COMPANIAS cc
                    INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                    INNER JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                    WHERE (cc.ControlRutaId = @controlRutaId 
                        OR cc.Observacion LIKE '%#' + CAST(@controlRutaId AS VARCHAR) + '%'
                        OR cc.Observacion LIKE '%Viaje #' + CAST(@controlRutaId AS VARCHAR) + '%')
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_ENTREGAS_COMPANIA e0
                          WHERE e0.ControlCompaniaId = cc.Id
                             OR (e0.ControlRutaId = @controlRutaId AND e0.ControlCompaniaId IS NULL AND e0.CompaniaId = cc.CompaniaId)
                      )
                )
                SELECT * FROM EntregasUnificadas ORDER BY Id ASC";
            return await connection.QueryAsync<EntregaItemDto>(sql, new { controlRutaId });
        }

        public async Task<bool> EditarEntregaDeViajeAuditadoAsync(long controlRutaId, long entregaId, EditarEntregaViajeAuditadoDto dto, int usuarioId, string rol)
        {
            if (string.IsNullOrWhiteSpace(dto.Motivo)) throw new ArgumentException("El motivo o justificación de la modificación es obligatorio.");

            using var connection = new SqlConnection(_connectionString);
            if (!await TieneAccesoAdminOPermisoAsync(connection, usuarioId, rol, "CONTROL_RUTAS_EDITAR", "ENTREGAS_EDITAR"))
                throw new UnauthorizedAccessException("No tienes permisos de Administrador o edición para modificar entregas desde el Control de Viaje.");

            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) throw new InvalidOperationException("El Viaje / Ticket no existe.");

            var entregaActual = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT e.*, c.Nombre AS CompaniaNombre 
                  FROM TB_ENTREGAS_COMPANIA e 
                  INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id 
                  WHERE e.Id = @entregaId", new { entregaId });
            if (entregaActual == null) throw new InvalidOperationException("La entrega no existe.");

            var compNueva = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT Id, Nombre FROM TB_COMPANIAS WHERE Id = @CompaniaId", new { dto.CompaniaId });
            if (compNueva == null) throw new InvalidOperationException("La compaÃ±Ã­a seleccionada no existe.");

            string valAnt = $"CompaÃ±Ã­a: {entregaActual.CompaniaNombre} (ID: {entregaActual.CompaniaId}), Litros: {entregaActual.Litros}, Obs: {entregaActual.Observacion ?? "-"}";
            string valNue = $"CompaÃ±Ã­a: {compNueva.Nombre} (ID: {dto.CompaniaId}), Litros: {dto.Litros}, Obs: {dto.Observacion ?? "-"}";

            // 1. Actualizar entrega
            await connection.ExecuteAsync(@"
                UPDATE TB_ENTREGAS_COMPANIA
                SET CompaniaId = @CompaniaId,
                    Litros = @Litros,
                    Observacion = @Observacion,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @entregaId",
                new { dto.CompaniaId, dto.Litros, dto.Observacion, usuarioId, entregaId });

            // 2. Registrar en BitÃ¡cora de AuditorÃ­a
            await connection.ExecuteAsync(@"
                INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                (ControlRutaId, TipoEntidad, EntidadId, TipoAccion, ValoresAnteriores, ValoresNuevos, Motivo, UsuarioId, Fecha)
                VALUES (@controlRutaId, 'RECEPTORIA_ENTREGA', @entregaId, 'EDITAR_ENTREGA', @valAnt, @valNue, @Motivo, @usuarioId, GETDATE());",
                new { controlRutaId, entregaId, valAnt, valNue, dto.Motivo, usuarioId });

            // 3. Recalcular mÃ©tricas del ticket
            await _RecalcularMetricasTicketAsync(connection, controlRutaId, usuarioId);

            return true;
        }

        public async Task<IEnumerable<LogModificacionControlDto>> ObtenerLogsModificacionesControlAsync(long controlRutaId)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    l.Id,
                    l.ControlRutaId,
                    l.TipoEntidad,
                    l.EntidadId,
                    l.TipoAccion,
                    l.ValoresAnteriores,
                    l.ValoresNuevos,
                    l.Motivo,
                    l.UsuarioId,
                    u.NombreCompleto AS NombreUsuario,
                    u.Rol AS RolUsuario,
                    l.Fecha
                FROM TB_LOG_MODIFICACIONES_CONTROL l
                INNER JOIN TB_USUARIOS u ON l.UsuarioId = u.Id
                WHERE l.ControlRutaId = @controlRutaId
                ORDER BY l.Fecha DESC, l.Id DESC";
            return await connection.QueryAsync<LogModificacionControlDto>(sql, new { controlRutaId });
        }

        public async Task<IEnumerable<LogModificacionControlDto>> ObtenerLogsAuditoriaGlobalAsync(
            DateTime? fechaDesde, DateTime? fechaHasta, string? tipoEntidad, string? busqueda, int limite = 200)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT TOP (@limite)
                    l.Id,
                    l.ControlRutaId,
                    l.TipoEntidad,
                    l.EntidadId,
                    l.TipoAccion,
                    l.ValoresAnteriores,
                    l.ValoresNuevos,
                    l.Motivo,
                    l.UsuarioId,
                    ISNULL(u.NombreCompleto, u.Email) AS NombreUsuario,
                    u.Rol AS RolUsuario,
                    l.Fecha
                FROM TB_LOG_MODIFICACIONES_CONTROL l
                LEFT JOIN TB_USUARIOS u ON l.UsuarioId = u.Id
                WHERE 1 = 1
                  AND (@fechaDesde IS NULL OR l.Fecha >= @fechaDesde)
                  AND (@fechaHasta IS NULL OR l.Fecha <= @fechaHasta)
                  AND (@tipoEntidad IS NULL OR @tipoEntidad = '' OR l.TipoEntidad = @tipoEntidad)
                  AND (@busqueda IS NULL OR @busqueda = '' 
                       OR l.Motivo LIKE '%' + @busqueda + '%' 
                       OR l.TipoAccion LIKE '%' + @busqueda + '%' 
                       OR CAST(l.ControlRutaId AS VARCHAR) LIKE '%' + @busqueda + '%' 
                       OR u.NombreCompleto LIKE '%' + @busqueda + '%')
                ORDER BY l.Fecha DESC, l.Id DESC";

            return await connection.QueryAsync<LogModificacionControlDto>(sql, new
            {
                limite = Math.Max(1, Math.Min(limite, 500)),
                fechaDesde,
                fechaHasta,
                tipoEntidad,
                busqueda
            });
        }

        private async Task _RecalcularMetricasTicketAsync(SqlConnection connection, long controlRutaId, int usuarioId)
        {
            var totalFincas = await connection.ExecuteScalarAsync<int>(
                @"SELECT ISNULL(SUM(r.Litros), 0) 
                  FROM TB_RUTAS_RECOLECCION r
                  INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                  WHERE r.ControlRutaId = @controlRutaId
                    AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'",
                new { controlRutaId });

            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) return;

            int totalReceptoria = viaje.LitrosRecibidosReceptoria ?? (int)viaje.TotalLitrosReceptoria;
            int totalPlanta = viaje.LitrosEntregadosCompania ?? 0;
            int recarga = viaje.LitrosCargadosAdicional ?? 0;

            int difRec = totalFincas - totalReceptoria;
            int difPlanta = (totalReceptoria + recarga) - totalPlanta;
            int mermaTotal = totalPlanta > 0 ? (difRec + difPlanta) : difRec;
            decimal porcentaje = totalFincas > 0 ? Math.Round((Math.Abs(mermaTotal) * 100.0m) / totalFincas, 2) : 0;

            await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET TotalLitrosFinca = @totalFincas,
                    DiferenciaLitros = @mermaTotal,
                    DiferenciaReceptoria = @difRec,
                    MermaTotalLitros = @mermaTotal,
                    PorcentajeMerma = @porcentaje,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @controlRutaId",
                new { totalFincas, mermaTotal, difRec, porcentaje, usuarioId, controlRutaId });
        }
    }

    // =====================================================================
    // REPOSITORY: ControlCompaniasRepository (Salidas a Queseras / CompaÃ±Ã­as)
    // =====================================================================

}
