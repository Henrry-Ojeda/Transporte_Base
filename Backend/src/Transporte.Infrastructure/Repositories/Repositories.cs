using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

namespace Transporte.Infrastructure.Repositories
{
    public interface IAuthRepository
    {
        Task<Usuario?> ObtenerPorUsernameAsync(string username);
        Task<Usuario?> ObtenerPorIdAsync(int id);
        Task<IEnumerable<string>> ObtenerPermisosUsuarioAsync(int usuarioId);
    }

    public class AuthRepository : IAuthRepository
    {
        private readonly string _connectionString;
        public AuthRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        public async Task<Usuario?> ObtenerPorUsernameAsync(string username)
        {
            using var connection = new SqlConnection(_connectionString);
            var u = (username ?? "").Trim();
            return await connection.QueryFirstOrDefaultAsync<Usuario>(@"
                SELECT TOP 1 * FROM TB_USUARIOS 
                WHERE LOWER(Username) = LOWER(@u) AND Activo = 1", 
                new { u });
        }

        public async Task<Usuario?> ObtenerPorIdAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryFirstOrDefaultAsync<Usuario>(
                "SELECT * FROM TB_USUARIOS WHERE Id = @id", new { id });
        }

        public async Task<IEnumerable<string>> ObtenerPermisosUsuarioAsync(int usuarioId)
        {
            var user = await ObtenerPorIdAsync(usuarioId);
            if (user == null) return Enumerable.Empty<string>();

            if (user.Rol == "ADMIN" || user.Rol == "SUPERADMIN")
            {
                return new[] { "DASHBOARD", "RUTAS_ALL", "MERMAS", "SEMANAS", "LIQUIDACION", "CATALOGOS", "BCV" };
            }

            using var connection = new SqlConnection(_connectionString);
            var sqlPermisos = @"
                SELECT DISTINCT p.Codigo
                FROM TB_USUARIOS u
                INNER JOIN TB_ROL_PERMISOS rp ON (u.RolId = rp.RolId OR (u.RolId IS NULL AND rp.RolId = (SELECT TOP 1 Id FROM TB_ROLES WHERE Codigo = u.Rol)))
                INNER JOIN TB_PERMISOS p ON rp.PermisoId = p.Id
                WHERE u.Id = @usuarioId AND rp.Concedido = 1 AND p.Activo = 1";

            var permisosDb = (await connection.QueryAsync<string>(sqlPermisos, new { usuarioId })).ToList();
            if (string.Equals(user.Rol, "SUPERVISOR", StringComparison.OrdinalIgnoreCase))
            {
                if (!permisosDb.Contains("DASHBOARD")) permisosDb.Add("DASHBOARD");
                if (!permisosDb.Contains("RUTAS_ALL")) permisosDb.Add("RUTAS_ALL");
                if (!permisosDb.Contains("MERMAS")) permisosDb.Add("MERMAS");
                if (!permisosDb.Contains("CATALOGOS")) permisosDb.Add("CATALOGOS");
            }
            else if (permisosDb.Count == 0)
            {
                permisosDb.AddRange(new[] { "RUTAS_OWN", "DASHBOARD" });
            }

            return permisosDb;
        }
    }

    public interface IBcvRepository
    {
        Task<HistorialBcv?> ObtenerTasaHoyAsync(DateTime fecha);
        Task<HistorialBcv?> ObtenerTasaFechaAsync(DateTime fecha);
        Task<HistorialBcv?> ObtenerUltimaTasaAsync();
        Task<IEnumerable<HistorialBcv>> ObtenerHistorialAsync(int top = 1000);
        Task<int> RegistrarTasaAsync(RegistrarBcvDto dto, int? usuarioId = null);
        Task<int> GuardarTasaAsync(RegistrarBcvDto dto, int? usuarioId = null);
        Task<bool> EditarTasaAsync(int id, EditarBcvDto dto, int? usuarioId = null);
        Task<bool> EliminarTasaAsync(int id);
    }

    public class BcvRepository : IBcvRepository
    {
        private readonly string _connectionString;
        public BcvRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        public async Task<HistorialBcv?> ObtenerTasaHoyAsync(DateTime fecha)
        {
            return await ObtenerTasaFechaAsync(fecha);
        }

        public async Task<HistorialBcv?> ObtenerTasaFechaAsync(DateTime fecha)
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryFirstOrDefaultAsync<HistorialBcv>(
                "SELECT TOP 1 * FROM TB_HISTORIAL_BCV WHERE CAST(Fecha AS DATE) = @fecha ORDER BY Id DESC, CreatedAt DESC", 
                new { fecha = fecha.Date });
        }

        public async Task<HistorialBcv?> ObtenerUltimaTasaAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryFirstOrDefaultAsync<HistorialBcv>(
                "SELECT TOP 1 * FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC, CreatedAt DESC");
        }

        public async Task<IEnumerable<HistorialBcv>> ObtenerHistorialAsync(int top = 1000)
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryAsync<HistorialBcv>(
                "SELECT TOP (@top) * FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC, CreatedAt DESC", 
                new { top });
        }

        public async Task<int> RegistrarTasaAsync(RegistrarBcvDto dto, int? usuarioId = null)
        {
            return await GuardarTasaAsync(dto, usuarioId);
        }

        public async Task<int> GuardarTasaAsync(RegistrarBcvDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                MERGE TB_HISTORIAL_BCV AS target
                USING (SELECT @fecha AS Fecha) AS source
                ON (CAST(target.Fecha AS DATE) = CAST(source.Fecha AS DATE))
                WHEN MATCHED THEN
                    UPDATE SET TasaDolarBs = @tasaDolarBs, Fuente = @fuente, Observacion = @observacion, CreatedBy = @usuarioId, CreatedAt = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (Fecha, TasaDolarBs, Fuente, Observacion, CreatedBy, CreatedAt)
                    VALUES (@fecha, @tasaDolarBs, @fuente, @observacion, @usuarioId, GETDATE());
                SELECT TOP 1 Id FROM TB_HISTORIAL_BCV WHERE CAST(Fecha AS DATE) = @fecha;";

            var resId = await connection.ExecuteScalarAsync<int>(sql, new
            {
                fecha = dto.Fecha.Date,
                tasaDolarBs = dto.TasaDolarBs,
                fuente = dto.Fuente ?? "OFICIAL_BCV",
                observacion = dto.Observacion,
                usuarioId
            });

            // Actualizar automáticamente todas las cuotas pendientes de adelantos activos al nuevo valor del dólar
            try
            {
                var sqlAdelantos = @"
                    UPDATE c
                    SET c.TasaBcvAplicada = @tasaDolarBs,
                        c.ModifiedAt = GETDATE(),
                        c.ModifiedBy = @usuarioId
                    FROM TB_ADELANTOS_CUOTAS c
                    INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                    WHERE a.Estado != 'PAGADO'
                      AND a.MontoPendienteUSD > 0.001
                      AND c.Estado != 'COBRADO'
                      AND c.Estado != 'ANULADA';";
                await connection.ExecuteAsync(sqlAdelantos, new { tasaDolarBs = dto.TasaDolarBs, usuarioId });
            }
            catch { }

            return resId;
        }

        public async Task<bool> EditarTasaAsync(int id, EditarBcvDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                UPDATE TB_HISTORIAL_BCV
                SET 
                    Fecha = COALESCE(@fecha, Fecha),
                    TasaDolarBs = COALESCE(@tasaDolarBs, TasaDolarBs),
                    Fuente = COALESCE(@fuente, Fuente),
                    Observacion = COALESCE(@observacion, Observacion),
                    CreatedBy = COALESCE(@usuarioId, CreatedBy)
                WHERE Id = @id";

            var rows = await connection.ExecuteAsync(sql, new
            {
                id,
                fecha = dto.Fecha?.Date,
                tasaDolarBs = dto.TasaDolarBs,
                fuente = dto.Fuente,
                observacion = dto.Observacion,
                usuarioId
            });

            if (dto.TasaDolarBs.HasValue && dto.TasaDolarBs.Value > 0)
            {
                try
                {
                    var sqlAdelantos = @"
                        UPDATE c
                        SET c.TasaBcvAplicada = @tasaDolarBs,
                            c.ModifiedAt = GETDATE(),
                            c.ModifiedBy = @usuarioId
                        FROM TB_ADELANTOS_CUOTAS c
                        INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                        WHERE a.Estado != 'PAGADO'
                          AND a.MontoPendienteUSD > 0.001
                          AND c.Estado != 'COBRADO'
                          AND c.Estado != 'ANULADA';";
                    await connection.ExecuteAsync(sqlAdelantos, new { tasaDolarBs = dto.TasaDolarBs.Value, usuarioId });
                }
                catch { }
            }

            return rows > 0;
        }

        public async Task<bool> EliminarTasaAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = "DELETE FROM TB_HISTORIAL_BCV WHERE Id = @id";
            var rows = await connection.ExecuteAsync(sql, new { id });
            return rows > 0;
        }
    }

    public interface IRutasRepository
    {
        Task<IEnumerable<RutaItemDto>> ObtenerRutasHoyAsync(int usuarioId, string rol, DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, int? cicloId = null);
        Task<int> RegistrarRutaAsync(RegistrarRutaDto dto, int conductorId, string rol = "CHOFER");
        Task<IEnumerable<int>> RegistrarRutasMasivoAsync(RegistrarRutasMasivoDto dto, int conductorId, string rol = "CHOFER");
        Task<bool> ModificarLitrosAsync(int rutaId, int nuevosLitros, int usuarioId, string rol);
        Task<bool> EditarRutaAsync(int rutaId, EditarRutaDto dto, int usuarioId, string rol);
        Task<bool> EliminarRutaAsync(int rutaId, int usuarioId, string rol);
        Task<bool> LimpiarRecoleccionAsync(long rutaId, int usuarioId, string rol);
        Task<bool> DiferirLitrosAsync(long rutaId, int litrosDiferir, int? cicloDestinoId, string? motivo, int usuarioId, string rol);
        Task<bool> RevertirDiferimientoAsync(long rutaId, int usuarioId, string rol);
    }

    public class RutasRepository : IRutasRepository
    {
        private readonly string _connectionString;
        public RutasRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        public async Task<IEnumerable<RutaItemDto>> ObtenerRutasHoyAsync(int usuarioId, string rol, DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, int? cicloId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            string whereFilter;
            object param;

            bool esAdminOSup = rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) 
                            || rol.Equals("SUPERVISOR", StringComparison.OrdinalIgnoreCase)
                            || rol.Equals("GERENTE", StringComparison.OrdinalIgnoreCase);

            if (cicloId.HasValue && cicloId.Value > 0)
            {
                whereFilter = "r.CicloId = @cicloId";
                param = new { cicloId = cicloId.Value, usuarioId, rol };
            }
            else if (fechaInicio.HasValue && fechaFin.HasValue)
            {
                whereFilter = "r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin";
                param = new { fechaInicio = fechaInicio.Value.Date, fechaFin = fechaFin.Value.Date, usuarioId, rol };
            }
            else
            {
                var fechaConsulta = (fecha ?? DateTime.Today).Date;
                whereFilter = "CAST(r.Fecha AS DATE) = @fechaConsulta";
                param = new { fechaConsulta, usuarioId, rol };
            }

            var sql = $@"
                SELECT 
                    r.Id AS Id,
                    r.Fecha AS Fecha,
                    r.FincaId AS FincaId,
                    f.Nombre AS FincaNombre,
                    f.Propietario AS Propietario,
                    ISNULL(f.TipoServicioId, 1) AS TipoServicioId,
                    r.UsuarioId AS ConductorId,
                    u.NombreCompleto AS ConductorNombre,
                    r.Litros AS Litros,
                    r.EsAcida AS EsAcida,
                    ISNULL(r.TipoLeche, 'VACA') AS TipoLeche,
                    ISNULL(f.TieneDosTiposLeche, 0) AS TieneDosTiposLeche,
                    ISNULL(r.PrecioLitroUSDAplicado, CASE WHEN r.EsAcida = 1 THEN f.PrecioLitroAcidaUSD ELSE f.PrecioLitroUSD END) AS PrecioLitroUSD,
                    r.Observacion AS Observacion,
                    r.FotoComprobante AS FotoComprobante,
                    r.ControlRutaId AS ControlRutaId,
                    r.CicloId AS CicloId,
                    r.CicloLiquidacionId AS CicloLiquidacionId,
                    ISNULL(r.EsDiferido, 0) AS EsDiferido,
                    r.RecoleccionOrigenId AS RecoleccionOrigenId,
                    r.LitrosOriginales AS LitrosOriginales,
                    r.CreatedAt AS CreatedAt,
                    CASE 
                        WHEN cr.Id IS NOT NULL AND (cr.Estado IN ('FINALIZADO', 'CERRADO') OR cr.ProcesoActualId = 4) THEN 0
                        WHEN UPPER(@rol) LIKE '%ADMIN%' OR @rol IN ('SUPERVISOR', 'GERENTE') THEN 1
                        WHEN r.UsuarioId = @usuarioId AND (
                            (cr.Id IS NOT NULL AND cr.ProcesoActualId = 1 AND cr.Estado IN ('PENDIENTE', 'ABIERTO', 'EN RUTA'))
                            OR (cr.Id IS NULL AND CAST(r.Fecha AS DATE) >= CAST(DATEADD(DAY, -7, GETDATE()) AS DATE))
                        ) THEN 1
                        ELSE 0
                    END AS PuedeModificar
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                INNER JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON r.ControlRutaId = cr.Id
                WHERE {whereFilter}
                " + (!esAdminOSup ? " AND r.UsuarioId = @usuarioId " : "") + @"
                ORDER BY r.Fecha ASC, ISNULL(r.ControlRutaId, 0) ASC, r.Id ASC";

            return await connection.QueryAsync<RutaItemDto>(sql, param);
        }

        public async Task<int> RegistrarRutaAsync(RegistrarRutaDto dto, int conductorId, string rol = "CHOFER")
        {
            using var connection = new SqlConnection(_connectionString);
            var fechaRuta = dto.Fecha.Date;
            int choferEfectivo;
            if (rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) || rol.Equals("SUPERVISOR", StringComparison.OrdinalIgnoreCase))
            {
                if (!dto.ConductorId.HasValue || dto.ConductorId.Value <= 0)
                {
                    throw new InvalidOperationException("Debe seleccionar un chofer para registrar la ruta.");
                }
                choferEfectivo = dto.ConductorId.Value;
            }
            else
            {
                choferEfectivo = conductorId;
            }

            var rolChofer = await connection.ExecuteScalarAsync<int?>(
                "SELECT RolId FROM TB_USUARIOS WHERE Id = @choferEfectivo", new { choferEfectivo });
            if (rolChofer == 1 || choferEfectivo == 2018)
            {
                throw new InvalidOperationException("El usuario seleccionado tiene rol Administrador y no puede ser asignado como conductor.");
            }

            var cicloSql = "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaRuta BETWEEN FechaInicio AND FechaFin AND Estado = 'ABIERTO'";
            var cicloId = await connection.ExecuteScalarAsync<int?>(cicloSql, new { fechaRuta });
            if (cicloId == null)
            {
                var cicloRecienteSql = "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC";
                cicloId = await connection.ExecuteScalarAsync<int?>(cicloRecienteSql);
                if (cicloId == null)
                    throw new Exception("No existe una semana operativa activa en el sistema.");
            }

            var fincaInfo = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT ISNULL(PrecioLitroUSD, 0) AS PrecioLitroUSD, ISNULL(PrecioLitroAcidaUSD, 0) AS PrecioLitroAcidaUSD, ISNULL(TieneDosTiposLeche, 0) AS TieneDosTiposLeche, ISNULL(PrecioBufalaLitroUSD, 0) AS PrecioBufalaLitroUSD FROM TB_FINCAS WHERE Id = @fincaId", new { fincaId = dto.FincaId });

            string tipoLecheEfectivo = !string.IsNullOrWhiteSpace(dto.TipoLeche) ? dto.TipoLeche.Trim().ToUpper() : "VACA";
            decimal precioBase = (tipoLecheEfectivo == "BUFALA" && (bool)(fincaInfo?.TieneDosTiposLeche ?? false))
                ? (decimal)(fincaInfo?.PrecioBufalaLitroUSD ?? 0.0m)
                : (decimal)(fincaInfo?.PrecioLitroUSD ?? 0.0m);

            decimal precioAplicado = dto.PrecioLitroUSDAplicado ?? (dto.EsAcida ? (decimal)(fincaInfo?.PrecioLitroAcidaUSD ?? 0.0m) : precioBase);
            decimal tasaActual = await connection.ExecuteScalarAsync<decimal?>("SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC") ?? 1.0m;

            long? ticketId = dto.ControlRutaId;
            if (!ticketId.HasValue)
            {
                ticketId = await connection.ExecuteScalarAsync<long?>(
                    "SELECT TOP 1 Id FROM TB_CONTROL_RUTAS WHERE UsuarioId = @choferEfectivo AND CAST(Fecha AS DATE) = @fechaRuta AND ProcesoActualId = 1 ORDER BY Id DESC",
                    new { choferEfectivo, fechaRuta });

                if (!ticketId.HasValue)
                {
                    var sqlCrearTicket = @"
                        INSERT INTO TB_CONTROL_RUTAS 
                        (Fecha, UsuarioId, CicloId, TotalLitrosFinca, TotalLitrosReceptoria, DiferenciaLitros, PorcentajeMerma, Estado, ProcesoActualId, CreatedAt, CreatedBy)
                        VALUES 
                        (@fechaRuta, @choferEfectivo, @cicloId, 0, 0, 0, 0, 'ABIERTO', 1, GETDATE(), @choferEfectivo);
                        SELECT CAST(SCOPE_IDENTITY() as bigint);";
                    ticketId = await connection.ExecuteScalarAsync<long>(sqlCrearTicket, new { fechaRuta, choferEfectivo, cicloId });

                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                        VALUES (@ticketId, 1, GETDATE(), @choferEfectivo, 'Apertura automática de viaje al registrar recolección');",
                        new { ticketId, choferEfectivo });
                }
            }

            int nuevaRutaId;
            var paradaExistenteId = await connection.ExecuteScalarAsync<int?>(@"
                SELECT TOP 1 Id FROM TB_RUTAS_RECOLECCION 
                WHERE ControlRutaId = @ticketId AND FincaId = @fincaId 
                ORDER BY CASE WHEN Litros = 0 OR Litros IS NULL THEN 0 ELSE 1 END ASC, Id DESC", 
                new { ticketId, fincaId = dto.FincaId });

            if (paradaExistenteId.HasValue)
            {
                var sqlUpdate = @"
                    UPDATE TB_RUTAS_RECOLECCION
                    SET Litros = @litros,
                        EsAcida = @esAcida,
                        TipoLeche = @tipoLeche,
                        PrecioLitroUSDAplicado = @precioAplicado,
                        TasaDolarBsAplicada = @tasaActual,
                        UuidLocal = @uuidLocal,
                        Observacion = @observacion,
                        FotoComprobante = ISNULL(@fotoComprobante, FotoComprobante),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @conductorId
                    WHERE Id = @paradaExistenteId;

                    -- Limpieza preventiva de duplicados accidentales de la misma finca en el ticket
                    DELETE FROM TB_RUTAS_RECOLECCION 
                    WHERE ControlRutaId = @ticketId 
                      AND FincaId = @fincaId 
                      AND Id != @paradaExistenteId;";

                await connection.ExecuteAsync(sqlUpdate, new
                {
                    litros = dto.Litros,
                    esAcida = dto.EsAcida,
                    tipoLeche = tipoLecheEfectivo,
                    precioAplicado,
                    tasaActual,
                    uuidLocal = dto.UuidLocal ?? Guid.NewGuid().ToString(),
                    observacion = dto.Observacion,
                    fotoComprobante = dto.FotoComprobante,
                    conductorId = choferEfectivo,
                    ticketId,
                    fincaId = dto.FincaId,
                    paradaExistenteId = paradaExistenteId.Value
                });
                nuevaRutaId = paradaExistenteId.Value;
            }
            else
            {
                var sqlInsert = @"
                    INSERT INTO TB_RUTAS_RECOLECCION 
                    (CicloId, FincaId, UsuarioId, Fecha, Litros, EsAcida, TipoLeche, PrecioLitroUSDAplicado, TasaDolarBsAplicada, UuidLocal, Observacion, FotoComprobante, ControlRutaId, CreatedAt, CreatedBy)
                    VALUES 
                    (@cicloId, @fincaId, @conductorId, @fecha, @litros, @esAcida, @tipoLeche, @precioAplicado, @tasaActual, @uuidLocal, @observacion, @fotoComprobante, @ticketId, GETDATE(), @conductorId);
                    SELECT CAST(SCOPE_IDENTITY() as int);";

                nuevaRutaId = await connection.ExecuteScalarAsync<int>(sqlInsert, new
                {
                    cicloId,
                    fincaId = dto.FincaId,
                    conductorId = choferEfectivo,
                    fecha = fechaRuta,
                    litros = dto.Litros,
                    esAcida = dto.EsAcida,
                    tipoLeche = tipoLecheEfectivo,
                    precioAplicado,
                    tasaActual,
                    uuidLocal = dto.UuidLocal ?? Guid.NewGuid().ToString(),
                    observacion = dto.Observacion,
                    fotoComprobante = dto.FotoComprobante,
                    ticketId
                });
            }

            if (ticketId.HasValue)
            {
                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET TotalLitrosFinca = (SELECT ISNULL(SUM(Litros), 0) FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @ticketId),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @choferEfectivo
                    WHERE Id = @ticketId",
                    new { ticketId, choferEfectivo });
            }

            return nuevaRutaId;
        }

        public async Task<IEnumerable<int>> RegistrarRutasMasivoAsync(RegistrarRutasMasivoDto dto, int conductorId, string rol = "CHOFER")
        {
            if (dto.Items == null || !dto.Items.Any())
                throw new Exception("No se enviaron registros para guardar.");

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var fechaRuta = dto.Fecha.Date;
                int choferEfectivo;
                if (rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) || rol.Equals("SUPERVISOR", StringComparison.OrdinalIgnoreCase))
                {
                    if (!dto.ConductorId.HasValue || dto.ConductorId.Value <= 0)
                    {
                        throw new InvalidOperationException("Debe seleccionar un chofer para registrar las recolecciones.");
                    }
                    choferEfectivo = dto.ConductorId.Value;
                }
                else
                {
                    choferEfectivo = conductorId;
                }

                var rolChofer = await connection.ExecuteScalarAsync<int?>(
                    "SELECT RolId FROM TB_USUARIOS WHERE Id = @choferEfectivo", new { choferEfectivo }, transaction);
                if (rolChofer == 1 || choferEfectivo == 2018)
                {
                    throw new InvalidOperationException("El usuario seleccionado tiene rol Administrador y no puede ser asignado como conductor.");
                }

                var cicloSql = "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaRuta BETWEEN FechaInicio AND FechaFin AND Estado = 'ABIERTO'";
                var cicloId = await connection.ExecuteScalarAsync<int?>(cicloSql, new { fechaRuta }, transaction);
                if (cicloId == null)
                {
                    var cicloRecienteSql = "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC";
                    cicloId = await connection.ExecuteScalarAsync<int?>(cicloRecienteSql, transaction: transaction);
                    if (cicloId == null)
                        throw new Exception("No existe una semana operativa activa en el sistema.");
                }

                if (rol == "CHOFER")
                {
                    var ticketExistente = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        @"SELECT ProcesoActualId, Estado 
                          FROM TB_CONTROL_RUTAS 
                          WHERE UsuarioId = @choferEfectivo AND CAST(Fecha AS DATE) = @fechaRuta 
                          ORDER BY Id DESC",
                        new { choferEfectivo, fechaRuta }, transaction);

                    if (ticketExistente != null && (ticketExistente.ProcesoActualId > 1 || ticketExistente.Estado == "RECIBIDO" || ticketExistente.Estado == "ENTREGADO" || ticketExistente.Estado == "FINALIZADO" || ticketExistente.Estado == "CERRADO"))
                    {
                        throw new InvalidOperationException("El ticket del día ya fue recibido o finalizado. El chofer no puede registrar más recolecciones.");
                    }
                }

                long? ticketId = dto.ControlRutaId;
                if (ticketId.HasValue)
                {
                    // Validar estrictamente que el ticket pertenezca al conductor seleccionado
                    var ownerId = await connection.ExecuteScalarAsync<int?>(
                        "SELECT UsuarioId FROM TB_CONTROL_RUTAS WHERE Id = @ticketId", new { ticketId = ticketId.Value }, transaction);
                    if (ownerId != choferEfectivo)
                    {
                        // El ticket enviado pertenece a otro chofer; desacoplar para crear/buscar el ticket propio de choferEfectivo
                        ticketId = null;
                    }
                }

                if (!ticketId.HasValue)
                {
                    ticketId = await connection.ExecuteScalarAsync<long?>(
                        "SELECT TOP 1 Id FROM TB_CONTROL_RUTAS WHERE UsuarioId = @choferEfectivo AND CAST(Fecha AS DATE) = @fechaRuta AND ProcesoActualId = 1 ORDER BY Id DESC",
                        new { choferEfectivo, fechaRuta }, transaction);

                    if (!ticketId.HasValue)
                    {
                        var sqlCrearTicket = @"
                            INSERT INTO TB_CONTROL_RUTAS 
                            (Fecha, UsuarioId, CicloId, TotalLitrosFinca, TotalLitrosReceptoria, DiferenciaLitros, PorcentajeMerma, Estado, ProcesoActualId, CreatedAt, CreatedBy)
                            VALUES 
                            (@fechaRuta, @choferEfectivo, @cicloId, 0, 0, 0, 0, 'ABIERTO', 1, GETDATE(), @choferEfectivo);
                            SELECT CAST(SCOPE_IDENTITY() as bigint);";
                        ticketId = await connection.ExecuteScalarAsync<long>(sqlCrearTicket, new { fechaRuta, choferEfectivo, cicloId }, transaction);

                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                            VALUES (@ticketId, 1, GETDATE(), @choferEfectivo, 'Apertura automática de viaje al registrar lote de recolecciones');",
                            new { ticketId, choferEfectivo }, transaction);
                    }
                }

                decimal tasaActual = await connection.ExecuteScalarAsync<decimal?>("SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC", transaction: transaction) ?? 1.0m;
                var ids = new List<int>();
                var sqlInsert = @"
                    INSERT INTO TB_RUTAS_RECOLECCION 
                    (CicloId, FincaId, UsuarioId, Fecha, Litros, EsAcida, TipoLeche, PrecioLitroUSDAplicado, TasaDolarBsAplicada, UuidLocal, Observacion, ControlRutaId, CreatedAt, CreatedBy)
                    VALUES 
                    (@cicloId, @fincaId, @conductorId, @fecha, @litros, @esAcida, @tipoLeche, @precioAplicado, @tasaActual, @uuidLocal, @observacion, @ticketId, GETDATE(), @conductorId);
                    SELECT CAST(SCOPE_IDENTITY() as int);";

                foreach (var item in dto.Items)
                {
                    int actualFincaId = item.FincaId;

                    // Auto-registro de fincas si no vienen con Id pero sí con un nombre nuevo confirmado
                    if (actualFincaId <= 0 && !string.IsNullOrWhiteSpace(item.NombreFincaNuevo))
                    {
                        var nombreLimpio = item.NombreFincaNuevo.Trim();
                        var fincaExistenteSql = "SELECT TOP 1 Id FROM TB_FINCAS WHERE UPPER(Nombre) = UPPER(@nombreLimpio) AND IsDeleted = 0";
                        var fincaExistenteId = await connection.ExecuteScalarAsync<int?>(fincaExistenteSql, new { nombreLimpio }, transaction);

                        if (fincaExistenteId.HasValue && fincaExistenteId.Value > 0)
                        {
                            actualFincaId = fincaExistenteId.Value;
                        }
                        else
                        {
                            var sqlCrearFinca = @"
                                DECLARE @NewFincaId INT;
                                INSERT INTO TB_FINCAS (Codigo, Nombre, Propietario, Activo, IsDeleted, CreatedAt)
                                VALUES ('', @nombreLimpio, @nombreLimpio, 1, 0, GETDATE());
                                SET @NewFincaId = SCOPE_IDENTITY();
                                UPDATE TB_FINCAS SET Codigo = 'FINCA-' + CAST(@NewFincaId AS VARCHAR(20)) WHERE Id = @NewFincaId;
                                SELECT @NewFincaId;";

                            actualFincaId = await connection.ExecuteScalarAsync<int>(sqlCrearFinca, new { nombreLimpio }, transaction);
                        }
                    }

                    if (actualFincaId <= 0 || item.Litros == 0) continue;

                    var fincaInfo = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT ISNULL(PrecioLitroUSD, 0) AS PrecioLitroUSD, ISNULL(PrecioLitroAcidaUSD, 0) AS PrecioLitroAcidaUSD, ISNULL(TieneDosTiposLeche, 0) AS TieneDosTiposLeche, ISNULL(PrecioBufalaLitroUSD, 0) AS PrecioBufalaLitroUSD FROM TB_FINCAS WHERE Id = @actualFincaId", new { actualFincaId }, transaction);

                    string tipoLecheEfectivo = !string.IsNullOrWhiteSpace(item.TipoLeche) ? item.TipoLeche.Trim().ToUpper() : "VACA";
                    decimal precioBase = (tipoLecheEfectivo == "BUFALA" && (bool)(fincaInfo?.TieneDosTiposLeche ?? false))
                        ? (decimal)(fincaInfo?.PrecioBufalaLitroUSD ?? 0.0m)
                        : (decimal)(fincaInfo?.PrecioLitroUSD ?? 0.0m);

                    decimal precioAplicado = item.PrecioLitroUSDAplicado ?? (item.EsAcida ? (decimal)(fincaInfo?.PrecioLitroAcidaUSD ?? 0.0m) : precioBase);

                    var id = await connection.ExecuteScalarAsync<int>(sqlInsert, new
                    {
                        cicloId,
                        fincaId = actualFincaId,
                        conductorId = choferEfectivo,
                        fecha = fechaRuta,
                        litros = item.Litros,
                        esAcida = item.EsAcida,
                        tipoLeche = tipoLecheEfectivo,
                        precioAplicado,
                        tasaActual,
                        uuidLocal = Guid.NewGuid().ToString(),
                        observacion = item.Observacion,
                        ticketId
                    }, transaction);

                    ids.Add(id);
                }

                if (ticketId.HasValue)
                {
                    int totalLitrosFinca = await connection.ExecuteScalarAsync<int>(
                        "SELECT ISNULL(SUM(Litros), 0) FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @ticketId",
                        new { ticketId }, transaction);

                    if (dto.RegistrarEntrega)
                    {
                        int targetCompaniaId = (dto.CompaniaDestinoId.HasValue && dto.CompaniaDestinoId.Value > 0)
                            ? dto.CompaniaDestinoId.Value
                            : 5028;

                        var existeComp = await connection.ExecuteScalarAsync<int>(
                            "SELECT COUNT(1) FROM TB_COMPANIAS WHERE Id = @targetCompaniaId", new { targetCompaniaId }, transaction);
                        if (existeComp == 0)
                        {
                            targetCompaniaId = await connection.ExecuteScalarAsync<int>(
                                @"SELECT TOP 1 Id FROM TB_COMPANIAS 
                                  WHERE Activo = 1 
                                  ORDER BY CASE 
                                    WHEN EsPrincipal = 1 THEN 0 
                                    WHEN UPPER(Nombre) LIKE '%RECEPTOR%' THEN 1 
                                    WHEN UPPER(Nombre) LIKE '%CAMPO%VERDE%' THEN 2 
                                    WHEN UPPER(Nombre) LIKE '%VERGEL%' THEN 3 
                                    ELSE 4 END, Id ASC", transaction: transaction);
                        }

                        int litrosDespacho = totalLitrosFinca;
                        int litrosRecibidos = (dto.LitrosRecibidosPlanta.HasValue && dto.LitrosRecibidosPlanta.Value > 0)
                            ? dto.LitrosRecibidosPlanta.Value
                            : totalLitrosFinca;
                        int dif = totalLitrosFinca - litrosRecibidos;
                        decimal merma = totalLitrosFinca > 0 ? Math.Round((Math.Abs(dif) * 100.0m) / totalLitrosFinca, 2) : 0.0m;
                        bool esFinalizado = dto.FinalizarInmediato;
                        string estadoDespacho = esFinalizado ? "FINALIZADO" : "EN VIA";
                        int procesoId = esFinalizado ? 4 : 3;
                        string estadoTicket = esFinalizado ? "FINALIZADO" : "RECEPCIONADO";
                        string obsDespacho = string.IsNullOrWhiteSpace(dto.ObservacionEntrega)
                            ? "Entrega y recepción registrada mediante Carga Masiva (Hoja de ruta física)."
                            : dto.ObservacionEntrega.Trim();

                        var ccExistenteId = await connection.ExecuteScalarAsync<long?>(
                            "SELECT TOP 1 Id FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @ticketId", new { ticketId }, transaction);

                        if (ccExistenteId.HasValue)
                        {
                            await connection.ExecuteAsync(@"
                                UPDATE TB_CONTROL_COMPANIAS
                                SET CompaniaId = @targetCompaniaId,
                                    LitrosDespachados = @litrosDespacho,
                                    LitrosRecibidosCompania = @litrosRecibidos,
                                    DiferenciaLitros = @dif,
                                    PorcentajeMerma = @merma,
                                    Estado = @estadoDespacho,
                                    Observacion = @obsDespacho,
                                    FechaSalida = ISNULL(FechaSalida, GETDATE()),
                                    FechaLlegada = CASE WHEN @estadoDespacho = 'FINALIZADO' THEN GETDATE() ELSE FechaLlegada END,
                                    ModifiedAt = GETDATE(),
                                    ModifiedBy = @choferEfectivo
                                WHERE Id = @ccId",
                                new { targetCompaniaId, litrosDespacho, litrosRecibidos, dif, merma, estadoDespacho, obsDespacho, ccId = ccExistenteId.Value, choferEfectivo }, transaction);
                        }
                        else
                        {
                            await connection.ExecuteAsync(@"
                                INSERT INTO TB_CONTROL_COMPANIAS 
                                (Fecha, UsuarioId, CompaniaId, CicloId, LitrosDespachados, LitrosRecibidosCompania, DiferenciaLitros, PorcentajeMerma, Estado, TipoLeche, Observacion, ControlRutaId, FechaSalida, FechaLlegada, CreatedAt, CreatedBy)
                                VALUES 
                                (@fechaRuta, @choferEfectivo, @targetCompaniaId, @cicloId, @litrosDespacho, @litrosRecibidos, @dif, @merma, @estadoDespacho, 'VACA', @obsDespacho, @ticketId, GETDATE(), CASE WHEN @estadoDespacho = 'FINALIZADO' THEN GETDATE() ELSE NULL END, GETDATE(), @choferEfectivo)",
                                new { fechaRuta, choferEfectivo, targetCompaniaId, cicloId, litrosDespacho, litrosRecibidos, dif, merma, estadoDespacho, obsDespacho, ticketId }, transaction);
                        }

                        await connection.ExecuteAsync(@"
                            UPDATE TB_CONTROL_RUTAS
                            SET TotalLitrosFinca = @totalLitrosFinca,
                                TotalLitrosReceptoria = @litrosRecibidos,
                                LitrosEntregadosCompania = @litrosRecibidos,
                                DiferenciaLitros = @dif,
                                DiferenciaReceptoria = @dif,
                                DiferenciaCompania = @dif,
                                MermaTotalLitros = @dif,
                                PorcentajeMerma = @merma,
                                Estado = @estadoTicket,
                                ProcesoActualId = @procesoId,
                                TipoDestino = 'COMPANIA_DIRECTA',
                                CompaniaDestinoId = @targetCompaniaId,
                                FechaEntregaCompania = GETDATE(),
                                FechaLlegadaReceptoria = GETDATE(),
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @choferEfectivo
                            WHERE Id = @ticketId",
                            new { totalLitrosFinca, litrosRecibidos, dif, merma, estadoTicket, procesoId, targetCompaniaId, ticketId, choferEfectivo }, transaction);

                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                            VALUES (@ticketId, @procesoId, GETDATE(), @choferEfectivo, @obsHistorial)",
                            new { ticketId, procesoId, choferEfectivo, obsHistorial = $"Entrega masiva directa a destino ({estadoTicket})" }, transaction);
                    }
                    else
                    {
                        await connection.ExecuteAsync(@"
                            UPDATE TB_CONTROL_RUTAS
                            SET TotalLitrosFinca = @totalLitrosFinca,
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @choferEfectivo
                            WHERE Id = @ticketId",
                            new { totalLitrosFinca, ticketId, choferEfectivo }, transaction);
                    }
                }

                transaction.Commit();
                return ids;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> ModificarLitrosAsync(int rutaId, int nuevosLitros, int usuarioId, string rol)
        {
            return await EditarRutaAsync(rutaId, new EditarRutaDto { Litros = nuevosLitros }, usuarioId, rol);
        }

        public async Task<bool> EditarRutaAsync(int rutaId, EditarRutaDto dto, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var ruta = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_RUTAS_RECOLECCION WHERE Id = @rutaId", new { rutaId });
            if (ruta == null) return false;

            int conductorActual = (int)ruta.UsuarioId;
            DateTime fechaActual = (DateTime)ruta.Fecha;

            if (rol == "CHOFER")
            {
                if (conductorActual != usuarioId)
                    throw new UnauthorizedAccessException("No tienes permiso para editar registros de otros conductores.");

                if (ruta.ControlRutaId != null)
                {
                    var ticket = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT ProcesoActualId, Estado FROM TB_CONTROL_RUTAS WHERE Id = @tId", 
                        new { tId = (long)ruta.ControlRutaId });
                    if (ticket != null && (ticket.ProcesoActualId != 1 || (ticket.Estado != "ABIERTO" && ticket.Estado != "PENDIENTE")))
                        throw new InvalidOperationException("No se puede editar una recolección de un viaje recibido, entregado o cerrado.");
                }
                else if (fechaActual.Date < DateTime.Today.AddDays(-7))
                {
                    throw new UnauthorizedAccessException("Solo puedes editar registros recientes o con viaje abierto.");
                }
            }

            DateTime fechaFinal = dto.Fecha?.Date ?? fechaActual;
            int litrosFinal = dto.Litros ?? dto.NuevosLitros ?? (int)ruta.Litros;
            int fincaFinal = dto.FincaId ?? (int)ruta.FincaId;
            int conductorFinal = (rol == "ADMIN" && dto.ConductorId.HasValue && dto.ConductorId.Value > 0)
                ? dto.ConductorId.Value
                : conductorActual;
            string? observacionFinal = dto.Observacion ?? (string?)ruta.Observacion;
            string? fotoComprobanteFinal = dto.FotoComprobante ?? (string?)ruta.FotoComprobante;

            bool esAcidaFinal = dto.EsAcida ?? (bool)ruta.EsAcida;
            bool esDiferidoFinal = dto.EsDiferido ?? (bool)(ruta.EsDiferido ?? false);
            string tipoLecheFinal = !string.IsNullOrWhiteSpace(dto.TipoLeche)
                ? dto.TipoLeche.Trim().ToUpper()
                : ((string?)ruta.TipoLeche ?? "VACA");

            var fincaInfo = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT ISNULL(PrecioLitroUSD, 0) AS PrecioLitroUSD, ISNULL(PrecioLitroAcidaUSD, 0) AS PrecioLitroAcidaUSD, ISNULL(TieneDosTiposLeche, 0) AS TieneDosTiposLeche, ISNULL(PrecioBufalaLitroUSD, 0) AS PrecioBufalaLitroUSD FROM TB_FINCAS WHERE Id = @fincaFinal", new { fincaFinal });

            decimal precioBase = (tipoLecheFinal == "BUFALA" && (bool)(fincaInfo?.TieneDosTiposLeche ?? false))
                ? (decimal)(fincaInfo?.PrecioBufalaLitroUSD ?? 0m)
                : (decimal)(fincaInfo?.PrecioLitroUSD ?? 0m);

            decimal precioAplicado = dto.PrecioLitroUSDAplicado ?? (esAcidaFinal 
                ? (decimal)(fincaInfo?.PrecioLitroAcidaUSD ?? 0m) 
                : precioBase);

            var sql = @"
                UPDATE TB_RUTAS_RECOLECCION 
                SET Litros = @litrosFinal,
                    FincaId = @fincaFinal,
                    UsuarioId = @conductorFinal,
                    Fecha = @fechaFinal,
                    EsAcida = @esAcidaFinal,
                    EsDiferido = @esDiferidoFinal,
                    TipoLeche = @tipoLecheFinal,
                    PrecioLitroUSDAplicado = @precioAplicado,
                    Observacion = @observacionFinal,
                    FotoComprobante = @fotoComprobanteFinal,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @rutaId";

            var rows = await connection.ExecuteAsync(sql, new
            {
                litrosFinal,
                fincaFinal,
                conductorFinal,
                fechaFinal,
                esAcidaFinal,
                esDiferidoFinal,
                tipoLecheFinal,
                precioAplicado,
                observacionFinal,
                fotoComprobanteFinal,
                usuarioId,
                rutaId
            });

            if (rows > 0 && ruta.ControlRutaId != null)
            {
                long tId = (long)ruta.ControlRutaId;
                await connection.ExecuteAsync(@"
                    UPDATE cr
                    SET cr.TotalLitrosFinca = ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0),
                        cr.DiferenciaReceptoria = ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria),
                        cr.DiferenciaLitros = CASE WHEN ISNULL(cr.LitrosEntregadosCompania, 0) > 0 
                            THEN (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria)) + ((ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria) + ISNULL(cr.LitrosCargadosAdicional, 0)) - cr.LitrosEntregadosCompania)
                            ELSE (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria))
                        END,
                        cr.MermaTotalLitros = CASE WHEN ISNULL(cr.LitrosEntregadosCompania, 0) > 0 
                            THEN (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria)) + ((ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria) + ISNULL(cr.LitrosCargadosAdicional, 0)) - cr.LitrosEntregadosCompania)
                            ELSE (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria))
                        END,
                        cr.ModifiedAt = GETDATE(),
                        cr.ModifiedBy = @usuarioId
                    FROM TB_CONTROL_RUTAS cr
                    WHERE cr.Id = @tId", new { tId, usuarioId });
            }

            return rows > 0;
        }

        public async Task<bool> EliminarRutaAsync(int rutaId, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var ruta = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_RUTAS_RECOLECCION WHERE Id = @rutaId", new { rutaId });
            if (ruta == null) return false;

            if (rol == "CHOFER")
            {
                if ((int)ruta.UsuarioId != usuarioId)
                    throw new UnauthorizedAccessException("No puedes eliminar registros de otros conductores.");

                if (ruta.ControlRutaId != null)
                {
                    var ticket = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT ProcesoActualId, Estado FROM TB_CONTROL_RUTAS WHERE Id = @tId", 
                        new { tId = (long)ruta.ControlRutaId });
                    if (ticket != null && (ticket.ProcesoActualId != 1 || (ticket.Estado != "ABIERTO" && ticket.Estado != "PENDIENTE")))
                        throw new InvalidOperationException("No se puede eliminar una recolección de un viaje recibido, entregado o cerrado.");
                }
                else if (((DateTime)ruta.Fecha).Date < DateTime.Today.AddDays(-7))
                {
                    throw new UnauthorizedAccessException("Solo puedes eliminar registros recientes o con viaje abierto.");
                }
            }

            var rows = await connection.ExecuteAsync("DELETE FROM TB_RUTAS_RECOLECCION WHERE Id = @rutaId", new { rutaId });

            if (rows > 0 && ruta.ControlRutaId != null)
            {
                long tId = (long)ruta.ControlRutaId;
                await connection.ExecuteAsync(@"
                    UPDATE cr
                    SET cr.TotalLitrosFinca = ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0),
                        cr.DiferenciaReceptoria = ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria),
                        cr.DiferenciaLitros = CASE WHEN ISNULL(cr.LitrosEntregadosCompania, 0) > 0 
                            THEN (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria)) + ((ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria) + ISNULL(cr.LitrosCargadosAdicional, 0)) - cr.LitrosEntregadosCompania)
                            ELSE (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria))
                        END,
                        cr.MermaTotalLitros = CASE WHEN ISNULL(cr.LitrosEntregadosCompania, 0) > 0 
                            THEN (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria)) + ((ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria) + ISNULL(cr.LitrosCargadosAdicional, 0)) - cr.LitrosEntregadosCompania)
                            ELSE (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria))
                        END,
                        cr.ModifiedAt = GETDATE(),
                        cr.ModifiedBy = @usuarioId
                    FROM TB_CONTROL_RUTAS cr
                    WHERE cr.Id = @tId", new { tId, usuarioId });
            }

            return rows > 0;
        }

        public async Task<bool> LimpiarRecoleccionAsync(long rutaId, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var ruta = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_RUTAS_RECOLECCION WHERE Id = @rutaId", new { rutaId });
            if (ruta == null) return false;

            // Resetear información de recolección manteniendo la asignación de la finca en el ticket
            await connection.ExecuteAsync(@"
                UPDATE TB_RUTAS_RECOLECCION
                SET Litros = 0,
                    FotoComprobante = NULL,
                    EsAcida = 0,
                    EsDiferido = 0,
                    LitrosOriginales = NULL,
                    Observacion = NULL,
                    PrecioLitroUSDAplicado = NULL,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @rutaId", new { rutaId, usuarioId });

            if (ruta.ControlRutaId != null)
            {
                long tId = (long)ruta.ControlRutaId;
                await connection.ExecuteAsync(@"
                    UPDATE cr
                    SET cr.TotalLitrosFinca = ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0),
                        cr.DiferenciaReceptoria = ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria),
                        cr.DiferenciaLitros = CASE WHEN ISNULL(cr.LitrosEntregadosCompania, 0) > 0 
                            THEN (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria)) + ((ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria) + ISNULL(cr.LitrosCargadosAdicional, 0)) - cr.LitrosEntregadosCompania)
                            ELSE (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria))
                        END,
                        cr.MermaTotalLitros = CASE WHEN ISNULL(cr.LitrosEntregadosCompania, 0) > 0 
                            THEN (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria)) + ((ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria) + ISNULL(cr.LitrosCargadosAdicional, 0)) - cr.LitrosEntregadosCompania)
                            ELSE (ISNULL((SELECT SUM(r.Litros) FROM TB_RUTAS_RECOLECCION r INNER JOIN TB_FINCAS f ON r.FincaId = f.Id WHERE r.ControlRutaId = cr.Id AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'), 0) - ISNULL(cr.LitrosRecibidosReceptoria, cr.TotalLitrosReceptoria))
                        END,
                        cr.ModifiedAt = GETDATE(),
                        cr.ModifiedBy = @usuarioId
                    FROM TB_CONTROL_RUTAS cr
                    WHERE cr.Id = @tId", new { tId, usuarioId });

                // Notificar al chofer del ticket
                var viajeInfo = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT UsuarioId FROM TB_CONTROL_RUTAS WHERE Id = @tId", new { tId });
                if (viajeInfo != null && viajeInfo.UsuarioId != null)
                {
                    int chofId = (int)viajeInfo.UsuarioId;
                    var fincaNom = await connection.QueryFirstOrDefaultAsync<string>(
                        "SELECT Nombre FROM TB_FINCAS WHERE Id = @fId", new { fId = (int)ruta.FincaId }) ?? $"Finca #{ruta.FincaId}";
                    try
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                            VALUES (@chofId, 'RECOLECCION_RESETEADA', '🔄 Parada Marcada como Pendiente', @msg, GETDATE(), @tId, 0, GETDATE())",
                            new { 
                                chofId, 
                                tId, 
                                msg = $"La información de \"{fincaNom}\" fue limpiada y colocada como NO RECOGIDA para tu recorrido en el Ticket #{tId}." 
                            });
                    }
                    catch { /* Tolerante */ }
                }
            }

            return true;
        }

        public async Task<bool> DiferirLitrosAsync(long rutaId, int litrosDiferir, int? cicloDestinoId, string? motivo, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var tx = connection.BeginTransaction();

            var original = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT * FROM TB_RUTAS_RECOLECCION WHERE Id = @rutaId",
                new { rutaId }, tx);

            if (original == null)
                throw new InvalidOperationException("No se encontró la recolección especificada.");

            int litrosActuales = (int)original.Litros;
            if (litrosDiferir <= 0 || litrosDiferir >= litrosActuales)
                throw new InvalidOperationException($"Los litros a diferir deben ser mayores a 0 y menores a los litros actuales ({litrosActuales} L).");

            int cicloActualId = (int)original.CicloId;
            int destinoCiclo = cicloDestinoId ?? 0;

            if (destinoCiclo <= 0)
            {
                var fechaFin = await connection.ExecuteScalarAsync<DateTime?>(
                    @"SELECT FechaFin FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloActualId",
                    new { cicloActualId }, tx);

                if (fechaFin.HasValue)
                {
                    destinoCiclo = await connection.ExecuteScalarAsync<int>(
                        @"SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE FechaInicio > @fFin ORDER BY FechaInicio ASC",
                        new { fFin = fechaFin.Value }, tx);
                }
                if (destinoCiclo <= 0)
                {
                    destinoCiclo = await connection.ExecuteScalarAsync<int>(
                        @"SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @cicloActualId ORDER BY Id ASC",
                        new { cicloActualId }, tx);
                }
            }

            if (destinoCiclo <= 0)
                throw new InvalidOperationException("No se encontró el siguiente ciclo operativo para diferir los litros.");

            int litrosRestantes = litrosActuales - litrosDiferir;
            int litrosOrig = (int?)original.LitrosOriginales ?? litrosActuales;
            string notaOriginal = (string)original.Observacion ?? "";
            string motivoStr = string.IsNullOrWhiteSpace(motivo) ? "Solicitud del productor" : motivo.Trim();

            string obsPadre = $"{notaOriginal} [Diferido: {litrosDiferir} L para Sem. {destinoCiclo} ({motivoStr})]".Trim();
            string obsHijo = $"[Traspaso diferido de Sem. {cicloActualId}: {litrosDiferir} L ({motivoStr})]".Trim();

            // 1. Actualizar registro original
            await connection.ExecuteAsync(@"
                UPDATE TB_RUTAS_RECOLECCION 
                SET Litros = @litrosRestantes,
                    LitrosOriginales = @litrosOrig,
                    Observacion = @obsPadre,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @rutaId",
                new { litrosRestantes, litrosOrig, obsPadre, usuarioId, rutaId }, tx);

            // 2. Insertar registro diferido hijo
            await connection.ExecuteAsync(@"
                INSERT INTO TB_RUTAS_RECOLECCION (
                    CicloId, Fecha, FincaId, UsuarioId, Litros,
                    PrecioLitroUSDAplicado, TasaDolarBsAplicada, Observacion,
                    EsAcida, ControlRutaId, TipoLeche,
                    CicloLiquidacionId, EsDiferido, RecoleccionOrigenId, LitrosOriginales,
                    CreatedAt, CreatedBy
                ) VALUES (
                    @CicloId, @Fecha, @FincaId, @ChoferUsuarioId, @Litros,
                    @PrecioLitroUSDAplicado, @TasaDolarBsAplicada, @Observacion,
                    @EsAcida, @ControlRutaId, @TipoLeche,
                    @CicloLiquidacionId, 1, @RecoleccionOrigenId, @Litros,
                    GETDATE(), @OperadorId
                )",
                new {
                    CicloId = cicloActualId, // Mantiene el ciclo físico de la ruta
                    Fecha = original.Fecha,
                    FincaId = original.FincaId,
                    ChoferUsuarioId = original.UsuarioId,
                    Litros = litrosDiferir,
                    PrecioLitroUSDAplicado = original.PrecioLitroUSDAplicado,
                    TasaDolarBsAplicada = original.TasaDolarBsAplicada,
                    Observacion = obsHijo,
                    EsAcida = original.EsAcida,
                    ControlRutaId = original.ControlRutaId,
                    TipoLeche = original.TipoLeche,
                    CicloLiquidacionId = destinoCiclo, // Se liquida en el ciclo destino
                    RecoleccionOrigenId = rutaId,
                    OperadorId = usuarioId
                }, tx);

            tx.Commit();
            return true;
        }

        public async Task<bool> RevertirDiferimientoAsync(long rutaId, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var tx = connection.BeginTransaction();

            var reg = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT * FROM TB_RUTAS_RECOLECCION WHERE Id = @rutaId",
                new { rutaId }, tx);

            if (reg == null)
                throw new InvalidOperationException("No se encontró la recolección.");

            long padreId = (reg.EsDiferido == true || reg.RecoleccionOrigenId != null) 
                ? (long)reg.RecoleccionOrigenId 
                : rutaId;

            var padre = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT * FROM TB_RUTAS_RECOLECCION WHERE Id = @padreId",
                new { padreId }, tx);

            if (padre == null)
                throw new InvalidOperationException("No se encontró la recolección original.");

            // Sumar los litros de los registros hijos diferidos
            var hijos = (await connection.QueryAsync<dynamic>(
                @"SELECT * FROM TB_RUTAS_RECOLECCION WHERE RecoleccionOrigenId = @padreId",
                new { padreId }, tx)).ToList();

            if (!hijos.Any())
                throw new InvalidOperationException("No hay registros diferidos asociados a esta recolección.");

            int totalLitrosHijos = hijos.Sum(h => (int)h.Litros);
            int nuevosLitrosPadre = (int)padre.Litros + totalLitrosHijos;

            // Eliminar los registros hijos diferidos
            await connection.ExecuteAsync(
                @"DELETE FROM TB_RUTAS_RECOLECCION WHERE RecoleccionOrigenId = @padreId",
                new { padreId }, tx);

            // Restaurar registro padre
            string obsLimpia = (string)padre.Observacion ?? "";
            // Remover marca [Diferido: ...]
            int idxDiferido = obsLimpia.IndexOf("[Diferido:", StringComparison.OrdinalIgnoreCase);
            if (idxDiferido >= 0)
            {
                obsLimpia = obsLimpia.Substring(0, idxDiferido).Trim();
            }

            await connection.ExecuteAsync(@"
                UPDATE TB_RUTAS_RECOLECCION 
                SET Litros = @nuevosLitrosPadre,
                    LitrosOriginales = NULL,
                    Observacion = @obsLimpia,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @padreId",
                new { nuevosLitrosPadre, obsLimpia, usuarioId, padreId }, tx);

            tx.Commit();
            return true;
        }
    }

    public interface ICatalogosRepository
    {
        // Fincas
        Task<IEnumerable<FincaDto>> ObtenerFincasAsync(bool soloActivos = false);
        Task<FincaDto?> ObtenerFincaPorIdAsync(int id);
        Task<int> CrearFincaAsync(CrearFincaDto dto);
        Task<bool> ActualizarFincaAsync(int id, EditarFincaDto dto, int? usuarioId = null, string? usuarioNombre = null);
        Task<bool> EliminarFincaAsync(int id);
        Task<int> ActualizarPreciosMasivoAsync(ActualizarPrecioMasivoDto dto, int usuarioId, string usuarioNombre);
        Task<IEnumerable<HistorialPrecioLogDto>> ObtenerHistorialPreciosAsync();

        // Companias
        Task<IEnumerable<Compania>> ObtenerCompaniasAsync(bool soloActivos = false);
        Task<Compania?> ObtenerCompaniaPorIdAsync(int id);
        Task<int> CrearCompaniaAsync(CrearCompaniaDto dto);
        Task<bool> ActualizarCompaniaAsync(int id, EditarCompaniaDto dto, int? usuarioId = null, string? usuarioNombre = null);
        Task<bool> ActualizarPrecioCompaniaAsync(int id, decimal nuevoPrecioUSD, decimal? nuevoPrecioBufalaUSD, decimal? nuevoPrecioAcidaUSD, string? observacion, int usuarioId, string usuarioNombre);
        Task<bool> EliminarCompaniaAsync(int id);
        Task<IEnumerable<dynamic>> ObtenerAbonosCompaniasAsync(int? companiaId = null);
        Task<int> CrearAbonoCompaniaAsync(GuardarAbonoCompaniaDto dto, int? usuarioId = null);
        Task<IEnumerable<dynamic>> ObtenerResumenCobranzasCompaniasAsync();

        // Bancos
        Task<IEnumerable<BancoDto>> ObtenerBancosAsync();
        Task<BancoDto?> ObtenerBancoPorIdAsync(int id);
        Task<int> CrearBancoAsync(CrearBancoDto dto);
        Task<bool> ActualizarBancoAsync(int id, EditarBancoDto dto);
        Task<bool> EliminarBancoAsync(int id);

        // Propietarios
        Task<IEnumerable<PropietarioDto>> ObtenerPropietariosAsync();
        Task<PropietarioDto?> ObtenerPropietarioPorIdAsync(int id);
        Task<int> CrearPropietarioAsync(CrearPropietarioDto dto, int? usuarioId = null);
        Task<bool> ActualizarPropietarioAsync(int id, ActualizarPropietarioDto dto, int? usuarioId = null);
        Task<bool> EliminarPropietarioAsync(int id);
        Task<bool> AsignarFincasPropietarioAsync(AsignarFincasPropietarioDto dto);
        Task<IEnumerable<PreLiquidacionConsolidadaDto>> ObtenerPreLiquidacionConsolidadaPropietariosAsync(int? cicloId = null);

        // Otros
        Task<IEnumerable<ChoferDto>> ObtenerChoferesAsync();
        Task<CicloOperativo?> ObtenerCicloActivoAsync();
        Task<IEnumerable<BalanceMermaDto>> ObtenerMermasHoyAsync(DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, int? choferId = null);
        Task<IEnumerable<PreLiquidacionDto>> ObtenerPreLiquidacionSemanaAsync(int? cicloId = null, string? cicloIds = null, DateTime? fechaInicio = null, DateTime? fechaFin = null);
        Task<bool> AjustarPreLiquidacionFincaAsync(AjustarPreLiquidacionFincaDto dto);
        Task<int> ActualizarTasaFincasPendientesAsync(ActualizarTasaPendientesDto dto);
        Task<bool> ProcesarPagoLiquidacionAsync(ProcesarPagoLiquidacionDto dto, int? usuarioId = null);
        Task<IEnumerable<PagoLiquidacionHistorialDto>> ObtenerHistorialPagosLiquidacionAsync(int? cicloId = null, int? fincaId = null, DateTime? desde = null, DateTime? hasta = null);
        Task<IEnumerable<dynamic>> ObtenerLogsPagosLiquidacionAsync(int? fincaId = null, int? cicloId = null);
        Task<EmpresaConfigDto> ObtenerEmpresaConfigAsync();
        Task<bool> GuardarEmpresaConfigAsync(EmpresaConfigDto dto);
        Task<bool> ActualizarLicenciaAsync(DateTime fechaVencimiento);
    }

    public class CatalogosRepository : ICatalogosRepository
    {
        private readonly string _connectionString;
        private readonly Transporte.Core.Interfaces.ITenantService? _tenantService;
        public CatalogosRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _tenantService = tenantService;
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        // --- FINCAS ---
        public async Task<IEnumerable<FincaDto>> ObtenerFincasAsync(bool soloActivos = false)
        {
            using var connection = new SqlConnection(_connectionString);
            var sqlFincas = @"
                SELECT 
                    f.Id, f.Codigo, f.Nombre, f.PropietarioId, 
                    ISNULL(p.Nombre, ISNULL(f.Propietario, 'N/A')) AS Propietario, 
                    ISNULL(p.CedulaRIF, ISNULL(f.CedulaRIF, '')) AS CedulaRIF, 
                    f.Telefono, 
                    ISNULL(p.BancoId, f.BancoId) AS BancoId, 
                    ISNULL(bp.Nombre, ISNULL(b.Nombre, 'Sin Banco')) AS BancoNombre,
                    ISNULL(p.NumeroCuenta, ISNULL(f.NumeroCuenta, '')) AS NumeroCuenta, 
                    f.TipoServicioId, ISNULL(ts.Nombre, 'RUTA') AS TipoServicioNombre,
                    f.CompaniaId, comp.Nombre AS CompaniaNombre,
                    COALESCE(f.RutaId, (SELECT TOP 1 rlf.RutaLogisticaId FROM TB_RUTAS_LOGISTICA_FINCAS rlf WHERE rlf.FincaId = f.Id ORDER BY rlf.EsPrincipal DESC, rlf.Id DESC)) AS RutaId,
                    COALESCE(rl.Nombre, (SELECT TOP 1 rl2.Nombre FROM TB_RUTAS_LOGISTICA_FINCAS rlf2 INNER JOIN TB_RUTAS_LOGISTICA rl2 ON rlf2.RutaLogisticaId = rl2.Id WHERE rlf2.FincaId = f.Id ORDER BY rlf2.EsPrincipal DESC, rlf2.Id DESC)) AS RutaNombre,
                    f.PrecioLitroUSD, f.PrecioLitroAcidaUSD, 
                    ISNULL(f.TieneDosTiposLeche, 0) AS TieneDosTiposLeche,
                    ISNULL(f.PrecioBufalaLitroUSD, 0) AS PrecioBufalaLitroUSD,
                    ISNULL((SELECT CAST(ROUND(AVG(CAST(r.Litros AS FLOAT)), 0) AS INT) FROM TB_RUTAS_RECOLECCION r WHERE r.FincaId = f.Id AND r.Fecha >= DATEADD(day, -60, GETDATE())), ISNULL((SELECT CAST(ROUND(AVG(CAST(sub.Litros AS FLOAT)), 0) AS INT) FROM (SELECT TOP 15 r2.Litros FROM TB_RUTAS_RECOLECCION r2 WHERE r2.FincaId = f.Id ORDER BY r2.Fecha DESC) sub), 0)) AS PromedioLitrosDiarios,
                    ISNULL((SELECT TOP 1 r.Litros FROM TB_RUTAS_RECOLECCION r WHERE r.FincaId = f.Id ORDER BY r.Fecha DESC), 0) AS UltimoLitros,
                    f.Activo, f.IsDeleted, f.CreatedAt
                FROM TB_FINCAS f
                LEFT JOIN TB_PROPIETARIOS p ON f.PropietarioId = p.Id
                LEFT JOIN TB_BANCOS b ON f.BancoId = b.Id
                LEFT JOIN TB_BANCOS bp ON p.BancoId = bp.Id
                LEFT JOIN TB_TIPO_SERVICIO ts ON f.TipoServicioId = ts.Id
                LEFT JOIN TB_COMPANIAS comp ON f.CompaniaId = comp.Id
                LEFT JOIN TB_RUTAS_LOGISTICA rl ON f.RutaId = rl.Id
                WHERE f.IsDeleted = 0 " + (soloActivos ? " AND f.Activo = 1 " : "") + @"
                ORDER BY f.Nombre ASC";

            var fincas = (await connection.QueryAsync<FincaDto>(sqlFincas)).ToList();

            var sqlCuentas = @"
                SELECT c.Id, c.FincaId, c.BancoId, b.Nombre AS BancoNombre, b.Codigo AS BancoCodigo, 
                       c.NumeroCuenta, c.Titular, c.CedulaRIF, c.EsPrincipal, c.Activo
                FROM TB_FINCA_CUENTAS_BANCARIAS c
                INNER JOIN TB_BANCOS b ON c.BancoId = b.Id
                WHERE c.Activo = 1";
            var cuentas = (await connection.QueryAsync<FincaCuentaBancariaDto>(sqlCuentas)).ToList();

            foreach (var f in fincas)
            {
                f.Cuentas = cuentas.Where(c => c.FincaId == f.Id).ToList();
                if (f.Cuentas.Count > 0)
                {
                    var principal = f.Cuentas.FirstOrDefault(c => c.EsPrincipal) ?? f.Cuentas.First();
                    f.BancoNombre = principal.BancoNombre;
                    f.NumeroCuenta = principal.NumeroCuenta;
                    f.BancoId = principal.BancoId;
                }
            }

            return fincas;
        }

        public async Task<FincaDto?> ObtenerFincaPorIdAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    f.Id, f.Codigo, f.Nombre, f.PropietarioId, f.Propietario, f.CedulaRIF, f.Telefono, 
                    f.BancoId, ISNULL(b.Nombre, 'Sin Banco') AS BancoNombre,
                    f.NumeroCuenta, f.TipoServicioId, ISNULL(ts.Nombre, 'RUTA') AS TipoServicioNombre,
                    f.CompaniaId, comp.Nombre AS CompaniaNombre,
                    f.RutaId, rl.Nombre AS RutaNombre,
                    f.PrecioLitroUSD, f.PrecioLitroAcidaUSD, 
                    ISNULL(f.TieneDosTiposLeche, 0) AS TieneDosTiposLeche,
                    ISNULL(f.PrecioBufalaLitroUSD, 0) AS PrecioBufalaLitroUSD,
                    ISNULL((SELECT CAST(ROUND(AVG(CAST(r.Litros AS FLOAT)), 0) AS INT) FROM TB_RUTAS_RECOLECCION r WHERE r.FincaId = f.Id AND r.Fecha >= DATEADD(day, -30, GETDATE())), 0) AS PromedioLitrosDiarios,
                    ISNULL((SELECT TOP 1 r.Litros FROM TB_RUTAS_RECOLECCION r WHERE r.FincaId = f.Id ORDER BY r.Fecha DESC), 0) AS UltimoLitros,
                    f.Activo, f.IsDeleted, f.CreatedAt
                FROM TB_FINCAS f
                LEFT JOIN TB_BANCOS b ON f.BancoId = b.Id
                LEFT JOIN TB_TIPO_SERVICIO ts ON f.TipoServicioId = ts.Id
                LEFT JOIN TB_COMPANIAS comp ON f.CompaniaId = comp.Id
                LEFT JOIN TB_RUTAS_LOGISTICA rl ON f.RutaId = rl.Id
                WHERE f.Id = @id AND f.IsDeleted = 0";
            var finca = await connection.QueryFirstOrDefaultAsync<FincaDto>(sql, new { id });
            if (finca != null)
            {
                var sqlCuentas = @"
                    SELECT c.Id, c.FincaId, c.BancoId, b.Nombre AS BancoNombre, b.Codigo AS BancoCodigo, 
                           c.NumeroCuenta, c.Titular, c.CedulaRIF, c.EsPrincipal, c.Activo
                    FROM TB_FINCA_CUENTAS_BANCARIAS c
                    INNER JOIN TB_BANCOS b ON c.BancoId = b.Id
                    WHERE c.FincaId = @id AND c.Activo = 1";
                finca.Cuentas = (await connection.QueryAsync<FincaCuentaBancariaDto>(sqlCuentas, new { id })).ToList();
            }
            return finca;
        }

        public async Task<int> CrearFincaAsync(CrearFincaDto dto)
        {
            using var connection = new SqlConnection(_connectionString);

            if (dto.PropietarioId.HasValue && dto.PropietarioId.Value > 0)
            {
                var prop = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT Nombre, ISNULL(CedulaRIF, '') AS RIF FROM TB_PROPIETARIOS WHERE Id = @id", new { id = dto.PropietarioId.Value });
                if (prop != null)
                {
                    dto.Propietario = (string)prop.Nombre;
                    if (string.IsNullOrWhiteSpace(dto.CedulaRIF) && !string.IsNullOrWhiteSpace((string)prop.RIF))
                    {
                        dto.CedulaRIF = (string)prop.RIF;
                    }
                }
            }

            dto.TipoServicioId = (dto.TipoServicioId.HasValue && dto.TipoServicioId.Value > 0) ? dto.TipoServicioId.Value : 1;

            var sql = @"
                DECLARE @InsertedId INT;
                INSERT INTO TB_FINCAS 
                (Codigo, Nombre, PropietarioId, Propietario, CedulaRIF, Telefono, BancoId, NumeroCuenta, TipoServicioId, CompaniaId, RutaId, PrecioLitroUSD, PrecioLitroAcidaUSD, TieneDosTiposLeche, PrecioBufalaLitroUSD, Activo, IsDeleted, CreatedAt)
                VALUES 
                ('', @Nombre, @PropietarioId, @Propietario, @CedulaRIF, @Telefono, @BancoId, @NumeroCuenta, @TipoServicioId, @CompaniaId, @RutaId, @PrecioLitroUSD, @PrecioLitroAcidaUSD, @TieneDosTiposLeche, @PrecioBufalaLitroUSD, @Activo, 0, GETDATE());
                SET @InsertedId = SCOPE_IDENTITY();
                
                UPDATE TB_FINCAS 
                SET Codigo = 'FINCA-' + CAST(@InsertedId AS VARCHAR(20))
                WHERE Id = @InsertedId;

                SELECT @InsertedId;";
            var fincaId = await connection.ExecuteScalarAsync<int>(sql, dto);

            if (dto.Cuentas != null && dto.Cuentas.Count > 0)
            {
                foreach (var c in dto.Cuentas)
                {
                    if (c.BancoId > 0)
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_FINCA_CUENTAS_BANCARIAS 
                            (FincaId, BancoId, NumeroCuenta, Titular, CedulaRIF, EsPrincipal, Activo, CreatedAt)
                            VALUES 
                            (@fincaId, @BancoId, @NumeroCuenta, @Titular, @CedulaRIF, @EsPrincipal, 1, GETDATE())",
                            new { fincaId, c.BancoId, NumeroCuenta = c.NumeroCuenta ?? "", Titular = c.Titular ?? dto.Propietario, CedulaRIF = c.CedulaRIF ?? dto.CedulaRIF, c.EsPrincipal });
                    }
                }

                var principal = dto.Cuentas.FirstOrDefault(c => c.EsPrincipal) ?? dto.Cuentas.FirstOrDefault();
                if (principal != null)
                {
                    await connection.ExecuteAsync("UPDATE TB_FINCAS SET BancoId = @BancoId, NumeroCuenta = @NumeroCuenta WHERE Id = @fincaId",
                        new { principal.BancoId, NumeroCuenta = principal.NumeroCuenta ?? "", fincaId });
                }
            }

            return fincaId;
        }

        private async Task EnsureTableHistorialPreciosExistsAsync(IDbConnection connection)
        {
            var sqlTable = @"
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TB_HISTORIAL_LOG_PRECIOS')
                BEGIN
                    CREATE TABLE TB_HISTORIAL_LOG_PRECIOS (
                        Id INT IDENTITY(1,1) PRIMARY KEY,
                        FechaRegistro DATETIME NOT NULL DEFAULT GETDATE(),
                        TipoCambio VARCHAR(20) NOT NULL,
                        FincaId INT NULL,
                        FincaNombre NVARCHAR(200) NULL,
                        PrecioAnterior DECIMAL(18,4) NOT NULL,
                        PrecioNuevo DECIMAL(18,4) NOT NULL,
                        CantidadFincasAfectadas INT NOT NULL DEFAULT 1,
                        UsuarioId INT NULL,
                        UsuarioNombre NVARCHAR(150) NULL,
                        Observacion NVARCHAR(500) NULL
                    );
                END";
            await connection.ExecuteAsync(sqlTable);
        }

        public async Task<bool> ActualizarFincaAsync(int id, EditarFincaDto dto, int? usuarioId = null, string? usuarioNombre = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureTableHistorialPreciosExistsAsync(connection);

            if (dto.PropietarioId.HasValue && dto.PropietarioId.Value > 0)
            {
                var prop = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT Nombre FROM TB_PROPIETARIOS WHERE Id = @id", new { id = dto.PropietarioId.Value });
                if (prop != null)
                {
                    dto.Propietario = (string)prop.Nombre;
                }
            }

            var fincaActual = await connection.QueryFirstOrDefaultAsync<FincaDto>(
                "SELECT Id, Nombre, PrecioLitroUSD, ISNULL(PrecioBufalaLitroUSD, 0) AS PrecioBufalaLitroUSD, ISNULL(PrecioLitroAcidaUSD, 0) AS PrecioLitroAcidaUSD FROM TB_FINCAS WHERE Id = @id AND IsDeleted = 0", new { id });

            if (fincaActual == null) return false;

            var precioAnterior = fincaActual.PrecioLitroUSD;
            var precioBufalaAnt = fincaActual.PrecioBufalaLitroUSD ?? 0m;
            var precioAcidaAnt = fincaActual.PrecioLitroAcidaUSD;

            var precioCambio = dto.PrecioLitroUSD.HasValue && dto.PrecioLitroUSD.Value != precioAnterior;
            var precioBufalaCambio = dto.PrecioBufalaLitroUSD.HasValue && dto.PrecioBufalaLitroUSD.Value != precioBufalaAnt;
            var precioAcidaCambio = dto.PrecioLitroAcidaUSD.HasValue && dto.PrecioLitroAcidaUSD.Value != precioAcidaAnt;

            var sql = @"
                UPDATE TB_FINCAS
                SET Nombre = COALESCE(@Nombre, Nombre),
                    PropietarioId = COALESCE(@PropietarioId, PropietarioId),
                    Propietario = COALESCE(@Propietario, Propietario),
                    CedulaRIF = COALESCE(@CedulaRIF, CedulaRIF),
                    Telefono = COALESCE(@Telefono, Telefono),
                    BancoId = COALESCE(@BancoId, BancoId),
                    NumeroCuenta = COALESCE(@NumeroCuenta, NumeroCuenta),
                    TipoServicioId = COALESCE(@TipoServicioId, TipoServicioId),
                    CompaniaId = @CompaniaId,
                    PrecioLitroUSD = COALESCE(@PrecioLitroUSD, PrecioLitroUSD),
                    PrecioLitroAcidaUSD = COALESCE(@PrecioLitroAcidaUSD, PrecioLitroAcidaUSD),
                    TieneDosTiposLeche = COALESCE(@TieneDosTiposLeche, TieneDosTiposLeche),
                    PrecioBufalaLitroUSD = COALESCE(@PrecioBufalaLitroUSD, PrecioBufalaLitroUSD),
                    Activo = COALESCE(@Activo, Activo)
                WHERE Id = @id AND IsDeleted = 0";

            var rows = await connection.ExecuteAsync(sql, new {
                id,
                dto.Nombre,
                dto.PropietarioId,
                dto.Propietario,
                dto.CedulaRIF,
                dto.Telefono,
                dto.BancoId,
                dto.NumeroCuenta,
                dto.TipoServicioId,
                dto.CompaniaId,
                dto.PrecioLitroUSD,
                dto.PrecioLitroAcidaUSD,
                dto.TieneDosTiposLeche,
                dto.PrecioBufalaLitroUSD,
                dto.Activo
            });

            if (rows > 0)
            {
                var sqlLog = @"
                    INSERT INTO TB_HISTORIAL_LOG_PRECIOS
                    (FechaRegistro, TipoCambio, FincaId, FincaNombre, PrecioAnterior, PrecioNuevo, CantidadFincasAfectadas, UsuarioId, UsuarioNombre, Observacion)
                    VALUES
                    (GETDATE(), 'INDIVIDUAL', @id, @nombre, @precioAnterior, @precioNuevo, 1, @usuarioId, @usuarioNombre, @observacion);";

                if (precioCambio)
                {
                    await connection.ExecuteAsync(sqlLog, new
                    {
                        id,
                        nombre = fincaActual.Nombre,
                        precioAnterior,
                        precioNuevo = dto.PrecioLitroUSD!.Value,
                        usuarioId,
                        usuarioNombre = usuarioNombre ?? "Administrador",
                        observacion = "Cambio individual de precio Leche Vaca ($/LT)"
                    });
                }

                if (precioBufalaCambio)
                {
                    await connection.ExecuteAsync(sqlLog, new
                    {
                        id,
                        nombre = fincaActual.Nombre,
                        precioAnterior = precioBufalaAnt,
                        precioNuevo = dto.PrecioBufalaLitroUSD!.Value,
                        usuarioId,
                        usuarioNombre = usuarioNombre ?? "Administrador",
                        observacion = "Cambio individual de precio Leche Búfala ($/LT)"
                    });
                }

                if (precioAcidaCambio)
                {
                    await connection.ExecuteAsync(sqlLog, new
                    {
                        id,
                        nombre = fincaActual.Nombre,
                        precioAnterior = precioAcidaAnt,
                        precioNuevo = dto.PrecioLitroAcidaUSD!.Value,
                        usuarioId,
                        usuarioNombre = usuarioNombre ?? "Administrador",
                        observacion = "Cambio individual de precio Leche Ácida ($/LT)"
                    });
                }
            }

            if (dto.Cuentas != null)
            {
                await connection.ExecuteAsync("DELETE FROM TB_FINCA_CUENTAS_BANCARIAS WHERE FincaId = @id", new { id });
                foreach (var c in dto.Cuentas)
                {
                    if (c.BancoId > 0)
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_FINCA_CUENTAS_BANCARIAS 
                            (FincaId, BancoId, NumeroCuenta, Titular, CedulaRIF, EsPrincipal, Activo, CreatedAt)
                            VALUES 
                            (@id, @BancoId, @NumeroCuenta, @Titular, @CedulaRIF, @EsPrincipal, 1, GETDATE())",
                            new { id, c.BancoId, NumeroCuenta = c.NumeroCuenta ?? "", Titular = c.Titular ?? dto.Propietario, CedulaRIF = c.CedulaRIF ?? dto.CedulaRIF, c.EsPrincipal });
                    }
                }

                var principal = dto.Cuentas.FirstOrDefault(c => c.EsPrincipal) ?? dto.Cuentas.FirstOrDefault();
                if (principal != null)
                {
                    await connection.ExecuteAsync("UPDATE TB_FINCAS SET BancoId = @BancoId, NumeroCuenta = @NumeroCuenta WHERE Id = @id",
                        new { principal.BancoId, NumeroCuenta = principal.NumeroCuenta ?? "", id });
                }
            }

            return rows > 0;
        }

        public async Task<int> ActualizarPreciosMasivoAsync(ActualizarPrecioMasivoDto dto, int usuarioId, string usuarioNombre)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureTableHistorialPreciosExistsAsync(connection);

            var sqlWhere = dto.SoloActivos ? "WHERE IsDeleted = 0 AND Activo = 1" : "WHERE IsDeleted = 0";

            var precioPromedioAnterior = await connection.ExecuteScalarAsync<decimal?>(
                $"SELECT AVG(PrecioLitroUSD) FROM TB_FINCAS {sqlWhere}") ?? 0.0m;

            var sqlUpdate = $@"
                UPDATE TB_FINCAS 
                SET PrecioLitroUSD = @NuevoPrecioUSD 
                {sqlWhere};
                SELECT @@ROWCOUNT;";

            var affectedRows = await connection.ExecuteScalarAsync<int>(sqlUpdate, new { dto.NuevoPrecioUSD });

            if (affectedRows > 0)
            {
                var sqlLog = @"
                    INSERT INTO TB_HISTORIAL_LOG_PRECIOS
                    (FechaRegistro, TipoCambio, FincaId, FincaNombre, PrecioAnterior, PrecioNuevo, CantidadFincasAfectadas, UsuarioId, UsuarioNombre, Observacion)
                    VALUES
                    (GETDATE(), 'MASIVO', NULL, @fincaNombre, @PrecioAnterior, @PrecioNuevo, @CantidadFincasAfectadas, @UsuarioId, @UsuarioNombre, @Observacion);";

                await connection.ExecuteAsync(sqlLog, new
                {
                    fincaNombre = $"TODAS LAS FINCAS ({affectedRows} Fincas)",
                    PrecioAnterior = precioPromedioAnterior,
                    PrecioNuevo = dto.NuevoPrecioUSD,
                    CantidadFincasAfectadas = affectedRows,
                    UsuarioId = usuarioId,
                    UsuarioNombre = usuarioNombre,
                    Observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? "Actualización masiva de precio por litro ($/LT)" : dto.Observacion
                });
            }

            return affectedRows;
        }

        public async Task<IEnumerable<HistorialPrecioLogDto>> ObtenerHistorialPreciosAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureTableHistorialPreciosExistsAsync(connection);

            var sql = @"
                SELECT Id, FechaRegistro, TipoCambio, FincaId, FincaNombre, 
                       PrecioAnterior, PrecioNuevo, CantidadFincasAfectadas, 
                       UsuarioId, UsuarioNombre, Observacion
                FROM TB_HISTORIAL_LOG_PRECIOS
                ORDER BY Id DESC, FechaRegistro DESC";

            return await connection.QueryAsync<HistorialPrecioLogDto>(sql);
        }

        public async Task<bool> EliminarFincaAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var rows = await connection.ExecuteAsync("UPDATE TB_FINCAS SET IsDeleted = 1 WHERE Id = @id", new { id });
            return rows > 0;
        }

        // --- COMPANIAS ---
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, bool> _ensuredCompaniasEsPrincipal = new();

        private async Task EnsureCompaniasEsPrincipalColumnExistsAsync(IDbConnection connection)
        {
            var dbKey = connection.Database ?? "default";
            if (_ensuredCompaniasEsPrincipal.ContainsKey(dbKey)) return;

            try
            {
                var sqlCheck = @"
                    IF NOT EXISTS (
                        SELECT 1 FROM sys.columns 
                        WHERE object_id = OBJECT_ID('TB_COMPANIAS') AND name = 'EsPrincipal'
                    )
                    BEGIN
                        ALTER TABLE TB_COMPANIAS ADD EsPrincipal BIT NOT NULL DEFAULT 0;
                    END;

                    -- Si ninguna compañía está marcada como Principal, auto-marcar la Receptoría / Planta Matriz del tenant
                    IF NOT EXISTS (SELECT 1 FROM TB_COMPANIAS WHERE EsPrincipal = 1 AND IsDeleted = 0)
                    BEGIN
                        UPDATE TB_COMPANIAS
                        SET EsPrincipal = 1
                        WHERE Id = (
                            SELECT TOP 1 Id FROM TB_COMPANIAS
                            WHERE IsDeleted = 0
                            ORDER BY CASE 
                                WHEN UPPER(Nombre) LIKE '%RECEPTOR%' THEN 1
                                WHEN UPPER(Nombre) LIKE '%CAMPO%VERDE%' THEN 2
                                WHEN UPPER(Nombre) LIKE '%VERGEL%' THEN 3
                                WHEN UPPER(Nombre) LIKE '%PLANTA%' THEN 4
                                WHEN UPPER(Nombre) LIKE '%MATRIZ%' THEN 5
                                ELSE 6 END, Id ASC
                        );
                    END;";
                await connection.ExecuteAsync(sqlCheck);
                _ensuredCompaniasEsPrincipal[dbKey] = true;
            }
            catch { /* Tolerante */ }
        }

        public async Task<IEnumerable<Compania>> ObtenerCompaniasAsync(bool soloActivos = false)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureCompaniasEsPrincipalColumnExistsAsync(connection);
            var sql = @"
                SELECT c.*, ISNULL(ts.Nombre, 'RUTA') AS TipoServicioNombre 
                FROM TB_COMPANIAS c
                LEFT JOIN TB_TIPO_SERVICIO ts ON c.TipoServicioId = ts.Id
                WHERE c.IsDeleted = 0 " + (soloActivos ? " AND c.Activo = 1 " : "") + @"
                ORDER BY c.EsPrincipal DESC, c.Nombre ASC";
            return await connection.QueryAsync<Compania>(sql);
        }

        public async Task<Compania?> ObtenerCompaniaPorIdAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureCompaniasEsPrincipalColumnExistsAsync(connection);
            var sql = @"
                SELECT c.*, ISNULL(ts.Nombre, 'RUTA') AS TipoServicioNombre 
                FROM TB_COMPANIAS c
                LEFT JOIN TB_TIPO_SERVICIO ts ON c.TipoServicioId = ts.Id
                WHERE c.Id = @id AND c.IsDeleted = 0";
            return await connection.QueryFirstOrDefaultAsync<Compania>(sql, new { id });
        }

        public async Task<int> CrearCompaniaAsync(CrearCompaniaDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureCompaniasEsPrincipalColumnExistsAsync(connection);
            dto.TipoServicioId = (dto.TipoServicioId.HasValue && dto.TipoServicioId.Value > 0) ? dto.TipoServicioId.Value : 1;
            dto.DiaAperturaSemana = string.IsNullOrWhiteSpace(dto.DiaAperturaSemana) ? "Martes" : dto.DiaAperturaSemana.Trim();
            dto.DiaCierreSemana = string.IsNullOrWhiteSpace(dto.DiaCierreSemana) ? "Lunes" : dto.DiaCierreSemana.Trim();
            if (dto.EsPrincipal)
            {
                await connection.ExecuteAsync("UPDATE TB_COMPANIAS SET EsPrincipal = 0");
            }
            var sql = @"
                INSERT INTO TB_COMPANIAS 
                (Nombre, Encargado, Telefono, Direccion, TipoServicioId, PrecioCompraLitroUSD, PrecioBufalaLitroUSD, PrecioAcidaLitroUSD, DiaAperturaSemana, DiaCierreSemana, Activo, EsPrincipal, IsDeleted, CreatedAt)
                VALUES 
                (@Nombre, @Encargado, @Telefono, @Direccion, @TipoServicioId, @PrecioCompraLitroUSD, @PrecioBufalaLitroUSD, @PrecioAcidaLitroUSD, @DiaAperturaSemana, @DiaCierreSemana, @Activo, @EsPrincipal, 0, GETDATE());
                SELECT CAST(SCOPE_IDENTITY() as int);";
            return await connection.ExecuteScalarAsync<int>(sql, dto);
        }

        public async Task<bool> ActualizarCompaniaAsync(int id, EditarCompaniaDto dto, int? usuarioId = null, string? usuarioNombre = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureTableHistorialPreciosExistsAsync(connection);
            await EnsureCompaniasEsPrincipalColumnExistsAsync(connection);

            if (dto.EsPrincipal.HasValue && dto.EsPrincipal.Value)
            {
                await connection.ExecuteAsync("UPDATE TB_COMPANIAS SET EsPrincipal = 0 WHERE Id <> @id", new { id });
            }

            var compActual = await connection.QueryFirstOrDefaultAsync<Compania>(
                "SELECT Id, Nombre, PrecioCompraLitroUSD, PrecioBufalaLitroUSD, PrecioAcidaLitroUSD FROM TB_COMPANIAS WHERE Id = @id AND IsDeleted = 0", new { id });

            if (compActual == null) return false;

            var precioVacaAnt = compActual.PrecioCompraLitroUSD;
            var precioBufalaAnt = compActual.PrecioBufalaLitroUSD ?? 0m;
            var precioAcidaAnt = compActual.PrecioAcidaLitroUSD ?? 0m;

            var precioVacaCambio = dto.PrecioCompraLitroUSD.HasValue && dto.PrecioCompraLitroUSD.Value != precioVacaAnt;
            var precioBufalaCambio = dto.PrecioBufalaLitroUSD.HasValue && dto.PrecioBufalaLitroUSD.Value != precioBufalaAnt;
            var precioAcidaCambio = dto.PrecioAcidaLitroUSD.HasValue && dto.PrecioAcidaLitroUSD.Value != precioAcidaAnt;

            var sql = @"
                UPDATE TB_COMPANIAS
                SET Nombre = COALESCE(@Nombre, Nombre),
                    Encargado = COALESCE(@Encargado, Encargado),
                    Telefono = COALESCE(@Telefono, Telefono),
                    Direccion = COALESCE(@Direccion, Direccion),
                    TipoServicioId = COALESCE(@TipoServicioId, TipoServicioId),
                    PrecioCompraLitroUSD = COALESCE(@PrecioCompraLitroUSD, PrecioCompraLitroUSD),
                    PrecioBufalaLitroUSD = COALESCE(@PrecioBufalaLitroUSD, PrecioBufalaLitroUSD),
                    PrecioAcidaLitroUSD = COALESCE(@PrecioAcidaLitroUSD, PrecioAcidaLitroUSD),
                    DiaAperturaSemana = COALESCE(@DiaAperturaSemana, DiaAperturaSemana),
                    DiaCierreSemana = COALESCE(@DiaCierreSemana, DiaCierreSemana),
                    Activo = COALESCE(@Activo, Activo),
                    EsPrincipal = COALESCE(@EsPrincipal, EsPrincipal)
                WHERE Id = @id AND IsDeleted = 0";
            var rows = await connection.ExecuteAsync(sql, new {
                id,
                dto.Nombre,
                dto.Encargado,
                dto.Telefono,
                dto.Direccion,
                dto.TipoServicioId,
                dto.PrecioCompraLitroUSD,
                dto.PrecioBufalaLitroUSD,
                dto.PrecioAcidaLitroUSD,
                dto.DiaAperturaSemana,
                dto.DiaCierreSemana,
                dto.Activo,
                dto.EsPrincipal
            });

            if (rows > 0)
            {
                var sqlLog = @"
                    INSERT INTO TB_HISTORIAL_LOG_PRECIOS
                    (FechaRegistro, TipoCambio, FincaId, FincaNombre, PrecioAnterior, PrecioNuevo, CantidadFincasAfectadas, UsuarioId, UsuarioNombre, Observacion)
                    VALUES
                    (GETDATE(), 'COMPANIA', NULL, @fincaNombre, @precioAnterior, @precioNuevo, 1, @usuarioId, @usuarioNombre, @observacion);";

                if (precioVacaCambio)
                {
                    await connection.ExecuteAsync(sqlLog, new
                    {
                        fincaNombre = compActual.Nombre,
                        precioAnterior = precioVacaAnt,
                        precioNuevo = dto.PrecioCompraLitroUSD!.Value,
                        usuarioId,
                        usuarioNombre = usuarioNombre ?? "Administrador",
                        observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? "Cambio de precio Leche Vaca de compañía ($/L)" : $"{dto.Observacion.Trim()} (Vaca)"
                    });
                }

                if (precioBufalaCambio)
                {
                    await connection.ExecuteAsync(sqlLog, new
                    {
                        fincaNombre = compActual.Nombre,
                        precioAnterior = precioBufalaAnt,
                        precioNuevo = dto.PrecioBufalaLitroUSD!.Value,
                        usuarioId,
                        usuarioNombre = usuarioNombre ?? "Administrador",
                        observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? "Cambio de precio Leche Búfala de compañía ($/L)" : $"{dto.Observacion.Trim()} (Búfala)"
                    });
                }

                if (precioAcidaCambio)
                {
                    await connection.ExecuteAsync(sqlLog, new
                    {
                        fincaNombre = compActual.Nombre,
                        precioAnterior = precioAcidaAnt,
                        precioNuevo = dto.PrecioAcidaLitroUSD!.Value,
                        usuarioId,
                        usuarioNombre = usuarioNombre ?? "Administrador",
                        observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? "Cambio de precio Leche Ácida/Mala de compañía ($/L)" : $"{dto.Observacion.Trim()} (Ácida/Mala)"
                    });
                }
            }

            return rows > 0;
        }

        public async Task<bool> ActualizarPrecioCompaniaAsync(int id, decimal nuevoPrecioUSD, decimal? nuevoPrecioBufalaUSD, decimal? nuevoPrecioAcidaUSD, string? observacion, int usuarioId, string usuarioNombre)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureTableHistorialPreciosExistsAsync(connection);

            var compActual = await connection.QueryFirstOrDefaultAsync<Compania>(
                "SELECT Id, Nombre, PrecioCompraLitroUSD, PrecioBufalaLitroUSD, PrecioAcidaLitroUSD FROM TB_COMPANIAS WHERE Id = @id AND IsDeleted = 0", new { id });

            if (compActual == null) return false;

            var precioAnterior = compActual.PrecioCompraLitroUSD;
            var precioBufalaAnt = compActual.PrecioBufalaLitroUSD ?? 0m;
            var precioAcidaAnt = compActual.PrecioAcidaLitroUSD ?? 0m;

            var rows = await connection.ExecuteAsync(
                @"UPDATE TB_COMPANIAS 
                  SET PrecioCompraLitroUSD = @nuevoPrecioUSD,
                      PrecioBufalaLitroUSD = COALESCE(@nuevoPrecioBufalaUSD, PrecioBufalaLitroUSD),
                      PrecioAcidaLitroUSD = COALESCE(@nuevoPrecioAcidaUSD, PrecioAcidaLitroUSD)
                  WHERE Id = @id AND IsDeleted = 0",
                new { id, nuevoPrecioUSD, nuevoPrecioBufalaUSD, nuevoPrecioAcidaUSD });

            if (rows > 0)
            {
                var sqlLog = @"
                    INSERT INTO TB_HISTORIAL_LOG_PRECIOS
                    (FechaRegistro, TipoCambio, FincaId, FincaNombre, PrecioAnterior, PrecioNuevo, CantidadFincasAfectadas, UsuarioId, UsuarioNombre, Observacion)
                    VALUES
                    (GETDATE(), 'COMPANIA', NULL, @fincaNombre, @precioAnterior, @precioNuevo, 1, @usuarioId, @usuarioNombre, @observacion);";

                await connection.ExecuteAsync(sqlLog, new
                {
                    fincaNombre = compActual.Nombre,
                    precioAnterior,
                    precioNuevo = nuevoPrecioUSD,
                    usuarioId,
                    usuarioNombre = usuarioNombre ?? "Administrador",
                    observacion = string.IsNullOrWhiteSpace(observacion) ? "Ajuste de precio Leche Vaca de compañía ($/L)" : observacion.Trim()
                });

                if (nuevoPrecioBufalaUSD.HasValue && nuevoPrecioBufalaUSD.Value != precioBufalaAnt)
                {
                    await connection.ExecuteAsync(sqlLog, new
                    {
                        fincaNombre = compActual.Nombre,
                        precioAnterior = precioBufalaAnt,
                        precioNuevo = nuevoPrecioBufalaUSD.Value,
                        usuarioId,
                        usuarioNombre = usuarioNombre ?? "Administrador",
                        observacion = "Ajuste de precio Leche Búfala de compañía ($/L)"
                    });
                }

                if (nuevoPrecioAcidaUSD.HasValue && nuevoPrecioAcidaUSD.Value != precioAcidaAnt)
                {
                    await connection.ExecuteAsync(sqlLog, new
                    {
                        fincaNombre = compActual.Nombre,
                        precioAnterior = precioAcidaAnt,
                        precioNuevo = nuevoPrecioAcidaUSD.Value,
                        usuarioId,
                        usuarioNombre = usuarioNombre ?? "Administrador",
                        observacion = "Ajuste de precio Leche Ácida/Mala de compañía ($/L)"
                    });
                }
            }

            return rows > 0;
        }

        public async Task<bool> EliminarCompaniaAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var rows = await connection.ExecuteAsync("UPDATE TB_COMPANIAS SET IsDeleted = 1 WHERE Id = @id", new { id });
            return rows > 0;
        }

        public async Task<IEnumerable<dynamic>> ObtenerAbonosCompaniasAsync(int? companiaId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    a.Id,
                    a.CompaniaId,
                    c.Nombre AS CompaniaNombre,
                    a.Fecha,
                    a.MontoUSD,
                    a.MontoBs,
                    a.TasaBcv,
                    a.ReferenciaBancaria,
                    a.BancoId,
                    b.Nombre AS BancoNombre,
                    a.ControlCompaniaId,
                    a.FechaLecheAbonada,
                    a.LitrosAbonados,
                    a.Observaciones,
                    a.TipoPago,
                    a.CreatedAt
                FROM TB_ABONOS_COMPANIAS a
                INNER JOIN TB_COMPANIAS c ON a.CompaniaId = c.Id
                LEFT JOIN TB_BANCOS b ON a.BancoId = b.Id
                WHERE (@companiaId IS NULL OR a.CompaniaId = @companiaId)
                ORDER BY a.Fecha DESC, a.Id DESC";
            return await connection.QueryAsync(sql, new { companiaId });
        }

        public async Task<int> CrearAbonoCompaniaAsync(GuardarAbonoCompaniaDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                INSERT INTO TB_ABONOS_COMPANIAS (
                    CompaniaId, Fecha, MontoUSD, MontoBs, TasaBcv, 
                    ReferenciaBancaria, BancoId, ControlCompaniaId, 
                    FechaLecheAbonada, LitrosAbonados, Observaciones, 
                    TipoPago, CreatedBy, CreatedAt
                )
                VALUES (
                    @CompaniaId, @Fecha, @MontoUSD, @MontoBs, @TasaBcv,
                    @ReferenciaBancaria, @BancoId, @ControlCompaniaId,
                    @FechaLecheAbonada, @LitrosAbonados, @Observaciones,
                    @TipoPago, @CreatedBy, GETDATE()
                );
                SELECT CAST(SCOPE_IDENTITY() AS INT);";

            return await connection.ExecuteScalarAsync<int>(sql, new
            {
                CompaniaId = dto.CompaniaId,
                Fecha = dto.Fecha ?? DateTime.UtcNow,
                MontoUSD = dto.MontoUSD,
                MontoBs = dto.MontoBs ?? 0m,
                TasaBcv = dto.TasaBcv ?? 1m,
                ReferenciaBancaria = dto.ReferenciaBancaria,
                BancoId = dto.BancoId,
                ControlCompaniaId = dto.ControlCompaniaId,
                FechaLecheAbonada = dto.FechaLecheAbonada,
                LitrosAbonados = dto.LitrosAbonados ?? 0,
                Observaciones = dto.Observaciones,
                TipoPago = dto.TipoPago ?? "TRANSFERENCIA",
                CreatedBy = usuarioId
            });
        }

        public async Task<IEnumerable<dynamic>> ObtenerResumenCobranzasCompaniasAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    c.Id AS CompaniaId,
                    c.Nombre AS CompaniaNombre,
                    c.PrecioLitroUSD,
                    ISNULL(desp.TotalLitrosDespachados, 0) AS TotalLitrosDespachados,
                    ISNULL(desp.TotalFacturadoUSD, 0) AS TotalFacturadoUSD,
                    ISNULL(abo.TotalAbonadoUSD, 0) AS TotalAbonadoUSD,
                    (ISNULL(desp.TotalFacturadoUSD, 0) - ISNULL(abo.TotalAbonadoUSD, 0)) AS SaldoPendienteUSD,
                    abo.UltimoAbonoFecha,
                    desp.UltimoDespachoFecha
                FROM TB_COMPANIAS c
                LEFT JOIN (
                    SELECT 
                        CompaniaId,
                        SUM(ISNULL(LitrosRecibidosCompania, LitrosDespachados)) AS TotalLitrosDespachados,
                        SUM(ISNULL(LitrosRecibidosCompania, LitrosDespachados) * ISNULL(PrecioLitroUSD, 0)) AS TotalFacturadoUSD,
                        MAX(Fecha) AS UltimoDespachoFecha
                    FROM TB_CONTROL_COMPANIAS
                    GROUP BY CompaniaId
                ) desp ON c.Id = desp.CompaniaId
                LEFT JOIN (
                    SELECT 
                        CompaniaId,
                        SUM(MontoUSD) AS TotalAbonadoUSD,
                        MAX(Fecha) AS UltimoAbonoFecha
                    FROM TB_ABONOS_COMPANIAS
                    GROUP BY CompaniaId
                ) abo ON c.Id = abo.CompaniaId
                WHERE c.IsDeleted = 0
                ORDER BY c.Nombre ASC";
            return await connection.QueryAsync(sql);
        }

        // --- BANCOS ---
        public async Task<IEnumerable<BancoDto>> ObtenerBancosAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    b.Id, b.Codigo, b.Nombre, b.Activo,
                    (SELECT COUNT(1) FROM TB_FINCAS f WHERE f.BancoId = b.Id AND f.IsDeleted = 0) AS FincasCount
                FROM TB_BANCOS b
                ORDER BY b.Nombre ASC";
            return await connection.QueryAsync<BancoDto>(sql);
        }

        public async Task<BancoDto?> ObtenerBancoPorIdAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    b.Id, b.Codigo, b.Nombre, b.Activo,
                    (SELECT COUNT(1) FROM TB_FINCAS f WHERE f.BancoId = b.Id AND f.IsDeleted = 0) AS FincasCount
                FROM TB_BANCOS b
                WHERE b.Id = @id";
            return await connection.QueryFirstOrDefaultAsync<BancoDto>(sql, new { id });
        }

        public async Task<int> CrearBancoAsync(CrearBancoDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                INSERT INTO TB_BANCOS (Codigo, Nombre, Activo)
                VALUES (@Codigo, @Nombre, @Activo);
                SELECT CAST(SCOPE_IDENTITY() as int);";
            return await connection.ExecuteScalarAsync<int>(sql, dto);
        }

        public async Task<bool> ActualizarBancoAsync(int id, EditarBancoDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                UPDATE TB_BANCOS
                SET Codigo = COALESCE(@Codigo, Codigo),
                    Nombre = COALESCE(@Nombre, Nombre),
                    Activo = COALESCE(@Activo, Activo)
                WHERE Id = @id";
            var rows = await connection.ExecuteAsync(sql, new {
                id,
                dto.Codigo,
                dto.Nombre,
                dto.Activo
            });
            return rows > 0;
        }

        public async Task<bool> EliminarBancoAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var fincasCount = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM TB_FINCAS WHERE BancoId = @id AND IsDeleted = 0", new { id });
            
            if (fincasCount > 0)
            {
                var rows = await connection.ExecuteAsync("UPDATE TB_BANCOS SET Activo = 0 WHERE Id = @id", new { id });
                return rows > 0;
            }
            else
            {
                var rows = await connection.ExecuteAsync("DELETE FROM TB_BANCOS WHERE Id = @id", new { id });
                return rows > 0;
            }
        }

        // --- PROPIETARIOS Y CONSOLIDACIÓN ---
        private class PropietarioDbRow
        {
            public int Id { get; set; }
            public string? Nombre { get; set; }
            public string? CedulaRIF { get; set; }
            public string? Telefono { get; set; }
            public string? Email { get; set; }
            public int? BancoId { get; set; }
            public string? BancoNombre { get; set; }
            public string? NumeroCuenta { get; set; }
            public string? Observacion { get; set; }
            public string? Estado { get; set; }
            public bool? Activo { get; set; }
            public int TotalFincas { get; set; }
            public string? FincasNombres { get; set; }
        }

        public async Task<IEnumerable<PropietarioDto>> ObtenerPropietariosAsync()
        {
            using var connection = new SqlConnection(_connectionString);

            // Auto-sincronizar propietarios que existan como texto en TB_FINCAS hacia TB_PROPIETARIOS
            try
            {
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_PROPIETARIOS (Nombre, CedulaRIF, BancoId, NumeroCuenta, Estado, Activo, CreatedAt)
                    SELECT 
                        LTRIM(RTRIM(f.Propietario)), 
                        MAX(f.CedulaRIF), 
                        MAX(f.BancoId), 
                        MAX(f.NumeroCuenta), 
                        'ACTIVO', 1, GETDATE()
                    FROM TB_FINCAS f
                    WHERE f.Propietario IS NOT NULL 
                      AND LTRIM(RTRIM(f.Propietario)) <> '' 
                      AND UPPER(LTRIM(RTRIM(f.Propietario))) NOT IN ('N/A', 'SIN ASIGNAR', 'NINGUNO', 'PENDIENTE')
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_PROPIETARIOS p 
                          WHERE UPPER(LTRIM(RTRIM(p.Nombre))) = UPPER(LTRIM(RTRIM(f.Propietario)))
                      )
                    GROUP BY LTRIM(RTRIM(f.Propietario));

                    UPDATE f
                    SET f.PropietarioId = p.Id
                    FROM TB_FINCAS f
                    INNER JOIN TB_PROPIETARIOS p ON UPPER(LTRIM(RTRIM(p.Nombre))) = UPPER(LTRIM(RTRIM(f.Propietario)))
                    WHERE (f.PropietarioId IS NULL OR f.PropietarioId <= 0)
                      AND f.Propietario IS NOT NULL 
                      AND LTRIM(RTRIM(f.Propietario)) <> '' 
                      AND UPPER(LTRIM(RTRIM(f.Propietario))) NOT IN ('N/A', 'SIN ASIGNAR', 'NINGUNO', 'PENDIENTE');");
            }
            catch { /* Tolerante */ }

            var sql = @"
                SELECT 
                    p.Id, p.Nombre, p.CedulaRIF, p.Telefono, p.Email, 
                    p.BancoId, b.Nombre AS BancoNombre, p.NumeroCuenta, 
                    p.Observacion, p.Estado,
                    ISNULL(p.Activo, CASE WHEN p.Estado = 'INACTIVO' THEN 0 ELSE 1 END) AS Activo,
                    COUNT(f.Id) AS TotalFincas,
                    STRING_AGG(f.Nombre, ', ') AS FincasNombres
                FROM TB_PROPIETARIOS p
                LEFT JOIN TB_BANCOS b ON p.BancoId = b.Id
                LEFT JOIN TB_FINCAS f ON f.PropietarioId = p.Id
                WHERE ISNULL(p.IsDeleted, 0) = 0
                GROUP BY p.Id, p.Nombre, p.CedulaRIF, p.Telefono, p.Email, p.BancoId, b.Nombre, p.NumeroCuenta, p.Observacion, p.Estado, p.Activo
                ORDER BY p.Nombre";

            var rows = await connection.QueryAsync<PropietarioDbRow>(sql);

            // Obtener cuentas bancarias asociadas
            var sqlCuentas = @"
                SELECT c.Id, c.PropietarioId, c.BancoId, b.Nombre AS BancoNombre, b.Codigo AS BancoCodigo,
                       c.NumeroCuenta, c.TipoCuenta, c.Titular, c.CedulaRIF, c.Telefono, c.EsPrincipal, c.Activo
                FROM TB_PROPIETARIO_CUENTAS_BANCARIAS c
                INNER JOIN TB_BANCOS b ON c.BancoId = b.Id
                WHERE c.Activo = 1";
            var todasCuentas = (await connection.QueryAsync<PropietarioCuentaBancariaDto>(sqlCuentas)).ToList();

            var list = new List<PropietarioDto>();

            foreach (var r in rows)
            {
                var fn = string.IsNullOrWhiteSpace(r.FincasNombres) 
                    ? new List<string>() 
                    : r.FincasNombres.Split(',').Select(x => x.Trim()).ToList();

                var cuentasProp = todasCuentas.Where(c => c.PropietarioId == r.Id).ToList();
                int? bId = r.BancoId;
                string bNom = r.BancoNombre ?? "";
                string? numCta = r.NumeroCuenta;

                if (cuentasProp.Count > 0)
                {
                    var principal = cuentasProp.FirstOrDefault(c => c.EsPrincipal) ?? cuentasProp.First();
                    bId = principal.BancoId;
                    bNom = principal.BancoNombre ?? bNom;
                    numCta = principal.NumeroCuenta;
                }

                bool esActivo = r.Activo ?? (r.Estado != "INACTIVO");

                list.Add(new PropietarioDto
                {
                    Id = r.Id,
                    Nombre = string.IsNullOrWhiteSpace(r.Nombre) 
                        ? (string.IsNullOrWhiteSpace(r.CedulaRIF) ? $"Ganadero #{r.Id}" : $"Ganadero ({r.CedulaRIF})") 
                        : r.Nombre,
                    CedulaRIF = r.CedulaRIF,
                    Telefono = r.Telefono,
                    Email = r.Email,
                    BancoId = bId,
                    BancoNombre = bNom,
                    NumeroCuenta = numCta,
                    Observacion = r.Observacion,
                    Estado = r.Estado ?? (esActivo ? "ACTIVO" : "INACTIVO"),
                    Activo = esActivo,
                    TotalFincas = r.TotalFincas,
                    FincasNombres = fn,
                    Cuentas = cuentasProp
                });
            }

            return list;
        }

        public async Task<PropietarioDto?> ObtenerPropietarioPorIdAsync(int id)
        {
            var list = await ObtenerPropietariosAsync();
            return list.FirstOrDefault(x => x.Id == id);
        }

        public async Task<int> CrearPropietarioAsync(CrearPropietarioDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                int? bancoPrincipal = dto.BancoId;
                string? cuentaPrincipal = dto.NumeroCuenta;

                if (dto.Cuentas != null && dto.Cuentas.Any(c => c.BancoId > 0))
                {
                    var ctaP = dto.Cuentas.FirstOrDefault(c => c.EsPrincipal && c.BancoId > 0) 
                               ?? dto.Cuentas.First(c => c.BancoId > 0);
                    bancoPrincipal = ctaP.BancoId;
                    cuentaPrincipal = ctaP.NumeroCuenta;
                }

                string estadoFinal = (dto.Activo == false) ? "INACTIVO" : "ACTIVO";
                bool activoFinal = dto.Activo != false;

                var sql = @"
                    INSERT INTO TB_PROPIETARIOS (
                        Nombre, CedulaRIF, Telefono, Email, BancoId, NumeroCuenta, Observacion, Estado, Activo, CreatedAt, CreatedBy
                    ) VALUES (
                        @Nombre, @CedulaRIF, @Telefono, @Email, @bancoPrincipal, @cuentaPrincipal, @Observacion, @estadoFinal, @activoFinal, GETDATE(), @usuarioId
                    );
                    SELECT CAST(SCOPE_IDENTITY() as int);";

                int id = await connection.ExecuteScalarAsync<int>(sql, new {
                    dto.Nombre, dto.CedulaRIF, dto.Telefono, dto.Email, bancoPrincipal, cuentaPrincipal, dto.Observacion, estadoFinal, activoFinal, usuarioId
                }, transaction);

                // Insertar cuentas bancarias asociadas
                if (dto.Cuentas != null && dto.Cuentas.Any(c => c.BancoId > 0))
                {
                    bool yaHayPrincipal = dto.Cuentas.Any(c => c.EsPrincipal && c.BancoId > 0);
                    bool primera = true;
                    foreach (var c in dto.Cuentas.Where(c => c.BancoId > 0))
                    {
                        bool esP = yaHayPrincipal ? c.EsPrincipal : primera;
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_PROPIETARIO_CUENTAS_BANCARIAS 
                            (PropietarioId, BancoId, NumeroCuenta, TipoCuenta, Titular, CedulaRIF, Telefono, EsPrincipal, Activo, CreatedAt)
                            VALUES 
                            (@id, @BancoId, @NumeroCuenta, @TipoCuenta, @Titular, @CedulaRIF, @Telefono, @esP, 1, GETDATE())",
                            new {
                                id,
                                c.BancoId,
                                NumeroCuenta = c.NumeroCuenta ?? "",
                                TipoCuenta = string.IsNullOrWhiteSpace(c.TipoCuenta) ? "CORRIENTE" : c.TipoCuenta,
                                Titular = string.IsNullOrWhiteSpace(c.Titular) ? dto.Nombre : c.Titular,
                                CedulaRIF = string.IsNullOrWhiteSpace(c.CedulaRIF) ? dto.CedulaRIF : c.CedulaRIF,
                                Telefono = c.Telefono ?? dto.Telefono,
                                esP
                            }, transaction);
                        primera = false;
                    }
                }
                else if (bancoPrincipal.HasValue && bancoPrincipal.Value > 0)
                {
                    // Si se pasó solo BancoId y NumeroCuenta pero sin lista de Cuentas, insertar 1 cuenta principal
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_PROPIETARIO_CUENTAS_BANCARIAS 
                        (PropietarioId, BancoId, NumeroCuenta, TipoCuenta, Titular, CedulaRIF, Telefono, EsPrincipal, Activo, CreatedAt)
                        VALUES 
                        (@id, @bancoPrincipal, @cuentaPrincipal, 'CORRIENTE', @Nombre, @CedulaRIF, @Telefono, 1, 1, GETDATE())",
                        new {
                            id,
                            bancoPrincipal,
                            cuentaPrincipal = cuentaPrincipal ?? "",
                            dto.Nombre,
                            dto.CedulaRIF,
                            dto.Telefono
                        }, transaction);
                }

                if (dto.FincaIds != null && dto.FincaIds.Any())
                {
                    var sqlUpdFincas = @"
                        UPDATE TB_FINCAS 
                        SET PropietarioId = @id, 
                            Propietario = @Nombre,
                            CedulaRIF = ISNULL(@CedulaRIF, CedulaRIF),
                            BancoId = @bancoPrincipal,
                            NumeroCuenta = @cuentaPrincipal
                        WHERE Id IN @FincaIds";
                    await connection.ExecuteAsync(sqlUpdFincas, new { id, dto.Nombre, dto.CedulaRIF, bancoPrincipal, cuentaPrincipal, FincaIds = dto.FincaIds }, transaction);
                }

                transaction.Commit();
                return id;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> ActualizarPropietarioAsync(int id, ActualizarPropietarioDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                int? bancoPrincipal = dto.BancoId;
                string? cuentaPrincipal = dto.NumeroCuenta;

                if (dto.Cuentas != null && dto.Cuentas.Any(c => c.BancoId > 0))
                {
                    var ctaP = dto.Cuentas.FirstOrDefault(c => c.EsPrincipal && c.BancoId > 0) 
                               ?? dto.Cuentas.First(c => c.BancoId > 0);
                    bancoPrincipal = ctaP.BancoId;
                    cuentaPrincipal = ctaP.NumeroCuenta;
                }

                string estadoFinal = (dto.Activo == false || dto.Estado == "INACTIVO") ? "INACTIVO" : "ACTIVO";
                bool activoFinal = !(dto.Activo == false || dto.Estado == "INACTIVO");

                var sql = @"
                    UPDATE TB_PROPIETARIOS 
                    SET Nombre = @Nombre,
                        CedulaRIF = @CedulaRIF,
                        Telefono = @Telefono,
                        Email = @Email,
                        BancoId = @bancoPrincipal,
                        NumeroCuenta = @cuentaPrincipal,
                        Observacion = @Observacion,
                        Estado = @estadoFinal,
                        Activo = @activoFinal,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @id";

                int r = await connection.ExecuteAsync(sql, new {
                    id, dto.Nombre, dto.CedulaRIF, dto.Telefono, dto.Email, bancoPrincipal, cuentaPrincipal, dto.Observacion, estadoFinal, activoFinal, usuarioId
                }, transaction);

                // Si no existía por id (ej: ID temporal del frontend), buscar por nombre o insertar
                if (r == 0)
                {
                    var existingId = await connection.QueryFirstOrDefaultAsync<int?>(
                        "SELECT Id FROM TB_PROPIETARIOS WHERE UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@Nombre)))",
                        new { dto.Nombre }, transaction);

                    if (existingId.HasValue && existingId.Value > 0)
                    {
                        id = existingId.Value;
                        await connection.ExecuteAsync(@"
                            UPDATE TB_PROPIETARIOS 
                            SET CedulaRIF = ISNULL(@CedulaRIF, CedulaRIF),
                                Telefono = ISNULL(@Telefono, Telefono),
                                Email = ISNULL(@Email, Email),
                                BancoId = @bancoPrincipal,
                                NumeroCuenta = @cuentaPrincipal,
                                Observacion = @Observacion,
                                Estado = @estadoFinal,
                                Activo = @activoFinal,
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @usuarioId
                            WHERE Id = @id",
                            new { id, dto.CedulaRIF, dto.Telefono, dto.Email, bancoPrincipal, cuentaPrincipal, dto.Observacion, estadoFinal, activoFinal, usuarioId }, transaction);
                        r = 1;
                    }
                    else
                    {
                        id = await connection.ExecuteScalarAsync<int>(@"
                            INSERT INTO TB_PROPIETARIOS (
                                Nombre, CedulaRIF, Telefono, Email, BancoId, NumeroCuenta, Observacion, Estado, Activo, CreatedAt, CreatedBy
                            ) VALUES (
                                @Nombre, @CedulaRIF, @Telefono, @Email, @bancoPrincipal, @cuentaPrincipal, @Observacion, @estadoFinal, @activoFinal, GETDATE(), @usuarioId
                            );
                            SELECT CAST(SCOPE_IDENTITY() as int);",
                            new { dto.Nombre, dto.CedulaRIF, dto.Telefono, dto.Email, bancoPrincipal, cuentaPrincipal, dto.Observacion, estadoFinal, activoFinal, usuarioId }, transaction);
                        r = 1;
                    }
                }

                if (dto.Cuentas != null)
                {
                    // Reemplazar cuentas bancarias de este propietario
                    await connection.ExecuteAsync("DELETE FROM TB_PROPIETARIO_CUENTAS_BANCARIAS WHERE PropietarioId = @id", new { id }, transaction);

                    bool yaHayPrincipal = dto.Cuentas.Any(c => c.EsPrincipal && c.BancoId > 0);
                    bool primera = true;
                    foreach (var c in dto.Cuentas.Where(c => c.BancoId > 0))
                    {
                        bool esP = yaHayPrincipal ? c.EsPrincipal : primera;
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_PROPIETARIO_CUENTAS_BANCARIAS 
                            (PropietarioId, BancoId, NumeroCuenta, TipoCuenta, Titular, CedulaRIF, Telefono, EsPrincipal, Activo, CreatedAt)
                            VALUES 
                            (@id, @BancoId, @NumeroCuenta, @TipoCuenta, @Titular, @CedulaRIF, @Telefono, @esP, 1, GETDATE())",
                            new {
                                id,
                                c.BancoId,
                                NumeroCuenta = c.NumeroCuenta ?? "",
                                TipoCuenta = string.IsNullOrWhiteSpace(c.TipoCuenta) ? "CORRIENTE" : c.TipoCuenta,
                                Titular = string.IsNullOrWhiteSpace(c.Titular) ? dto.Nombre : c.Titular,
                                CedulaRIF = string.IsNullOrWhiteSpace(c.CedulaRIF) ? dto.CedulaRIF : c.CedulaRIF,
                                Telefono = c.Telefono ?? dto.Telefono,
                                esP
                            }, transaction);
                        primera = false;
                    }
                }

                if (r > 0)
                {
                    if (dto.FincaIds != null)
                    {
                        await connection.ExecuteAsync("UPDATE TB_FINCAS SET PropietarioId = NULL WHERE PropietarioId = @id", new { id }, transaction);

                        if (dto.FincaIds.Any())
                        {
                            await connection.ExecuteAsync(@"
                                UPDATE TB_FINCAS 
                                SET PropietarioId = @id, 
                                    Propietario = @Nombre,
                                    CedulaRIF = ISNULL(@CedulaRIF, CedulaRIF),
                                    BancoId = @bancoPrincipal,
                                    NumeroCuenta = @cuentaPrincipal
                                WHERE Id IN @FincaIds", 
                                new { id, dto.Nombre, dto.CedulaRIF, bancoPrincipal, cuentaPrincipal, FincaIds = dto.FincaIds }, transaction);
                        }
                    }
                    else
                    {
                        // Sincronizar automáticamente datos bancarios y nombre a todas las fincas vinculadas a este propietario
                        await connection.ExecuteAsync(@"
                            UPDATE TB_FINCAS 
                            SET Propietario = @Nombre,
                                CedulaRIF = ISNULL(@CedulaRIF, CedulaRIF),
                                BancoId = @bancoPrincipal,
                                NumeroCuenta = @cuentaPrincipal
                            WHERE PropietarioId = @id", 
                            new { id, dto.Nombre, dto.CedulaRIF, bancoPrincipal, cuentaPrincipal }, transaction);
                    }
                }

                transaction.Commit();
                return r > 0;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> EliminarPropietarioAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                // Desvincular fincas de forma segura (¡SIN ELIMINAR NINGUNA FINCA!)
                await connection.ExecuteAsync("UPDATE TB_FINCAS SET PropietarioId = NULL WHERE PropietarioId = @id", new { id }, transaction);
                int r = await connection.ExecuteAsync("DELETE FROM TB_PROPIETARIOS WHERE Id = @id", new { id }, transaction);

                transaction.Commit();
                return r > 0;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> AsignarFincasPropietarioAsync(AsignarFincasPropietarioDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var prop = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT Id, Nombre, BancoId, NumeroCuenta, CedulaRIF FROM TB_PROPIETARIOS WHERE Id = @PropietarioId", new { dto.PropietarioId }, transaction);
                
                int finalPropId = dto.PropietarioId;
                string nombreProp = "";
                int? bancoIdProp = null;
                string numCuentaProp = "";
                string rifProp = "";

                if (prop != null)
                {
                    finalPropId = (int)prop.Id;
                    nombreProp = (string)prop.Nombre;
                    bancoIdProp = (int?)prop.BancoId;
                    numCuentaProp = (string)prop.NumeroCuenta;
                    rifProp = (string)prop.CedulaRIF;
                }
                else
                {
                    // Fallback resiliente: Si el Id no existe directamente en TB_PROPIETARIOS (ej. id sintético del frontend)
                    if (!string.IsNullOrWhiteSpace(dto.PropietarioNombre))
                    {
                        nombreProp = dto.PropietarioNombre.Trim();
                        rifProp = dto.CedulaRIF ?? "";
                        bancoIdProp = dto.BancoId;
                        numCuentaProp = dto.NumeroCuenta ?? "";
                    }
                    else if (dto.FincaIds != null && dto.FincaIds.Any())
                    {
                        var infoFinca = await connection.QueryFirstOrDefaultAsync<dynamic>(
                            "SELECT TOP 1 Propietario, CedulaRIF, BancoId, NumeroCuenta FROM TB_FINCAS WHERE Id IN @FincaIds AND Propietario IS NOT NULL AND LTRIM(RTRIM(Propietario)) <> ''",
                            new { FincaIds = dto.FincaIds }, transaction);

                        if (infoFinca != null && !string.IsNullOrWhiteSpace((string)infoFinca.Propietario))
                        {
                            nombreProp = ((string)infoFinca.Propietario).Trim();
                            rifProp = (string)infoFinca.CedulaRIF ?? "";
                            bancoIdProp = (int?)infoFinca.BancoId;
                            numCuentaProp = (string)infoFinca.NumeroCuenta ?? "";
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(nombreProp))
                    {
                        // Verificar si ya existe un propietario con este nombre
                        var propExistente = await connection.QueryFirstOrDefaultAsync<dynamic>(
                            "SELECT Id, Nombre, BancoId, NumeroCuenta, CedulaRIF FROM TB_PROPIETARIOS WHERE UPPER(LTRIM(RTRIM(Nombre))) = UPPER(@nombreProp)",
                            new { nombreProp }, transaction);

                        if (propExistente != null)
                        {
                            finalPropId = (int)propExistente.Id;
                            nombreProp = (string)propExistente.Nombre;
                            bancoIdProp = (int?)propExistente.BancoId ?? bancoIdProp;
                            numCuentaProp = (string)propExistente.NumeroCuenta ?? numCuentaProp;
                            rifProp = (string)propExistente.CedulaRIF ?? rifProp;
                        }
                        else
                        {
                            finalPropId = await connection.ExecuteScalarAsync<int>(@"
                                INSERT INTO TB_PROPIETARIOS (Nombre, CedulaRIF, BancoId, NumeroCuenta, Estado, Activo, CreatedAt)
                                VALUES (@nombreProp, @rifProp, @bancoIdProp, @numCuentaProp, 'ACTIVO', 1, GETDATE());
                                SELECT CAST(SCOPE_IDENTITY() as int);",
                                new { nombreProp, rifProp, bancoIdProp, numCuentaProp }, transaction);
                        }
                    }

                    if (finalPropId <= 0 || string.IsNullOrWhiteSpace(nombreProp))
                    {
                        return false;
                    }
                }

                if (dto.FincaIds != null && dto.FincaIds.Any())
                {
                    await connection.ExecuteAsync(@"
                        UPDATE TB_FINCAS 
                        SET PropietarioId = @finalPropId, 
                            Propietario = @nombreProp,
                            CedulaRIF = ISNULL(@rifProp, CedulaRIF),
                            BancoId = @bancoIdProp,
                            NumeroCuenta = @numCuentaProp
                        WHERE Id IN @FincaIds", 
                        new { finalPropId, nombreProp, rifProp, bancoIdProp, numCuentaProp, FincaIds = dto.FincaIds }, transaction);
                }

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<IEnumerable<PreLiquidacionConsolidadaDto>> ObtenerPreLiquidacionConsolidadaPropietariosAsync(int? cicloId = null)
        {
            var fincasPreliq = (await ObtenerPreLiquidacionSemanaAsync(cicloId)).ToList();
            var consolidados = new List<PreLiquidacionConsolidadaDto>();

            var grupos = fincasPreliq.GroupBy(f => (f.PropietarioId.HasValue && f.PropietarioId.Value > 0) ? f.PropietarioId.Value : f.Propietario.Trim().ToUpper().GetHashCode()).ToList();

            foreach (var g in grupos)
            {
                var primerFinca = g.First();
                int propId = primerFinca.PropietarioId ?? 0;
                string propNombre = string.IsNullOrWhiteSpace(primerFinca.Propietario) ? primerFinca.FincaNombre : primerFinca.Propietario;
                string cedulaRif = primerFinca.CedulaRIF ?? "";
                int? bancoId = primerFinca.BancoId;
                string bancoNombre = primerFinca.BancoNombre;
                string numeroCuenta = primerFinca.NumeroCuenta;

                int totalLitros = g.Sum(x => x.TotalLitros);
                int totalBuenos = g.Sum(x => x.TotalLitrosBuenos);
                int totalAcidos = g.Sum(x => x.TotalLitrosAcidos);
                decimal totalUSD = g.Sum(x => x.TotalUSD);
                decimal totalBrutoBs = g.Sum(x => x.TotalBrutoBs);
                decimal totalAdelantosBs = g.Sum(x => x.TotalAdelantosBs);
                decimal otrasDeduccionesBs = g.Sum(x => x.OtrasDeduccionesBs);

                decimal totalNetoBs = totalBrutoBs - totalAdelantosBs - otrasDeduccionesBs;
                bool todosPagados = g.All(x => x.EsPagado);
                string nombresFincas = string.Join(", ", g.Select(x => x.FincaNombre));

                consolidados.Add(new PreLiquidacionConsolidadaDto
                {
                    PropietarioId = propId,
                    PropietarioNombre = propNombre,
                    CedulaRIF = cedulaRif,
                    BancoId = bancoId,
                    BancoNombre = bancoNombre,
                    NumeroCuenta = numeroCuenta,
                    TotalFincas = g.Count(),
                    NombresFincas = nombresFincas,
                    TotalLitros = totalLitros,
                    TotalLitrosBuenos = totalBuenos,
                    TotalLitrosAcidos = totalAcidos,
                    TotalUSD = totalUSD,
                    TotalBrutoBs = totalBrutoBs,
                    TotalAdelantosBs = totalAdelantosBs,
                    OtrasDeduccionesBs = otrasDeduccionesBs,
                    TotalNetoBs = totalNetoBs,
                    TodosPagados = todosPagados,
                    Fincas = g.ToList()
                });
            }

            return consolidados.OrderBy(c => c.PropietarioNombre);
        }

        // --- CHOFERES, CICLO ACTIVO, MERMAS, PRELIQUIDACION ---
        public async Task<IEnumerable<ChoferDto>> ObtenerChoferesAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    u.Id, 
                    u.Username, 
                    u.NombreCompleto, 
                    u.Cedula, 
                    u.Telefono,
                    CAST(NULL AS VARCHAR(100)) AS Email,
                    ISNULL(c.Placa, u.VehiculoPlaca) AS VehiculoPlaca,
                    c.Id AS CamionId,
                    c.Placa AS CamionPlaca,
                    c.MarcaModelo AS CamionModelo,
                    c.CapacidadLitros,
                    u.TarifaPorLitro,
                    u.SueldoBase,
                    u.FrecuenciaPago,
                    u.TipoPago,
                    u.BancoNombre,
                    u.NumeroCuenta,
                    u.CedulaPagoMovil,
                    u.TelefonoPagoMovil,
                    u.Activo,
                    u.CreatedAt
                FROM TB_USUARIOS u
                OUTER APPLY (
                    SELECT TOP 1 c2.Id, c2.Placa, c2.MarcaModelo, c2.CapacidadLitros
                    FROM TB_CAMIONES c2
                    WHERE c2.UsuarioId = u.Id AND c2.IsDeleted = 0
                    ORDER BY c2.Activo DESC, c2.Id DESC
                ) c
                WHERE (UPPER(u.Rol) = 'CHOFER' OR UPPER(u.Rol) = 'CONDUCTOR' OR u.RolId = 4)
                  AND u.IsDeleted = 0
                  AND u.Activo = 1
                ORDER BY u.NombreCompleto ASC";
            return await connection.QueryAsync<ChoferDto>(sql);
        }

        public async Task<CicloOperativo?> ObtenerCicloActivoAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                "SELECT TOP 1 * FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC");
        }

        public async Task<IEnumerable<BalanceMermaDto>> ObtenerMermasHoyAsync(DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, int? choferId = null)
        {
            DateTime inicio = (fechaInicio ?? fecha ?? DateTime.Today).Date;
            DateTime fin = (fechaFin ?? fecha ?? DateTime.Today).Date;

            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    CASE WHEN @inicio = @fin THEN CONVERT(varchar(10), @inicio, 120) ELSE CONVERT(varchar(10), @inicio, 120) + ' al ' + CONVERT(varchar(10), @fin, 120) END AS Fecha,
                    u.Id AS ConductorId,
                    ISNULL(u.NombreCompleto, u.Username) AS NombreConductor,
                    ISNULL(cr_agg.TotalFincas, ISNULL(fallback_fincas.TotalFincas, 0)) AS LitrosRecolectados,
                    ISNULL(cr_agg.TotalEntregados, ISNULL(fallback_fincas.TotalFincas, 0)) AS LitrosEntregados,
                    (ISNULL(cr_agg.TotalFincas, ISNULL(fallback_fincas.TotalFincas, 0)) - ISNULL(cr_agg.TotalEntregados, ISNULL(fallback_fincas.TotalFincas, 0))) AS MermaLitros,
                    CASE 
                        WHEN ISNULL(cr_agg.TotalFincas, ISNULL(fallback_fincas.TotalFincas, 0)) > 0 
                        THEN ROUND(((ISNULL(cr_agg.TotalFincas, ISNULL(fallback_fincas.TotalFincas, 0)) - ISNULL(cr_agg.TotalEntregados, ISNULL(fallback_fincas.TotalFincas, 0))) * 100.0) / ISNULL(cr_agg.TotalFincas, ISNULL(fallback_fincas.TotalFincas, 0)), 2)
                        ELSE 0 
                    END AS PorcentajeMerma
                FROM TB_USUARIOS u
                LEFT JOIN (
                    SELECT 
                        cr.UsuarioId,
                        SUM(cr.TotalLitrosFinca) AS TotalFincas,
                        SUM(CASE 
                            WHEN cr.TipoDestino = 'COMPANIA_DIRECTA' THEN ISNULL(cr.LitrosEntregadosCompania, cr.TotalLitrosFinca)
                            ELSE ISNULL(cr.TotalLitrosReceptoria, cr.TotalLitrosFinca)
                        END) AS TotalEntregados
                    FROM TB_CONTROL_RUTAS cr
                    WHERE cr.Fecha >= @inicio AND cr.Fecha <= @fin
                    GROUP BY cr.UsuarioId
                ) cr_agg ON u.Id = cr_agg.UsuarioId
                LEFT JOIN (
                    SELECT r.UsuarioId, SUM(r.Litros) AS TotalFincas
                    FROM TB_RUTAS_RECOLECCION r
                    INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                    WHERE r.Fecha >= @inicio AND r.Fecha <= @fin
                      AND f.Nombre NOT LIKE '%CHOFER%' AND f.Nombre NOT LIKE '%DESCUENTO%'
                    GROUP BY r.UsuarioId
                ) fallback_fincas ON u.Id = fallback_fincas.UsuarioId AND cr_agg.TotalFincas IS NULL
                WHERE u.Rol = 'CHOFER' AND u.Activo = 1
                  AND (ISNULL(cr_agg.TotalFincas, 0) > 0 OR ISNULL(fallback_fincas.TotalFincas, 0) > 0)
                  AND (@choferId IS NULL OR u.Id = @choferId)
                ORDER BY u.NombreCompleto ASC";

            var list = (await connection.QueryAsync<BalanceMermaDto>(sql, new { inicio, fin, choferId })).ToList();
            if (list.Any()) return list;

            return new List<BalanceMermaDto>();
        }

        public async Task<IEnumerable<PreLiquidacionDto>> ObtenerPreLiquidacionSemanaAsync(
            int? cicloId = null, string? cicloIds = null, DateTime? fechaInicio = null, DateTime? fechaFin = null)
        {
            using var connection = new SqlConnection(_connectionString);
            decimal tasaActual = await connection.ExecuteScalarAsync<decimal?>("SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC") ?? 1.0m;

            var listaCiclos = new List<int>();
            if (!string.IsNullOrWhiteSpace(cicloIds))
            {
                listaCiclos = cicloIds.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                      .Select(s => int.TryParse(s.Trim(), out var n) ? n : 0)
                                      .Where(n => n > 0)
                                      .Distinct()
                                      .ToList();
            }
            else if (cicloId.HasValue && cicloId.Value > 0)
            {
                listaCiclos.Add(cicloId.Value);
            }

            if (!listaCiclos.Any() && fechaInicio.HasValue && fechaFin.HasValue)
            {
                var matchingCiclos = (await connection.QueryAsync<int>(
                    "SELECT Id FROM TB_CICLOS_OPERATIVOS WHERE FechaInicio <= @fechaFin AND FechaFin >= @fechaInicio",
                    new { fechaInicio = fechaInicio.Value, fechaFin = fechaFin.Value })).ToList();
                listaCiclos.AddRange(matchingCiclos);
            }

            if (!listaCiclos.Any())
            {
                var activeId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC");
                if (!activeId.HasValue || activeId.Value <= 0)
                {
                    activeId = await connection.ExecuteScalarAsync<int?>("SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS ORDER BY FechaInicio DESC");
                }
                if (activeId.HasValue && activeId.Value > 0)
                {
                    listaCiclos.Add(activeId.Value);
                }
            }

            bool usaFiltroCiclos = listaCiclos.Any();
            string semanasTexto = usaFiltroCiclos 
                ? (listaCiclos.Count == 1 ? $"Semana {listaCiclos[0]}" : $"Semanas {string.Join(" + ", listaCiclos)}") 
                : "Todas las Semanas";

            if (listaCiclos.Any())
            {
                var tasaMaxRuta = await connection.ExecuteScalarAsync<decimal?>(
                    @"SELECT MAX(r.TasaDolarBsAplicada) 
                      FROM TB_RUTAS_RECOLECCION r 
                      WHERE r.CicloId IN @listaCiclos 
                        AND r.TasaDolarBsAplicada > 0
                        AND r.FincaId NOT IN (
                            SELECT p.FincaId 
                            FROM TB_PAGOS_LIQUIDACION p 
                            WHERE p.CicloId = r.CicloId AND p.EstadoPago = 'PAGADO'
                        )",
                    new { listaCiclos });
                if (tasaMaxRuta.HasValue && tasaMaxRuta.Value > 0 && tasaMaxRuta.Value > tasaActual)
                {
                    tasaActual = tasaMaxRuta.Value;
                }

                // Sincronizar automáticamente precios de recolección de rutas de los ciclos seleccionados
                var sqlSyncPrecios = @"
                    UPDATE f
                    SET f.PrecioBufalaLitroUSD = 1.02
                    FROM TB_FINCAS f
                    WHERE (f.Nombre LIKE '%TARITA%' OR f.Nombre LIKE '%BUFAL%') AND (f.PrecioBufalaLitroUSD IS NULL OR f.PrecioBufalaLitroUSD = 0);

                    UPDATE r
                    SET r.TipoLeche = 'BUFALA',
                        r.PrecioLitroUSDAplicado = CASE WHEN ISNULL(f.PrecioBufalaLitroUSD, 0) > 0 THEN f.PrecioBufalaLitroUSD ELSE 1.02 END
                    FROM TB_RUTAS_RECOLECCION r
                    INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                    WHERE r.CicloId IN @listaCiclos
                      AND (f.Nombre LIKE '%TARITA%' OR (ISNULL(f.TieneDosTiposLeche, 0) = 0 AND ISNULL(f.PrecioBufalaLitroUSD, 0) > 0 AND ISNULL(f.PrecioLitroUSD, 0) = 0))
                      AND (r.TipoLeche <> 'BUFALA' OR r.TipoLeche IS NULL OR r.PrecioLitroUSDAplicado IS NULL OR r.PrecioLitroUSDAplicado <= 0);

                    UPDATE r
                    SET r.PrecioLitroUSDAplicado = CASE WHEN ISNULL(f.PrecioBufalaLitroUSD, 0) > 0 THEN f.PrecioBufalaLitroUSD ELSE 1.02 END
                    FROM TB_RUTAS_RECOLECCION r
                    INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                    WHERE r.CicloId IN @listaCiclos
                      AND r.TipoLeche = 'BUFALA'
                      AND (r.EsAcida = 0 OR r.EsAcida IS NULL)
                      AND (r.PrecioLitroUSDAplicado IS NULL OR r.PrecioLitroUSDAplicado <= 0 OR (ISNULL(f.PrecioBufalaLitroUSD, 0) > 0 AND r.PrecioLitroUSDAplicado <> f.PrecioBufalaLitroUSD));

                    UPDATE r
                    SET r.PrecioLitroUSDAplicado = f.PrecioLitroUSD
                    FROM TB_RUTAS_RECOLECCION r
                    INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                    WHERE r.CicloId IN @listaCiclos
                      AND ISNULL(f.PrecioLitroUSD, 0) > 0
                      AND (r.TipoLeche = 'VACA' OR r.TipoLeche IS NULL)
                      AND (r.EsAcida = 0 OR r.EsAcida IS NULL)
                      AND (r.PrecioLitroUSDAplicado IS NULL OR r.PrecioLitroUSDAplicado <> f.PrecioLitroUSD);";
                try { await connection.ExecuteAsync(sqlSyncPrecios, new { listaCiclos }, commandTimeout: 60); } catch { }
            }

            var sql = @"
                SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
                WITH CiclosPagadosPorFinca AS (
                    SELECT 
                        p.FincaId,
                        p.CicloId,
                        p.Id AS PagoId,
                        p.FechaPago,
                        p.TasaBcv,
                        p.TotalBrutoBs,
                        p.TotalAdelantosBs,
                        p.OtrasDeduccionesBs,
                        p.TotalNetoBs,
                        p.TotalLitros,
                        p.TotalLitrosBuenos,
                        p.TotalLitrosAcidos,
                        p.TotalUSD
                    FROM TB_PAGOS_LIQUIDACION p
                    WHERE (@usaFiltroCiclos = 0 OR p.CicloId IN @listaCiclos)
                      AND p.EstadoPago = 'PAGADO'
                ),
                FincasCiclosPendientes AS (
                    SELECT DISTINCT 
                        r.FincaId,
                        ISNULL(r.CicloLiquidacionId, r.CicloId) AS CicloId
                    FROM TB_RUTAS_RECOLECCION r
                    WHERE (@usaFiltroCiclos = 0 OR ISNULL(r.CicloLiquidacionId, r.CicloId) IN @listaCiclos)
                      AND r.Litros > 0
                      AND NOT EXISTS (
                          SELECT 1 
                          FROM CiclosPagadosPorFinca cp 
                          WHERE cp.FincaId = r.FincaId AND cp.CicloId = ISNULL(r.CicloLiquidacionId, r.CicloId)
                      )
                ),
                CicloActualActivo AS (
                    SELECT TOP 1 Id, FechaInicio 
                    FROM TB_CICLOS_OPERATIVOS 
                    WHERE Estado = 'ABIERTO' 
                    ORDER BY FechaInicio DESC, Id DESC
                ),
                CiclosCerradosAnterioresPendientes AS (
                    SELECT DISTINCT 
                        r.FincaId,
                        ISNULL(r.CicloLiquidacionId, r.CicloId) AS CicloId
                    FROM TB_RUTAS_RECOLECCION r
                    INNER JOIN TB_CICLOS_OPERATIVOS c ON ISNULL(r.CicloLiquidacionId, r.CicloId) = c.Id
                    LEFT JOIN CicloActualActivo ca ON 1=1
                    WHERE (@usaFiltroCiclos = 0 OR ISNULL(r.CicloLiquidacionId, r.CicloId) IN @listaCiclos)
                      AND r.Litros > 0
                      AND c.Estado = 'CERRADO'
                      AND (
                          (ca.Id IS NOT NULL AND (c.Id < ca.Id OR c.FechaFin < ca.FechaInicio))
                          OR (ca.Id IS NULL AND c.FechaFin < GETDATE())
                      )
                      AND NOT EXISTS (
                          SELECT 1 
                          FROM TB_PAGOS_LIQUIDACION p 
                          WHERE p.FincaId = r.FincaId 
                            AND p.CicloId = ISNULL(r.CicloLiquidacionId, r.CicloId)
                            AND p.EstadoPago = 'PAGADO'
                      )
                ),
                SemanasPendientesCTE AS (
                    SELECT 
                        cap.FincaId,
                        STRING_AGG(CONCAT('Sem. ', cap.CicloId), ', ') WITHIN GROUP (ORDER BY cap.CicloId ASC) AS SemanasPendientes,
                        COUNT(cap.CicloId) AS CantidadSemanasPendientes
                    FROM CiclosCerradosAnterioresPendientes cap
                    GROUP BY cap.FincaId
                ),
                SemanasPagadasCTE AS (
                    SELECT 
                        cp.FincaId,
                        STRING_AGG(CONCAT('Sem. ', cp.CicloId), ', ') WITHIN GROUP (ORDER BY cp.CicloId ASC) AS SemanasPagadas,
                        COUNT(cp.CicloId) AS CantidadSemanasPagadas
                    FROM (SELECT DISTINCT FincaId, CicloId FROM CiclosPagadosPorFinca) cp
                    GROUP BY cp.FincaId
                ),
                FincasPagadasSummary AS (
                    SELECT 
                        cp.FincaId,
                        MAX(cp.PagoId) AS PagoId,
                        MAX(cp.FechaPago) AS FechaPago,
                        MAX(cp.TasaBcv) AS PaidTasaBcv,
                        SUM(cp.TotalBrutoBs) AS PaidTotalBrutoBs,
                        SUM(cp.TotalAdelantosBs) AS PaidTotalAdelantosBs,
                        SUM(cp.OtrasDeduccionesBs) AS PaidOtrasDeduccionesBs,
                        SUM(cp.TotalNetoBs) AS PaidTotalNetoBs,
                        SUM(cp.TotalLitros) AS PaidTotalLitros,
                        SUM(cp.TotalLitrosBuenos) AS PaidTotalLitrosBuenos,
                        SUM(cp.TotalLitrosAcidos) AS PaidTotalLitrosAcidos,
                        SUM(cp.TotalUSD) AS PaidTotalUSD
                    FROM CiclosPagadosPorFinca cp
                    WHERE NOT EXISTS (
                        SELECT 1 FROM FincasCiclosPendientes fcp WHERE fcp.FincaId = cp.FincaId
                    )
                    GROUP BY cp.FincaId
                ),
                DeduccionesCTE AS (
                    SELECT 
                        d.FincaId,
                        SUM(d.MontoBs) AS OtrasDeduccionesBs,
                        STRING_AGG(d.Concepto, ', ') AS ConceptoDeducciones
                    FROM TB_DEDUCCIONES_FINCA_CICLO d
                    INNER JOIN FincasCiclosPendientes fcp ON d.FincaId = fcp.FincaId AND d.CicloId = fcp.CicloId
                    GROUP BY d.FincaId
                ),
                AdelantosCTE AS (
                    SELECT 
                        a.EntidadId AS FincaId,
                        SUM(CASE WHEN c.Estado = 'COBRADO' AND ISNULL(c.MontoCobradoBs, 0) > 0 THEN c.MontoCobradoBs ELSE (c.MontoCuotaUSD * @tasaActual) END) AS TotalAdelantosBs,
                        SUM(c.MontoCuotaUSD) AS TotalAdelantosUSD,
                        MAX(CONCAT('Cuota ', c.NumeroCuota, ' de ', a.NumeroCuotas)) AS CuotasDetalle
                    FROM TB_ADELANTOS a
                    INNER JOIN TB_ADELANTOS_CUOTAS c ON a.Id = c.AdelantoId
                    INNER JOIN (SELECT DISTINCT FincaId FROM FincasCiclosPendientes) pend ON a.EntidadId = pend.FincaId
                    WHERE a.TipoEntidad = 'FINCA'
                      AND (
                          c.SemanaOperativaId IN (SELECT fcp.CicloId FROM FincasCiclosPendientes fcp WHERE fcp.FincaId = a.EntidadId)
                          OR (c.SemanaOperativaId IS NULL AND c.Estado = 'PENDIENTE' AND a.Estado = 'ACTIVO')
                          OR (@minCicloId > 0 AND c.SemanaOperativaId < @minCicloId AND c.Estado = 'PENDIENTE' AND a.Estado = 'ACTIVO')
                      )
                      AND c.Estado <> 'POSPUESTO'
                    GROUP BY a.EntidadId
                )
                SELECT 
                    f.Id AS FincaId,
                    f.Nombre AS FincaNombre,
                    ISNULL(p.Nombre, ISNULL(f.Propietario, 'N/A')) AS Propietario,
                    ISNULL(p.CedulaRIF, ISNULL(f.CedulaRIF, 'N/A')) AS CedulaRIF,
                    ISNULL(p.BancoId, f.BancoId) AS BancoId,
                    ISNULL(bp.Nombre, ISNULL(b.Nombre, 'Sin Banco')) AS BancoNombre,
                    ISNULL(p.NumeroCuenta, ISNULL(f.NumeroCuenta, 'N/A')) AS NumeroCuenta,
                    p.BancoId AS PropietarioBancoId,
                    ISNULL(bp.Nombre, 'Sin Banco') AS PropietarioBancoNombre,
                    ISNULL(p.NumeroCuenta, 'N/A') AS PropietarioNumeroCuenta,
                    ISNULL(f.PrecioLitroUSD, 0) AS PrecioLitroUSD,
                    ISNULL(f.PrecioBufalaLitroUSD, CASE WHEN f.Nombre LIKE '%TARITA%' THEN 1.02 ELSE 0 END) AS PrecioBufalaLitroUSD,
                    ISNULL(f.TieneDosTiposLeche, 0) AS TieneDosTiposLeche,
                    ISNULL(f.PrecioLitroAcidaUSD, 0) AS PrecioLitroAcidaUSD,
                    ISNULL(ded.OtrasDeduccionesBs, 0) AS OtrasDeduccionesBs,
                    ISNULL(ded.ConceptoDeducciones, '') AS ConceptoDeducciones,

                    ISNULL(sp.SemanasPendientes, '') AS SemanasPendientes,
                    ISNULL(sp.CantidadSemanasPendientes, 0) AS CantidadSemanasPendientes,
                    ISNULL(spg.SemanasPagadas, '') AS SemanasPagadas,
                    ISNULL(spg.CantidadSemanasPagadas, 0) AS CantidadSemanasPagadas,

                    CASE 
                        WHEN pag.FincaId IS NOT NULL THEN ISNULL(pag.PaidTotalLitros, 0)
                        ELSE ISNULL(SUM(r.Litros), 0)
                    END AS TotalLitros,

                    CASE 
                        WHEN pag.FincaId IS NOT NULL THEN ISNULL(pag.PaidTotalLitrosBuenos, 0)
                        ELSE ISNULL(SUM(CASE WHEN r.EsAcida = 0 THEN r.Litros ELSE 0 END), 0)
                    END AS TotalLitrosBuenos,

                    ISNULL(SUM(CASE WHEN (r.TipoLeche = 'VACA' OR (r.TipoLeche IS NULL AND f.Nombre NOT LIKE '%TARITA%')) AND r.EsAcida = 0 AND f.Nombre NOT LIKE '%TARITA%' THEN r.Litros ELSE 0 END), 0) AS TotalLitrosVaca,
                    ISNULL(SUM(CASE WHEN (r.TipoLeche = 'BUFALA' OR f.Nombre LIKE '%TARITA%') AND r.EsAcida = 0 THEN r.Litros ELSE 0 END), 0) AS TotalLitrosBufala,

                    CASE 
                        WHEN pag.FincaId IS NOT NULL THEN ISNULL(pag.PaidTotalLitrosAcidos, 0)
                        ELSE ISNULL(SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END), 0)
                    END AS TotalLitrosAcidos,

                    ISNULL(MAX(CASE WHEN (r.TipoLeche = 'BUFALA' OR f.Nombre LIKE '%TARITA%') AND r.PrecioLitroUSDAplicado > 0 THEN r.PrecioLitroUSDAplicado WHEN ISNULL(f.PrecioBufalaLitroUSD, 0) > 0 THEN f.PrecioBufalaLitroUSD ELSE 1.02 END), 1.02) AS PrecioLitroBufalaUSD,

                    CASE 
                        WHEN pag.FincaId IS NOT NULL THEN ISNULL(pag.PaidTotalUSD, 0)
                        ELSE ISNULL(SUM(r.Litros * CASE 
                            WHEN r.EsAcida = 1 THEN CASE WHEN ISNULL(f.PrecioLitroAcidaUSD, 0) > 0 THEN f.PrecioLitroAcidaUSD WHEN ISNULL(r.PrecioLitroUSDAplicado, 0) > 0 THEN r.PrecioLitroUSDAplicado ELSE 0.42 END
                            WHEN r.TipoLeche = 'BUFALA' OR f.Nombre LIKE '%TARITA%' THEN CASE WHEN ISNULL(r.PrecioLitroUSDAplicado, 0) > 0 THEN r.PrecioLitroUSDAplicado WHEN ISNULL(f.PrecioBufalaLitroUSD, 0) > 0 THEN f.PrecioBufalaLitroUSD ELSE 1.02 END
                            ELSE CASE WHEN ISNULL(f.PrecioLitroUSD, 0) > 0 THEN f.PrecioLitroUSD WHEN ISNULL(r.PrecioLitroUSDAplicado, 0) > 0 THEN r.PrecioLitroUSDAplicado ELSE 0.84 END
                        END), 0)
                    END AS TotalUSD,

                    ISNULL(ad.TotalAdelantosBs, 0) AS TotalAdelantosBs,
                    ISNULL(ad.TotalAdelantosUSD, 0) AS TotalAdelantosUSD,
                    ISNULL(ad.CuotasDetalle, '') AS CuotasDetalle,
                    f.PropietarioId AS PropietarioId,

                    CAST(CASE WHEN pag.FincaId IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS EsPagado,
                    ISNULL(pag.PagoId, 0) AS PagoId,
                    pag.FechaPago AS FechaPago,
                    pag.PaidTasaBcv AS PaidTasaBcv,
                    CASE 
                        WHEN pag.FincaId IS NOT NULL THEN pag.PaidTasaBcv 
                        ELSE @tasaActual 
                    END AS TasaBcv,
                    pag.PaidTotalBrutoBs AS PaidTotalBrutoBs,
                    pag.PaidTotalAdelantosBs AS PaidTotalAdelantosBs,
                    pag.PaidOtrasDeduccionesBs AS PaidOtrasDeduccionesBs,
                    pag.PaidTotalNetoBs AS PaidTotalNetoBs
                FROM TB_FINCAS f
                LEFT JOIN TB_PROPIETARIOS p ON f.PropietarioId = p.Id
                LEFT JOIN TB_BANCOS b ON f.BancoId = b.Id
                LEFT JOIN TB_BANCOS bp ON p.BancoId = bp.Id
                LEFT JOIN FincasPagadasSummary pag ON f.Id = pag.FincaId
                LEFT JOIN FincasCiclosPendientes fcp ON f.Id = fcp.FincaId
                LEFT JOIN SemanasPendientesCTE sp ON f.Id = sp.FincaId
                LEFT JOIN SemanasPagadasCTE spg ON f.Id = spg.FincaId
                LEFT JOIN TB_RUTAS_RECOLECCION r ON fcp.FincaId = r.FincaId AND fcp.CicloId = ISNULL(r.CicloLiquidacionId, r.CicloId) AND r.Litros > 0
                LEFT JOIN DeduccionesCTE ded ON f.Id = ded.FincaId
                LEFT JOIN AdelantosCTE ad ON f.Id = ad.FincaId
                WHERE (
                    EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION rx WHERE rx.FincaId = f.Id AND rx.Litros > 0 AND (@usaFiltroCiclos = 0 OR ISNULL(rx.CicloLiquidacionId, rx.CicloId) IN @listaCiclos))
                    OR pag.FincaId IS NOT NULL
                )
                  AND UPPER(f.Nombre) NOT LIKE '%CHOFER%'
                  AND UPPER(ISNULL(f.Propietario, '')) NOT LIKE '%CHOFER%'
                  AND f.Id <> 68
                  AND ISNULL(f.TipoServicioId, 1) = 1
                GROUP BY f.Id, f.Nombre, f.Propietario, p.Nombre, f.PropietarioId, f.CedulaRIF, p.CedulaRIF, f.BancoId, p.BancoId, b.Nombre, bp.Nombre, f.NumeroCuenta, p.NumeroCuenta, f.PrecioLitroUSD, f.PrecioBufalaLitroUSD, f.TieneDosTiposLeche, f.PrecioLitroAcidaUSD, ded.OtrasDeduccionesBs, ded.ConceptoDeducciones, ad.TotalAdelantosBs, ad.TotalAdelantosUSD, ad.CuotasDetalle, pag.FincaId, pag.PagoId, pag.FechaPago, pag.PaidTasaBcv, pag.PaidTotalBrutoBs, pag.PaidTotalAdelantosBs, pag.PaidOtrasDeduccionesBs, pag.PaidTotalNetoBs, pag.PaidTotalLitros, pag.PaidTotalLitrosBuenos, pag.PaidTotalLitrosAcidos, pag.PaidTotalUSD, sp.SemanasPendientes, sp.CantidadSemanasPendientes, spg.SemanasPagadas, spg.CantidadSemanasPagadas
                ORDER BY f.Nombre";

            int minCicloId = listaCiclos.Any() ? listaCiclos.Min() : 0;
            var rows = (await connection.QueryAsync<PreLiquidacionDto>(sql, new { 
                listaCiclos, 
                usaFiltroCiclos = usaFiltroCiclos ? 1 : 0, 
                minCicloId,
                tasaActual 
            }, commandTimeout: 120)).ToList();

            foreach (var row in rows)
            {
                row.SemanasUnificadas = semanasTexto;

                // SemanasPendientes solo contiene semanas anteriores CERRADAS no pagadas calculadas en SQL.
                // No inyectar la semana actual si no está cerrada o es la semana en curso.
                if (row.EsPagado && string.IsNullOrWhiteSpace(row.SemanasPagadas))
                {
                    row.SemanasPagadas = semanasTexto;
                    row.CantidadSemanasPagadas = listaCiclos.Count;
                }

                if (row.EsPagado && row.PaidTotalNetoBs.HasValue)
                {
                    row.TasaBcv = row.PaidTasaBcv ?? tasaActual;
                    row.TotalBrutoBs = row.PaidTotalBrutoBs.Value;
                    row.TotalAdelantosBs = row.PaidTotalAdelantosBs ?? row.TotalAdelantosBs;
                    row.OtrasDeduccionesBs = row.PaidOtrasDeduccionesBs ?? row.OtrasDeduccionesBs;
                    row.TotalNetoBs = row.PaidTotalNetoBs.Value;
                }
                else
                {
                    // En caso de fincas pendientes (y especialmente en unificación de semanas),
                    // el monto total a pagar unificado se calcula SIEMPRE con el valor del dólar actual (tasaActual).
                    row.TasaBcv = tasaActual;
                    row.TotalBrutoBs = Math.Round(row.TotalUSD * tasaActual, 2);
                    if (row.TotalAdelantosUSD > 0)
                    {
                        row.TotalAdelantosBs = Math.Round(row.TotalAdelantosUSD * tasaActual, 2);
                    }
                    row.TotalNetoBs = Math.Max(0, row.TotalBrutoBs - row.TotalAdelantosBs - row.OtrasDeduccionesBs);
                }

                // Cálculo explícito de saldo deudor restante para visualización clara
                if (row.TotalAdelantosUSD > row.TotalUSD)
                {
                    row.DeudaRestanteUSD = Math.Round(row.TotalAdelantosUSD - row.TotalUSD, 2);
                    row.DeudaRestanteBs = Math.Round(row.TotalAdelantosBs - row.TotalBrutoBs, 2);
                }
                else
                {
                    row.DeudaRestanteUSD = 0;
                    row.DeudaRestanteBs = 0;
                }
            }

            return rows;
        }

        public async Task<bool> AjustarPreLiquidacionFincaAsync(AjustarPreLiquidacionFincaDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                // 1. Actualizar precios en TB_FINCAS
                var sqlFinca = @"
                    UPDATE TB_FINCAS
                    SET PrecioLitroUSD = CASE WHEN @PrecioLitroUSD > 0 THEN @PrecioLitroUSD ELSE PrecioLitroUSD END,
                        PrecioBufalaLitroUSD = CASE WHEN @PrecioLitroBufalaUSD > 0 THEN @PrecioLitroBufalaUSD ELSE PrecioBufalaLitroUSD END,
                        PrecioLitroAcidaUSD = CASE WHEN @PrecioLitroAcidaUSD > 0 THEN @PrecioLitroAcidaUSD ELSE PrecioLitroAcidaUSD END
                    WHERE Id = @FincaId";

                await connection.ExecuteAsync(sqlFinca, dto, transaction);

                // 2. Obtener cicloId si no está provisto
                if (!dto.CicloId.HasValue || dto.CicloId.Value <= 0)
                {
                    dto.CicloId = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC", transaction: transaction);
                }

                if (dto.CicloId.HasValue && dto.CicloId.Value > 0)
                {
                    // Actualizar recolecciones del ciclo
                    if (dto.PrecioLitroUSD > 0)
                    {
                        var sqlRutasNormal = @"
                            UPDATE TB_RUTAS_RECOLECCION
                            SET PrecioLitroUSDAplicado = @PrecioLitroUSD
                            WHERE FincaId = @FincaId AND (CicloId = @CicloId OR CicloId IS NULL) AND (TipoLeche = 'VACA' OR TipoLeche IS NULL) AND (EsAcida = 0 OR EsAcida IS NULL)";
                        await connection.ExecuteAsync(sqlRutasNormal, new { dto.FincaId, dto.CicloId, dto.PrecioLitroUSD }, transaction);
                    }

                    if (dto.PrecioLitroBufalaUSD.HasValue && dto.PrecioLitroBufalaUSD.Value > 0)
                    {
                        var sqlRutasBufala = @"
                            UPDATE TB_RUTAS_RECOLECCION
                            SET PrecioLitroUSDAplicado = @PrecioLitroBufalaUSD
                            WHERE FincaId = @FincaId AND (CicloId = @CicloId OR CicloId IS NULL) AND TipoLeche = 'BUFALA' AND (EsAcida = 0 OR EsAcida IS NULL)";
                        await connection.ExecuteAsync(sqlRutasBufala, new { dto.FincaId, dto.CicloId, PrecioLitroBufalaUSD = dto.PrecioLitroBufalaUSD.Value }, transaction);
                    }

                    if (dto.PrecioLitroAcidaUSD > 0)
                    {
                        var sqlRutasAcida = @"
                            UPDATE TB_RUTAS_RECOLECCION
                            SET PrecioLitroUSDAplicado = @PrecioLitroAcidaUSD
                            WHERE FincaId = @FincaId AND (CicloId = @CicloId OR CicloId IS NULL) AND EsAcida = 1";
                        await connection.ExecuteAsync(sqlRutasAcida, new { dto.FincaId, dto.CicloId, dto.PrecioLitroAcidaUSD }, transaction);
                    }

                    // 2.1 Actualizar Tasa Dólar / BCV para esta finca en este ciclo
                    if (dto.TasaDolarBs.HasValue && dto.TasaDolarBs.Value > 0)
                    {
                        var sqlRutasTasa = @"
                            UPDATE TB_RUTAS_RECOLECCION
                            SET TasaDolarBsAplicada = @TasaDolarBs
                            WHERE FincaId = @FincaId AND (CicloId = @CicloId OR CicloId IS NULL)";
                        await connection.ExecuteAsync(sqlRutasTasa, new { dto.FincaId, dto.CicloId, TasaDolarBs = dto.TasaDolarBs.Value }, transaction);

                        var sqlPagoTasa = @"
                            UPDATE TB_PAGOS_LIQUIDACION
                            SET TasaBcv = @TasaDolarBs,
                                TotalBrutoBs = ROUND(TotalUSD * @TasaDolarBs, 2),
                                TotalNetoBs = ROUND((TotalUSD * @TasaDolarBs) - TotalAdelantosBs - OtrasDeduccionesBs, 2)
                            WHERE FincaId = @FincaId AND CicloId = @CicloId";
                        await connection.ExecuteAsync(sqlPagoTasa, new { dto.FincaId, dto.CicloId, TasaDolarBs = dto.TasaDolarBs.Value }, transaction);
                    }

                    // 3. Cuota de adelanto (Bs y USD)
                    if (dto.AdelantoCuotaBs.HasValue || dto.AdelantoCuotaUSD.HasValue || dto.TasaDolarBs.HasValue)
                    {
                        var sqlCuota = @"
                            UPDATE c
                            SET c.MontoCuotaUSD = ISNULL(@AdelantoCuotaUSD, c.MontoCuotaUSD),
                                c.TasaBcvAplicada = CASE WHEN @TasaDolarBs > 0 THEN @TasaDolarBs ELSE c.TasaBcvAplicada END,
                                c.ModifiedAt = GETDATE()
                            FROM TB_ADELANTOS_CUOTAS c
                            INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                            WHERE a.TipoEntidad = 'FINCA' 
                              AND a.EntidadId = @FincaId 
                              AND (c.SemanaOperativaId = @CicloId OR c.SemanaOperativaId IS NULL) 
                              AND c.Estado = 'PENDIENTE'";
                        await connection.ExecuteAsync(sqlCuota, new { dto.FincaId, dto.CicloId, dto.AdelantoCuotaUSD, TasaDolarBs = dto.TasaDolarBs ?? 0 }, transaction);
                    }

                    // 4. Deducción específica de este ciclo (TB_DEDUCCIONES_FINCA_CICLO)
                    var sqlDelDeduc = "DELETE FROM TB_DEDUCCIONES_FINCA_CICLO WHERE FincaId = @FincaId AND CicloId = @CicloId";
                    await connection.ExecuteAsync(sqlDelDeduc, new { dto.FincaId, dto.CicloId }, transaction);

                    if (dto.OtrasDeduccionesBs > 0 || !string.IsNullOrWhiteSpace(dto.ConceptoDeducciones))
                    {
                        var sqlInsDeduc = @"
                            INSERT INTO TB_DEDUCCIONES_FINCA_CICLO (FincaId, CicloId, MontoBs, Concepto)
                            VALUES (@FincaId, @CicloId, @OtrasDeduccionesBs, @ConceptoDeducciones)";
                        await connection.ExecuteAsync(sqlInsDeduc, new { dto.FincaId, dto.CicloId, dto.OtrasDeduccionesBs, ConceptoDeducciones = dto.ConceptoDeducciones ?? "" }, transaction);
                    }
                }

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<int> ActualizarTasaFincasPendientesAsync(ActualizarTasaPendientesDto dto)
        {
            if (dto == null || dto.TasaBcv <= 0)
                throw new ArgumentException("La tasa BCV debe ser mayor a 0.");

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var listaCiclos = new List<int>();
                if (!string.IsNullOrWhiteSpace(dto.CicloIds))
                {
                    listaCiclos = dto.CicloIds.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                              .Select(s => int.TryParse(s.Trim(), out var n) ? n : 0)
                                              .Where(n => n > 0)
                                              .Distinct()
                                              .ToList();
                }
                else if (dto.CicloId.HasValue && dto.CicloId.Value > 0)
                {
                    listaCiclos.Add(dto.CicloId.Value);
                }
                else
                {
                    var activoId = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC", transaction: transaction) ?? 0;
                    if (activoId > 0) listaCiclos.Add(activoId);
                }

                if (listaCiclos.Count == 0)
                    throw new Exception("No se especificó ni se encontró ningún ciclo operativo.");

                // 1. Actualizar TB_RUTAS_RECOLECCION solo para fincas que NO tengan pago con EstadoPago = 'PAGADO' en los ciclos correspondientes
                var sqlRutas = @"
                    UPDATE r
                    SET r.TasaDolarBsAplicada = @TasaBcv
                    FROM TB_RUTAS_RECOLECCION r
                    WHERE ISNULL(r.CicloLiquidacionId, r.CicloId) IN @listaCiclos
                      AND r.FincaId NOT IN (
                          SELECT p.FincaId 
                          FROM TB_PAGOS_LIQUIDACION p 
                          WHERE p.CicloId = ISNULL(r.CicloLiquidacionId, r.CicloId) AND p.EstadoPago = 'PAGADO'
                      )";
                await connection.ExecuteAsync(sqlRutas, new { listaCiclos, dto.TasaBcv }, transaction);

                // 2. Actualizar automáticamente cuotas pendientes de adelantos activos al nuevo valor del dólar
                var sqlAdelantos = @"
                    UPDATE c
                    SET c.TasaBcvAplicada = @TasaBcv,
                        c.ModifiedAt = GETDATE()
                    FROM TB_ADELANTOS_CUOTAS c
                    INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                    WHERE a.Estado != 'PAGADO'
                      AND a.MontoPendienteUSD > 0.001
                      AND c.Estado != 'COBRADO'
                      AND c.Estado != 'ANULADA';";
                await connection.ExecuteAsync(sqlAdelantos, new { dto.TasaBcv }, transaction);

                // 3. Registrar o actualizar en TB_HISTORIAL_BCV para la fecha actual
                var sqlHistorial = @"
                    MERGE TB_HISTORIAL_BCV AS target
                    USING (SELECT CAST(GETDATE() AS DATE) AS Fecha) AS source
                    ON (CAST(target.Fecha AS DATE) = source.Fecha)
                    WHEN MATCHED THEN
                        UPDATE SET TasaDolarBs = @TasaBcv, Observacion = 'Actualización desde Pre-Liquidación (Pendientes)', CreatedAt = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (Fecha, TasaDolarBs, Fuente, Observacion, CreatedAt)
                        VALUES (CAST(GETDATE() AS DATE), @TasaBcv, 'BANCO CENTRAL DE VENEZUELA (BCV)', 'Actualización desde Pre-Liquidación (Pendientes)', GETDATE());";
                await connection.ExecuteAsync(sqlHistorial, new { dto.TasaBcv }, transaction);

                // 4. Si existen registros en TB_PAGOS_LIQUIDACION en estado no pagado (ej. PENDIENTE / DRAFT), actualizarlos
                var sqlPagos = @"
                    UPDATE TB_PAGOS_LIQUIDACION
                    SET TasaBcv = @TasaBcv,
                        TotalBrutoBs = ROUND(TotalUSD * @TasaBcv, 2),
                        TotalAdelantosBs = ROUND(TotalAdelantosUSD * @TasaBcv, 2),
                        TotalNetoBs = ROUND((TotalUSD * @TasaBcv) - ROUND(TotalAdelantosUSD * @TasaBcv, 2) - OtrasDeduccionesBs, 2)
                    WHERE CicloId IN @listaCiclos AND EstadoPago <> 'PAGADO'";
                await connection.ExecuteAsync(sqlPagos, new { listaCiclos, dto.TasaBcv }, transaction);

                // 3. Contar cuántas fincas pendientes fueron actualizadas
                var sqlCount = @"
                    SELECT COUNT(DISTINCT r.FincaId)
                    FROM TB_RUTAS_RECOLECCION r
                    WHERE ISNULL(r.CicloLiquidacionId, r.CicloId) IN @listaCiclos
                      AND r.FincaId NOT IN (
                          SELECT p.FincaId 
                          FROM TB_PAGOS_LIQUIDACION p 
                          WHERE p.CicloId = ISNULL(r.CicloLiquidacionId, r.CicloId) AND p.EstadoPago = 'PAGADO'
                      )";
                int fincasActualizadas = await connection.ExecuteScalarAsync<int>(sqlCount, new { listaCiclos }, transaction);

                transaction.Commit();
                return fincasActualizadas;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> ProcesarPagoLiquidacionAsync(ProcesarPagoLiquidacionDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var listaCiclos = new List<int>();
                if (!string.IsNullOrWhiteSpace(dto.CicloIds))
                {
                    listaCiclos = dto.CicloIds.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                              .Select(s => int.TryParse(s.Trim(), out var n) ? n : 0)
                                              .Where(n => n > 0)
                                              .Distinct()
                                              .ToList();
                }
                else if (dto.CicloId.HasValue && dto.CicloId.Value > 0)
                {
                    listaCiclos.Add(dto.CicloId.Value);
                }

                if (!listaCiclos.Any())
                {
                    int defaultCiclo = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC", transaction: transaction) ?? 0;
                    if (defaultCiclo > 0) listaCiclos.Add(defaultCiclo);
                }

                if (!listaCiclos.Any())
                    throw new Exception("No se encontró ningún ciclo operativo válido para procesar el pago.");

                decimal tasaActual = (dto.TasaBcv.HasValue && dto.TasaBcv.Value > 0)
                    ? dto.TasaBcv.Value
                    : await connection.ExecuteScalarAsync<decimal?>("SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC", transaction: transaction) ?? 1.0m;

                if (!dto.Pagado)
                {
                    // Revertir pago en todos los ciclos indicados
                    foreach (var cId in listaCiclos)
                    {
                        await connection.ExecuteAsync(@"
                            UPDATE TB_PAGOS_LIQUIDACION
                            SET EstadoPago = 'ANULADO',
                                Observacion = 'Pago revertido por usuario'
                            WHERE FincaId = @FincaId AND CicloId = @cId AND EstadoPago = 'PAGADO'",
                            new { dto.FincaId, cId }, transaction);
                    }

                    // Si se generaron adelantos automáticos de saldo deudor para ciclos siguientes que no se hayan cobrado aún, anularlos
                    int maxCicloIdRev = listaCiclos.Max();
                    var nextCiclosRev = (await connection.QueryAsync<int>(@"
                        SELECT Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @maxCicloIdRev", new { maxCicloIdRev }, transaction)).ToList();

                    if (nextCiclosRev.Any())
                    {
                        var adelantosAutoIds = (await connection.QueryAsync<int>(@"
                            SELECT Id FROM TB_ADELANTOS
                            WHERE TipoEntidad = 'FINCA' AND EntidadId = @FincaId
                              AND SemanaInicioId IN @nextCiclosRev
                              AND Observacion LIKE '%Saldo deudor / Remanente automático%'
                              AND (MontoPagadoUSD = 0 OR MontoPagadoUSD IS NULL)",
                            new { dto.FincaId, nextCiclosRev }, transaction)).ToList();

                        if (adelantosAutoIds.Any())
                        {
                            await connection.ExecuteAsync(@"
                                UPDATE TB_ADELANTOS_CUOTAS SET Estado = 'ANULADA', Observacion = 'Anulada por reversión de liquidación anterior'
                                WHERE AdelantoId IN @adelantosAutoIds;
                                UPDATE TB_ADELANTOS SET Estado = 'ANULADA', Observacion = 'Anulado por reversión de liquidación anterior'
                                WHERE Id IN @adelantosAutoIds;", new { adelantosAutoIds }, transaction);
                        }
                    }

                    // Revertir únicamente cuotas correspondientes a los ciclos cancelados
                    var cuotasCobradaIds = (await connection.QueryAsync<int>(@"
                        SELECT c.Id
                        FROM TB_ADELANTOS_CUOTAS c
                        INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                        WHERE a.TipoEntidad = 'FINCA' AND a.EntidadId = @FincaId
                          AND c.SemanaOperativaId IN @listaCiclos
                          AND c.Estado = 'COBRADO'",
                        new { dto.FincaId, listaCiclos }, transaction)).ToList();

                    if (cuotasCobradaIds.Any())
                    {
                        // Restaurar el monto de la cuota si fue reducida por cobertura parcial en un adelanto de 1 sola cuota
                        await connection.ExecuteAsync(@"
                            UPDATE c
                            SET c.MontoCuotaUSD = a.MontoTotalUSD,
                                c.MontoCobradoUSD = 0,
                                c.MontoCobradoBs = 0,
                                c.Estado = 'PENDIENTE',
                                c.Observacion = 'Pendiente de cobro (Revertido por usuario)',
                                c.ModifiedAt = GETDATE(),
                                c.ModifiedBy = @usuarioId
                            FROM TB_ADELANTOS_CUOTAS c
                            INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                            WHERE c.Id IN @cuotasCobradaIds AND a.NumeroCuotas = 1;", new { cuotasCobradaIds, usuarioId }, transaction);

                        await connection.ExecuteAsync(@"
                            UPDATE c
                            SET c.MontoCobradoUSD = 0,
                                c.MontoCobradoBs = 0,
                                c.Estado = 'PENDIENTE',
                                c.Observacion = 'Pendiente de cobro (Revertido por usuario)',
                                c.ModifiedAt = GETDATE(),
                                c.ModifiedBy = @usuarioId
                            FROM TB_ADELANTOS_CUOTAS c
                            INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                            WHERE c.Id IN @cuotasCobradaIds AND a.NumeroCuotas > 1;", new { cuotasCobradaIds, usuarioId }, transaction);

                        // Recalcular saldo y estado de cada adelanto afectado tras la reversión
                        var adelantoIds = (await connection.QueryAsync<int>(@"
                            SELECT DISTINCT AdelantoId FROM TB_ADELANTOS_CUOTAS WHERE Id IN @cuotasCobradaIds",
                            new { cuotasCobradaIds }, transaction)).ToList();

                        foreach (var aId in adelantoIds)
                        {
                            decimal totalCobrado = await connection.QuerySingleAsync<decimal>(
                                "SELECT ISNULL(SUM(MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @aId AND Estado = 'COBRADO'",
                                new { aId }, transaction);
                            decimal totalMonto = await connection.QuerySingleAsync<decimal>(
                                "SELECT ISNULL(MontoTotalUSD, 0) FROM TB_ADELANTOS WHERE Id = @aId", new { aId }, transaction);
                            decimal pend = Math.Max(0, totalMonto - totalCobrado);
                            string st = (pend <= 0.01m) ? "PAGADO" : "ACTIVO";
                            await connection.ExecuteAsync(@"
                                UPDATE TB_ADELANTOS
                                SET MontoPagadoUSD = @totalCobrado, MontoPendienteUSD = @pend, Estado = @st, ModifiedAt = GETDATE()
                                WHERE Id = @aId", new { totalCobrado, pend, st, aId }, transaction);
                        }
                    }

                    // Registrar en TB_LOGS_PAGOS_LIQUIDACION la reversión
                    foreach (var cId in listaCiclos)
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_LOGS_PAGOS_LIQUIDACION (
                                Accion, FincaId, CicloId, Detalle, UsuarioId, Fecha
                            ) VALUES (
                                'REVERSION_PAGO', @FincaId, @cId, 'Pago de liquidación revertido por usuario', @usuarioId, GETDATE()
                            )", new { dto.FincaId, cId, usuarioId }, transaction);
                    }

                    transaction.Commit();
                    return true;
                }

                // Obtener datos de la finca
                var finca = await connection.QueryFirstOrDefaultAsync<dynamic>(@"
                    SELECT f.Id, f.Nombre, 
                           ISNULL(f.Propietario, p.Nombre) AS Propietario, 
                           ISNULL(f.CedulaRIF, p.CedulaRIF) AS CedulaRIF, 
                           f.PrecioLitroUSD, f.PrecioLitroAcidaUSD, f.PrecioBufalaLitroUSD,
                           ISNULL(b.Nombre, ISNULL(bp.Nombre, 'Sin Banco')) AS BancoNombre, 
                           ISNULL(f.NumeroCuenta, ISNULL(p.NumeroCuenta, '')) AS NumeroCuenta
                    FROM TB_FINCAS f
                    LEFT JOIN TB_PROPIETARIOS p ON f.PropietarioId = p.Id
                    LEFT JOIN TB_BANCOS b ON f.BancoId = b.Id
                    LEFT JOIN TB_BANCOS bp ON p.BancoId = bp.Id
                    WHERE f.Id = @FincaId", new { dto.FincaId }, transaction);

                if (finca == null)
                    throw new Exception("Finca no encontrada.");

                string fincaNombre = (string)finca.Nombre;
                string propietario = (string)(finca.Propietario ?? "");
                string cedulaRIF = (string)(finca.CedulaRIF ?? "");
                string bancoNombre = (string)(finca.BancoNombre ?? "");
                string numeroCuenta = (string)(finca.NumeroCuenta ?? "");
                decimal precioGoodUSD = (decimal)(finca.PrecioLitroUSD ?? 0.84m);
                decimal precioAcidaUSD = (decimal)(finca.PrecioLitroAcidaUSD ?? (precioGoodUSD / 2m));
                decimal precioBufalaUSD = (decimal)(finca.PrecioBufalaLitroUSD ?? 1.02m);

                // Filtrar los ciclos que realmente están pendientes para esta finca
                var ciclosPendientesFinca = (await connection.QueryAsync<int>(@"
                    SELECT DISTINCT ISNULL(r.CicloLiquidacionId, r.CicloId) AS CicloId
                    FROM TB_RUTAS_RECOLECCION r
                    WHERE r.FincaId = @FincaId AND ISNULL(r.CicloLiquidacionId, r.CicloId) IN @listaCiclos
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_PAGOS_LIQUIDACION p WHERE p.FincaId = r.FincaId AND p.CicloId = ISNULL(r.CicloLiquidacionId, r.CicloId) AND p.EstadoPago = 'PAGADO'
                      )", new { dto.FincaId, listaCiclos }, transaction)).ToList();

                var ciclosAProcesar = ciclosPendientesFinca.Any() ? ciclosPendientesFinca : listaCiclos;

                // Calcular el total disponible de leche en USD para cubrir adelantos
                decimal totalUSDLecheDisponible = 0m;
                foreach (var cId in ciclosAProcesar)
                {
                    var recsCalc = (await connection.QueryAsync<dynamic>(@"
                        SELECT Litros, EsAcida, TipoLeche, ISNULL(PrecioLitroUSDAplicado, 0) AS PrecioLitroUSDAplicado
                        FROM TB_RUTAS_RECOLECCION
                        WHERE FincaId = @FincaId AND ISNULL(CicloLiquidacionId, CicloId) = @cId", new { dto.FincaId, cId }, transaction)).ToList();

                    foreach (var r in recsCalc)
                    {
                        int l = (int)r.Litros;
                        bool acida = (bool)r.EsAcida;
                        string tLeche = (string)(r.TipoLeche ?? "VACA");
                        decimal p = (decimal)r.PrecioLitroUSDAplicado;
                        if (p <= 0)
                        {
                            if (acida) p = precioAcidaUSD;
                            else if (tLeche.ToUpper().Contains("BUFAL")) p = precioBufalaUSD;
                            else p = precioGoodUSD;
                        }
                        totalUSDLecheDisponible += l * p;
                    }
                }

                // Cuotas de adelanto acumuladas: ÚNICAMENTE cuotas asignadas a los ciclos en pago o cuotas pasadas pendientes (< minCicloId).
                // NUNCA cuotas futuras (> maxCicloId).
                int minCicloId = listaCiclos.Min();
                var cuotasAdelanto = (await connection.QueryAsync<dynamic>(@"
                    SELECT c.Id, c.AdelantoId, c.MontoCuotaUSD, c.NumeroCuota, a.NumeroCuotas, a.MontoTotalUSD, c.SemanaOperativaId
                    FROM TB_ADELANTOS_CUOTAS c
                    INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                    WHERE a.TipoEntidad = 'FINCA' AND a.EntidadId = @FincaId
                      AND (
                          c.SemanaOperativaId IN @listaCiclos
                          OR (c.SemanaOperativaId IS NULL AND c.Estado = 'PENDIENTE' AND a.Estado = 'ACTIVO')
                          OR (@minCicloId > 0 AND c.SemanaOperativaId < @minCicloId AND c.Estado = 'PENDIENTE' AND a.Estado = 'ACTIVO')
                      )
                      AND c.Estado <> 'POSPUESTO'
                      AND c.Estado <> 'ANULADA'", new { dto.FincaId, listaCiclos, minCicloId }, transaction)).ToList();

                decimal totalAdelantosUSD = 0m;
                decimal totalAdelantosBs = 0m;
                string cuotasDetalle = "";
                bool canceladoTotalAdelanto = false;

                if (cuotasAdelanto.Any())
                {
                    decimal fondoDisponibleUSD = totalUSDLecheDisponible;

                    foreach (var cuota in cuotasAdelanto)
                    {
                        decimal cuotaMontoUsd = (decimal)cuota.MontoCuotaUSD;
                        decimal montoACobrarUsd = Math.Min(cuotaMontoUsd, fondoDisponibleUSD);
                        decimal remanenteCuotaUsd = Math.Max(0, cuotaMontoUsd - montoACobrarUsd);
                        fondoDisponibleUSD -= montoACobrarUsd;

                        decimal cuotaMontoBs = Math.Round(montoACobrarUsd * tasaActual, 2);
                        int cId = (int)cuota.Id;
                        int aId = (int)cuota.AdelantoId;
                        int numCuota = (int)cuota.NumeroCuota;
                        int totCuotas = (int)cuota.NumeroCuotas;
                        int? semId = (int?)cuota.SemanaOperativaId;

                        if (remanenteCuotaUsd > 0.009m)
                        {
                            // La leche NO cubrió el total de la cuota: cobro parcial y traslado automático de saldo deudor a la siguiente semana
                            await connection.ExecuteAsync(@"
                                UPDATE TB_ADELANTOS_CUOTAS
                                SET MontoCuotaUSD = @montoACobrarUsd,
                                    MontoCobradoUSD = @montoACobrarUsd,
                                    TasaBcvAplicada = @tasaActual,
                                    MontoCobradoBs = @cuotaMontoBs,
                                    Estado = 'COBRADO',
                                    Observacion = 'Deducción parcial en Liquidación Bancaria por cobertura de leche',
                                    ModifiedAt = GETDATE(),
                                    ModifiedBy = @usuarioId
                                WHERE Id = @cId", new { montoACobrarUsd, tasaActual, cuotaMontoBs, usuarioId, cId }, transaction);

                            // Determinar el siguiente ciclo operativo
                            int maxCicloId = listaCiclos.Max();
                            int? nextCicloId = await connection.QueryFirstOrDefaultAsync<int?>(@"
                                SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS 
                                WHERE FechaInicio > (SELECT FechaFin FROM TB_CICLOS_OPERATIVOS WHERE Id = @maxCicloId) 
                                ORDER BY FechaInicio ASC", new { maxCicloId }, transaction);

                            if (!nextCicloId.HasValue)
                            {
                                nextCicloId = await connection.QueryFirstOrDefaultAsync<int?>(@"
                                    SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS 
                                    WHERE Id > @maxCicloId 
                                    ORDER BY Id ASC", new { maxCicloId }, transaction);
                            }

                            if (nextCicloId.HasValue)
                            {
                                string nextCicloCodigo = await connection.QueryFirstOrDefaultAsync<string>(
                                    "SELECT Codigo FROM TB_CICLOS_OPERATIVOS WHERE Id = @nextCicloId", new { nextCicloId }, transaction) ?? $"Semana {nextCicloId}";

                                string obsSaldoDeudor = $"Saldo deudor / Remanente automático de Liquidación Semana {maxCicloId} (Adelanto #{aId}: ${cuotaMontoUsd:N2} - Leche: ${montoACobrarUsd:N2} = ${remanenteCuotaUsd:N2})";

                                int nuevoAdelantoId = await connection.QuerySingleAsync<int>(@"
                                    INSERT INTO TB_ADELANTOS (
                                        TipoEntidad, EntidadId, FechaSolicitud, SemanaInicioId,
                                        MontoTotalUSD, NumeroCuotas, MontoCuotaUSD, MontoPagadoUSD,
                                        MontoPendienteUSD, Estado, Observacion, CreatedAt, CreatedBy
                                    ) VALUES (
                                        'FINCA', @FincaId, GETDATE(), @nextCicloId,
                                        @remanenteCuotaUsd, 1, @remanenteCuotaUsd, 0,
                                        @remanenteCuotaUsd, 'ACTIVO', @obsSaldoDeudor, GETDATE(), @usuarioId
                                    );
                                    SELECT CAST(SCOPE_IDENTITY() AS INT);", new {
                                        dto.FincaId, nextCicloId, remanenteCuotaUsd, obsSaldoDeudor, usuarioId
                                    }, transaction);

                                await connection.ExecuteAsync(@"
                                    INSERT INTO TB_ADELANTOS_CUOTAS (
                                        AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                                        MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                                        Observacion, CreatedAt, CreatedBy
                                    ) VALUES (
                                        @nuevoAdelantoId, 1, @nextCicloId, @remanenteCuotaUsd,
                                        0, @tasaActual, 0, 'PENDIENTE',
                                        @obsSaldoDeudor, GETDATE(), @usuarioId
                                    );", new {
                                        nuevoAdelantoId, nextCicloId, remanenteCuotaUsd, tasaActual, obsSaldoDeudor, usuarioId
                                    }, transaction);

                                await connection.ExecuteAsync(@"
                                    INSERT INTO TB_LOGS_PAGOS_LIQUIDACION (
                                        Accion, FincaId, FincaNombre, CicloId, CicloNombre,
                                        TasaBcv, CuotaId, AdelantoId, NumeroCuota, MontoCuotaUSD, MontoCuotaBs,
                                        Detalle, UsuarioId, Fecha
                                    ) VALUES (
                                        'SALDO_DEUDOR_TRASLADADO', @FincaId, @fincaNombre, @nextCicloId, @nextCicloCodigo,
                                        @tasaActual, @cId, @nuevoAdelantoId, 1, @remanenteCuotaUsd, ROUND(@remanenteCuotaUsd * @tasaActual, 2),
                                        @obsSaldoDeudor, @usuarioId, GETDATE()
                                    );", new {
                                        dto.FincaId, fincaNombre, nextCicloId, nextCicloCodigo,
                                        tasaActual, cId, nuevoAdelantoId, remanenteCuotaUsd, obsSaldoDeudor, usuarioId
                                    }, transaction);
                            }

                            decimal totalCobradoAdelanto = await connection.QuerySingleAsync<decimal>(
                                "SELECT ISNULL(SUM(MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @aId AND Estado = 'COBRADO'",
                                new { aId }, transaction);

                            string obsCierre = $"Liquidado en Semana {maxCicloId} (${montoACobrarUsd:N2} cobrados). Remanente de ${remanenteCuotaUsd:N2} trasladado a nuevo adelanto en Semana {nextCicloId}";
                            await connection.ExecuteAsync(@"
                                UPDATE TB_ADELANTOS
                                SET MontoPagadoUSD = @totalCobradoAdelanto,
                                    MontoPendienteUSD = 0,
                                    Estado = 'PAGADO',
                                    Observacion = CASE 
                                        WHEN Observacion IS NULL OR Observacion = '' THEN @obsCierre
                                        ELSE Observacion + ' | ' + @obsCierre 
                                    END,
                                    ModifiedAt = GETDATE()
                                WHERE Id = @aId", new { totalCobradoAdelanto, obsCierre, aId }, transaction);
                        }
                        else
                        {
                            // Cuota cubierta completamente
                            await connection.ExecuteAsync(@"
                                UPDATE TB_ADELANTOS_CUOTAS
                                SET MontoCobradoUSD = @cuotaMontoUsd,
                                    TasaBcvAplicada = @tasaActual,
                                    MontoCobradoBs = @cuotaMontoBs,
                                    Estado = 'COBRADO',
                                    Observacion = 'Descontado y cancelado en Liquidación Bancaria',
                                    ModifiedAt = GETDATE(),
                                    ModifiedBy = @usuarioId
                                WHERE Id = @cId", new { cuotaMontoUsd, tasaActual, cuotaMontoBs, usuarioId, cId }, transaction);

                            decimal totalCobradoAdelanto = await connection.QuerySingleAsync<decimal>(
                                "SELECT ISNULL(SUM(MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @aId AND Estado = 'COBRADO'",
                                new { aId }, transaction);

                            decimal montoTotalUsdAdelanto = (decimal)cuota.MontoTotalUSD;
                            decimal pendiente = Math.Max(0, montoTotalUsdAdelanto - totalCobradoAdelanto);
                            string estAdelanto = (pendiente <= 0.01m) ? "PAGADO" : "ACTIVO";

                            await connection.ExecuteAsync(@"
                                UPDATE TB_ADELANTOS
                                SET MontoPagadoUSD = @totalCobradoAdelanto,
                                    MontoPendienteUSD = @pendiente,
                                    Estado = @estAdelanto,
                                    ModifiedAt = GETDATE()
                                WHERE Id = @aId", new { totalCobradoAdelanto, pendiente, estAdelanto, aId }, transaction);
                        }

                        // Registrar log en TB_LOGS_PAGOS_LIQUIDACION para la cuota cobrada
                        int cicloParaLog = semId ?? minCicloId;
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_LOGS_PAGOS_LIQUIDACION (
                                Accion, FincaId, FincaNombre, CicloId, CicloNombre,
                                TasaBcv, CuotaId, AdelantoId, NumeroCuota, MontoCuotaUSD, MontoCuotaBs,
                                Detalle, UsuarioId, Fecha
                            ) VALUES (
                                'DESCUENTO_CUOTA', @FincaId, @fincaNombre, @cicloParaLog, @cicloNombre,
                                @tasaActual, @cId, @aId, @numCuota, @montoACobrarUsd, @cuotaMontoBs,
                                @detalleCuota, @usuarioId, GETDATE()
                            )", new {
                                dto.FincaId, fincaNombre, cicloParaLog, cicloNombre = $"Semana {cicloParaLog}",
                                tasaActual, cId, aId, numCuota, montoACobrarUsd, cuotaMontoBs,
                                detalleCuota = $"Cobro de Cuota {numCuota}/{totCuotas} de Adelanto #{aId} en Liquidación",
                                usuarioId
                            }, transaction);

                        totalAdelantosUSD += montoACobrarUsd;
                        totalAdelantosBs += cuotaMontoBs;
                        if (string.IsNullOrEmpty(cuotasDetalle)) cuotasDetalle = $"Cuota {cuota.NumeroCuota} de {cuota.NumeroCuotas}";
                        else cuotasDetalle += $", Cuota {cuota.NumeroCuota} de {cuota.NumeroCuotas}";
                    }

                    canceladoTotalAdelanto = true;
                }

                // Registrar liquidación para cada ciclo pendiente
                decimal adelantoRestantePorAplicarBs = totalAdelantosBs;
                decimal adelantoRestantePorAplicarUSD = totalAdelantosUSD;

                foreach (var cicloId in ciclosAProcesar)
                {
                    var ciclo = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT Id, Codigo, FechaInicio, FechaFin FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloId", new { cicloId }, transaction);

                    DateTime fInicio = ciclo != null ? (DateTime)ciclo.FechaInicio : DateTime.Now.AddDays(-7);
                    DateTime fFin = ciclo != null ? (DateTime)ciclo.FechaFin : DateTime.Now;
                    string cicloNombre = $"Semana {cicloId} ({fInicio:yyyy-MM-dd} al {fFin:yyyy-MM-dd})";

                    await connection.ExecuteAsync(@"
                        UPDATE TB_PAGOS_LIQUIDACION SET EstadoPago = 'ANULADO' 
                        WHERE FincaId = @FincaId AND CicloId = @cicloId AND EstadoPago = 'PAGADO'",
                        new { dto.FincaId, cicloId }, transaction);

                    var recolecciones = (await connection.QueryAsync<dynamic>(@"
                        SELECT Litros, EsAcida, TipoLeche, ISNULL(PrecioLitroUSDAplicado, 0) AS PrecioLitroUSDAplicado
                        FROM TB_RUTAS_RECOLECCION
                        WHERE FincaId = @FincaId AND ISNULL(CicloLiquidacionId, CicloId) = @cicloId", new { dto.FincaId, cicloId }, transaction)).ToList();

                    int totalLitros = 0, litrosBuenos = 0, litrosAcidos = 0;
                    decimal totalUSD = 0m;

                    foreach (var r in recolecciones)
                    {
                        int l = (int)r.Litros;
                        bool acida = (bool)r.EsAcida;
                        string tLeche = (string)(r.TipoLeche ?? "VACA");
                        decimal p = (decimal)r.PrecioLitroUSDAplicado;
                        if (p <= 0)
                        {
                            if (acida) p = precioAcidaUSD;
                            else if (tLeche.ToUpper().Contains("BUFAL")) p = precioBufalaUSD;
                            else p = precioGoodUSD;
                        }

                        totalLitros += l;
                        if (acida) litrosAcidos += l; else litrosBuenos += l;
                        totalUSD += l * p;
                    }

                    decimal totalBrutoBs = Math.Round(totalUSD * tasaActual, 2);

                    var deducciones = (await connection.QueryAsync<dynamic>(@"
                        SELECT MontoBs, Concepto FROM TB_DEDUCCIONES_FINCA_CICLO
                        WHERE FincaId = @FincaId AND CicloId = @cicloId", new { dto.FincaId, cicloId }, transaction)).ToList();

                    decimal otrasDeduccionesBs = deducciones.Sum(d => (decimal)d.MontoBs);
                    string conceptoDeducciones = string.Join(", ", deducciones.Select(d => (string)d.Concepto));

                    decimal adelantoCicloUSD = Math.Min(totalUSD, adelantoRestantePorAplicarUSD);
                    decimal adelantoCicloBs = Math.Min(totalBrutoBs, adelantoRestantePorAplicarBs);
                    adelantoRestantePorAplicarUSD -= adelantoCicloUSD;
                    adelantoRestantePorAplicarBs -= adelantoCicloBs;

                    decimal totalNetoBs = Math.Max(0, totalBrutoBs - adelantoCicloBs - otrasDeduccionesBs);
                    string observacion = dto.Observacion ?? (listaCiclos.Count > 1 ? $"Pago Unificado Multi-Semana ({string.Join("+", listaCiclos)})" : "Pago registrado desde Pre-Liquidación");

                    var sqlInsertPago = @"
                        INSERT INTO TB_PAGOS_LIQUIDACION (
                            CicloId, CicloNombre, FechaInicioCiclo, FechaFinCiclo,
                            FincaId, FincaNombre, Propietario, CedulaRIF, BancoNombre, NumeroCuenta,
                            TotalLitros, TotalLitrosBuenos, TotalLitrosAcidos,
                            PrecioLitroUSD, PrecioLitroAcidaUSD, TotalUSD, TasaBcv, TotalBrutoBs,
                            TotalAdelantosUSD, TotalAdelantosBs, CuotasDetalle, CanceladoTotalAdelanto,
                            OtrasDeduccionesBs, ConceptoDeducciones, TotalNetoBs,
                            EstadoPago, FechaPago, UsuarioId, Observacion, CreatedAt
                        ) VALUES (
                            @cicloId, @cicloNombre, @fInicio, @fFin,
                            @FincaId, @fincaNombre, @propietario, @cedulaRIF, @bancoNombre, @numeroCuenta,
                            @totalLitros, @litrosBuenos, @litrosAcidos,
                            @precioGoodUSD, @precioAcidaUSD, @totalUSD, @tasaActual, @totalBrutoBs,
                            @adelantoCicloUSD, @adelantoCicloBs, @cuotasDetalle, @canceladoTotalAdelanto,
                            @otrasDeduccionesBs, @conceptoDeducciones, @totalNetoBs,
                            'PAGADO', GETDATE(), @usuarioId, @observacion, GETDATE()
                        );";

                    await connection.ExecuteAsync(sqlInsertPago, new {
                        cicloId, cicloNombre, fInicio, fFin,
                        dto.FincaId, fincaNombre, propietario, cedulaRIF, bancoNombre, numeroCuenta,
                        totalLitros, litrosBuenos, litrosAcidos,
                        precioGoodUSD, precioAcidaUSD, totalUSD, tasaActual, totalBrutoBs,
                        adelantoCicloUSD, adelantoCicloBs, cuotasDetalle, canceladoTotalAdelanto,
                        otrasDeduccionesBs, conceptoDeducciones, totalNetoBs,
                        usuarioId, observacion
                    }, transaction);

                    // Sincronizar tasa aplicada a las rutas recolectadas de este ciclo
                    await connection.ExecuteAsync(@"
                        UPDATE TB_RUTAS_RECOLECCION
                        SET TasaDolarBsAplicada = @tasaActual
                        WHERE FincaId = @FincaId AND CicloId = @cicloId",
                        new { dto.FincaId, cicloId, tasaActual }, transaction);

                    // Registrar log general de pago de liquidación para el ciclo
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_LOGS_PAGOS_LIQUIDACION (
                            Accion, FincaId, FincaNombre, CicloId, CicloNombre,
                            TotalLitros, TotalUSD, TasaBcv, TotalBrutoBs,
                            TotalAdelantosUSD, TotalAdelantosBs, TotalNetoBs,
                            Detalle, UsuarioId, Fecha
                        ) VALUES (
                            'PAGO_LIQUIDACION', @FincaId, @fincaNombre, @cicloId, @cicloNombre,
                            @totalLitros, @totalUSD, @tasaActual, @totalBrutoBs,
                            @adelantoCicloUSD, @adelantoCicloBs, @totalNetoBs,
                            @observacion, @usuarioId, GETDATE()
                        )", new {
                            dto.FincaId, fincaNombre, cicloId, cicloNombre,
                            totalLitros, totalUSD, tasaActual, totalBrutoBs,
                            adelantoCicloUSD, adelantoCicloBs, totalNetoBs,
                            observacion, usuarioId
                        }, transaction);
                }

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<IEnumerable<PagoLiquidacionHistorialDto>> ObtenerHistorialPagosLiquidacionAsync(
            int? cicloId = null, int? fincaId = null, DateTime? desde = null, DateTime? hasta = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT * FROM TB_PAGOS_LIQUIDACION
                WHERE (@cicloId IS NULL OR CicloId = @cicloId)
                  AND (@fincaId IS NULL OR FincaId = @fincaId)
                  AND (@desde IS NULL OR FechaPago >= @desde)
                  AND (@hasta IS NULL OR FechaPago <= @hasta)
                ORDER BY FechaPago DESC, Id DESC";

            return await connection.QueryAsync<PagoLiquidacionHistorialDto>(sql, new { cicloId, fincaId, desde, hasta });
        }

        public async Task<IEnumerable<dynamic>> ObtenerLogsPagosLiquidacionAsync(int? fincaId = null, int? cicloId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT TOP 300 
                    l.Id, l.Fecha, l.Accion, l.FincaId, ISNULL(l.FincaNombre, f.Nombre) AS FincaNombre,
                    l.CicloId, ISNULL(l.CicloNombre, CONCAT('Semana ', l.CicloId)) AS CicloNombre,
                    l.TotalLitros, l.TotalUSD, l.TasaBcv, l.TotalBrutoBs,
                    l.TotalAdelantosUSD, l.TotalAdelantosBs, l.TotalNetoBs,
                    l.CuotaId, l.AdelantoId, l.NumeroCuota, l.MontoCuotaUSD, l.MontoCuotaBs,
                    l.Detalle, l.UsuarioId, ISNULL(u.NombreCompleto, ISNULL(u.Username, 'SISTEMA')) AS UsuarioNombre
                FROM TB_LOGS_PAGOS_LIQUIDACION l
                LEFT JOIN TB_FINCAS f ON l.FincaId = f.Id
                LEFT JOIN TB_USUARIOS u ON l.UsuarioId = u.Id
                WHERE (@fincaId IS NULL OR l.FincaId = @fincaId)
                  AND (@cicloId IS NULL OR l.CicloId = @cicloId)
                ORDER BY l.Fecha DESC, l.Id DESC";

            return await connection.QueryAsync<dynamic>(sql, new { fincaId, cicloId });
        }

        public async Task<EmpresaConfigDto> ObtenerEmpresaConfigAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT TOP 1 
                    Id, Nombre, Rif, Direccion, Telefono, Email, LogoUrl, FechaActualizacion,
                    FechaVencimientoLicencia, ModulosHabilitados
                FROM TB_EMPRESA_CONFIG
                ORDER BY Id ASC";
            var config = await connection.QueryFirstOrDefaultAsync<EmpresaConfigDto>(sql);
            if (config == null)
            {
                string tenantName = _tenantService?.GetTenantName() ?? "";
                config = new EmpresaConfigDto
                {
                    Nombre = tenantName,
                    NombreEmpresa = tenantName,
                    Rif = "",
                    Direccion = "",
                    Telefono = "",
                    Email = "",
                    LogoUrl = "",
                    FechaVencimientoLicencia = DateTime.UtcNow.AddYears(1)
                };
            }
            else
            {
                config.NombreEmpresa = config.Nombre;
                if (!config.FechaVencimientoLicencia.HasValue)
                {
                    config.FechaVencimientoLicencia = DateTime.UtcNow.AddYears(1);
                }
            }
            return config;
        }

        public async Task<bool> ActualizarLicenciaAsync(DateTime fechaVencimiento)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                IF EXISTS (SELECT 1 FROM TB_EMPRESA_CONFIG WHERE Id = 1)
                BEGIN
                    UPDATE TB_EMPRESA_CONFIG
                    SET FechaVencimientoLicencia = @fechaVencimiento,
                        FechaActualizacion = GETDATE()
                    WHERE Id = 1;
                END
                ELSE
                BEGIN
                    INSERT INTO TB_EMPRESA_CONFIG (Nombre, FechaVencimientoLicencia, FechaActualizacion)
                    VALUES ('Empresa', @fechaVencimiento, GETDATE());
                END";
            var rows = await connection.ExecuteAsync(sql, new { fechaVencimiento });

            try
            {
                string tenantCode = _tenantService?.GetTenantCode() ?? "";
                if (!string.IsNullOrWhiteSpace(tenantCode))
                {
                    string masterConn = "Server=84.247.178.194,1433;Database=DB_SAAS_MASTER;User Id=sa;Password=sql_HO_2026!;TrustServerCertificate=True;";
                    using var masterDb = new SqlConnection(masterConn);
                    await masterDb.ExecuteAsync(
                        "UPDATE TB_EMPRESAS SET FechaVencimientoLicencia = @fechaVencimiento WHERE Codigo = @tenantCode",
                        new { fechaVencimiento, tenantCode });
                }
            }
            catch { }

            return rows > 0;
        }

        public async Task<bool> GuardarEmpresaConfigAsync(EmpresaConfigDto dto)
        {
            if (!string.IsNullOrWhiteSpace(dto.NombreEmpresa))
                dto.Nombre = dto.NombreEmpresa;

            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                IF EXISTS (SELECT 1 FROM TB_EMPRESA_CONFIG WHERE Id = @Id OR Id = 1)
                BEGIN
                    UPDATE TB_EMPRESA_CONFIG
                    SET Nombre = @Nombre,
                        Rif = @Rif,
                        Direccion = @Direccion,
                        Telefono = @Telefono,
                        Email = @Email,
                        LogoUrl = @LogoUrl,
                        FechaActualizacion = GETDATE()
                    WHERE Id = 1 OR Id = @Id;
                END
                ELSE
                BEGIN
                    INSERT INTO TB_EMPRESA_CONFIG (Nombre, Rif, Direccion, Telefono, Email, LogoUrl, FechaActualizacion)
                    VALUES (@Nombre, @Rif, @Direccion, @Telefono, @Email, @LogoUrl, GETDATE());
                END";
            var rows = await connection.ExecuteAsync(sql, dto);

            // Sincronizar en DB_SAAS_MASTER si aplica para que el nombre persista en multitenant
            try
            {
                string tenantCode = _tenantService?.GetTenantCode() ?? "";
                if (!string.IsNullOrWhiteSpace(tenantCode) && !string.IsNullOrWhiteSpace(dto.Nombre))
                {
                    string masterConn = "Server=84.247.178.194,1433;Database=DB_SAAS_MASTER;User Id=sa;Password=sql_HO_2026!;TrustServerCertificate=True;";
                    using var masterDb = new SqlConnection(masterConn);
                    await masterDb.ExecuteAsync(
                        "UPDATE TB_EMPRESAS SET NombreComercial = @Nombre WHERE Codigo = @tenantCode",
                        new { dto.Nombre, tenantCode });
                }
            }
            catch { }

            return rows > 0;
        }
    }

    public interface ICiclosRepository
    {
        Task<IEnumerable<SemanaDetalleDto>> ObtenerSemanasAsync();
        Task<SemanaDetalleDto?> ObtenerCicloActivoAsync();
        Task<int> CrearSemanaAsync(CrearCicloDto dto);
        Task<bool> EditarSemanaAsync(int id, EditarCicloDto dto);
        Task<bool> Generar52SemanasAsync(Generar52SemanasDto dto);
        Task<bool> ActivarSemanaAsync(int id, decimal? stockInicialPersonalizado = null);
        Task<bool> CerrarSemanaAsync(int id, decimal? stockFinalTanques = null);
        Task<decimal> ObtenerBalanceTanqueCicloAsync(int cicloId);
        Task<ResumenCierreCicloDto> ObtenerResumenCierreAsync(int cicloId);
        Task<ValidacionActivacionCicloDto> ValidarActivacionCicloAsync(int cicloId);
        Task<bool> ReabrirSemanaAsync(int id, string motivo, int usuarioId, string usuarioNombre);
        Task<bool> ActualizarStockInicialAsync(int cicloId, decimal stockInicial);
    }

    public class CiclosRepository : ICiclosRepository
    {
        private readonly string _connectionString;
        public CiclosRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        
        public async Task<SemanaDetalleDto?> ObtenerCicloActivoAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT TOP 1 
                    c.Id,
                    CASE 
                        WHEN c.Codigo IS NULL OR c.Codigo = '' OR c.Codigo LIKE '%(%)%' OR c.Codigo LIKE '%# ()%' OR c.Codigo LIKE '%()%'
                        THEN 'Semana ' + CAST(DATEPART(isowk, c.FechaInicio) AS varchar) + ' (' + CAST(YEAR(c.FechaInicio) AS varchar) + ')'
                        ELSE c.Codigo 
                    END AS Codigo,
                    c.FechaInicio,
                    c.FechaFin,
                    c.Estado,
                    DATEPART(isowk, c.FechaInicio) AS NumeroSemana,
                    YEAR(c.FechaInicio) AS Anio,
                    ISNULL(SUM(r.Litros), 0) AS TotalLitros,
                    ISNULL(SUM(r.Litros * ISNULL(r.PrecioLitroUSDAplicado, 0)), 0) AS TotalMontoUSD,
                    ISNULL(SUM(r.Litros * ISNULL(r.PrecioLitroUSDAplicado, 0) * ISNULL(r.TasaDolarBsAplicada, 0)), 0) AS TotalBrutoBs,
                    COUNT(DISTINCT r.FincaId) AS TotalFincasParticipantes,
                    0 AS TotalCompaniasParticipantes,
                    c.Observaciones AS Observaciones,
                    ISNULL(c.StockInicialTanques, 0) AS StockInicialTanques,
                    c.StockFinalTanques AS StockFinalTanques
                FROM TB_CICLOS_OPERATIVOS c
                LEFT JOIN TB_RUTAS_RECOLECCION r ON c.Id = r.CicloId
                WHERE c.Estado = 'ABIERTO'
                GROUP BY c.Id, c.Codigo, c.FechaInicio, c.FechaFin, c.Estado, c.Observaciones, c.StockInicialTanques, c.StockFinalTanques
                ORDER BY c.FechaInicio DESC, c.Id DESC";

            return await connection.QueryFirstOrDefaultAsync<SemanaDetalleDto>(sql);
        }

        public async Task<IEnumerable<SemanaDetalleDto>> ObtenerSemanasAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                WITH RecoleccionesPorCiclo AS (
                    SELECT 
                        CicloId,
                        SUM(Litros) AS TotalLitros,
                        SUM(Litros * ISNULL(PrecioLitroUSDAplicado, 0)) AS TotalMontoUSD,
                        SUM(Litros * ISNULL(PrecioLitroUSDAplicado, 0) * ISNULL(TasaDolarBsAplicada, 0)) AS TotalBrutoBs,
                        COUNT(DISTINCT FincaId) AS TotalFincasParticipantes
                    FROM TB_RUTAS_RECOLECCION
                    WHERE CicloId IS NOT NULL
                    GROUP BY CicloId
                )
                SELECT 
                    c.Id,
                    CASE 
                        WHEN c.Codigo IS NULL OR c.Codigo = '' OR c.Codigo LIKE '%(%)%' OR c.Codigo LIKE '%# ()%' OR c.Codigo LIKE '%()%'
                        THEN 'Semana ' + CAST(DATEPART(isowk, c.FechaInicio) AS varchar) + ' (' + CAST(YEAR(c.FechaInicio) AS varchar) + ')'
                        ELSE c.Codigo 
                    END AS Codigo,
                    c.FechaInicio,
                    c.FechaFin,
                    c.Estado,
                    DATEPART(isowk, c.FechaInicio) AS NumeroSemana,
                    YEAR(c.FechaInicio) AS Anio,
                    ISNULL(r.TotalLitros, 0) AS TotalLitros,
                    ISNULL(r.TotalMontoUSD, 0) AS TotalMontoUSD,
                    ISNULL(r.TotalBrutoBs, 0) AS TotalBrutoBs,
                    ISNULL(r.TotalFincasParticipantes, 0) AS TotalFincasParticipantes,
                    0 AS TotalCompaniasParticipantes,
                    c.Observaciones AS Observaciones,
                    ISNULL(c.StockInicialTanques, 0) AS StockInicialTanques,
                    c.StockFinalTanques AS StockFinalTanques
                FROM TB_CICLOS_OPERATIVOS c
                LEFT JOIN RecoleccionesPorCiclo r ON c.Id = r.CicloId
                ORDER BY CASE WHEN c.Estado = 'ABIERTO' THEN 0 ELSE 1 END, c.FechaInicio DESC";

            return await connection.QueryAsync<SemanaDetalleDto>(sql);
        }

        public async Task<bool> EditarSemanaAsync(int id, EditarCicloDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            var semana = await connection.QueryFirstOrDefaultAsync<CicloOperativo>("SELECT * FROM TB_CICLOS_OPERATIVOS WHERE Id = @id", new { id });
            if (semana == null || semana.Estado == "CERRADO") return false;

            var sql = @"
                UPDATE TB_CICLOS_OPERATIVOS 
                SET Codigo = @codigo, 
                    FechaInicio = @fechaInicio, 
                    FechaFin = @fechaFin, 
                    Observaciones = @observaciones,
                    UpdatedAt = GETDATE()
                WHERE Id = @id";

            var rows = await connection.ExecuteAsync(sql, new
            {
                id,
                codigo = dto.Codigo,
                fechaInicio = dto.FechaInicio.Date,
                fechaFin = dto.FechaFin.Date,
                observaciones = dto.Observaciones
            });

            return rows > 0;
        }

        public async Task<int> CrearSemanaAsync(CrearCicloDto dto)
        {
            using var connection = new SqlConnection(_connectionString);

            decimal stockIni = dto.StockInicialTanques ?? 0m;
            if (stockIni == 0m)
            {
                stockIni = await connection.ExecuteScalarAsync<decimal?>(
                    "SELECT TOP 1 ISNULL(StockFinalTanques, 0) FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'CERRADO' ORDER BY Id DESC") ?? 0m;
            }

            var sql = @"
                INSERT INTO TB_CICLOS_OPERATIVOS (Codigo, FechaInicio, FechaFin, Estado, StockInicialTanques, Observaciones, CreatedAt)
                VALUES (@codigo, @fechaInicio, @fechaFin, 'PROGRAMADO', @stockIni, @observaciones, GETDATE());
                SELECT CAST(SCOPE_IDENTITY() as int);";

            return await connection.ExecuteScalarAsync<int>(sql, new
            {
                codigo = dto.Codigo,
                fechaInicio = dto.FechaInicio.Date,
                fechaFin = dto.FechaFin.Date,
                stockIni,
                observaciones = dto.Observaciones
            });
        }

        public async Task<bool> Generar52SemanasAsync(Generar52SemanasDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            DateTime cursor = new DateTime(dto.Anio, 1, 1);
            int diff = ((int)dto.DiaInicio - (int)cursor.DayOfWeek + 7) % 7;
            cursor = cursor.AddDays(diff);

            for (int semanaNum = 1; semanaNum <= 52; semanaNum++)
            {
                DateTime fIni = cursor;
                DateTime fFin = cursor.AddDays(6);
                string codigo = $"Semana {semanaNum:D2} ({dto.Anio})";

                var existe = await connection.ExecuteScalarAsync<int>(
                    "SELECT COUNT(1) FROM TB_CICLOS_OPERATIVOS WHERE (FechaInicio = @fIni AND FechaFin = @fFin) OR Codigo = @codigo",
                    new { fIni, fFin, codigo });

                if (existe == 0)
                {
                    string estado = (semanaNum == 1) ? "ABIERTO" : "PROGRAMADO";
                    var sql = @"
                        INSERT INTO TB_CICLOS_OPERATIVOS (Codigo, FechaInicio, FechaFin, Estado, Observaciones, CreatedAt)
                        VALUES (@codigo, @fIni, @fFin, @estado, @obs, GETDATE());";

                    await connection.ExecuteAsync(sql, new
                    {
                        codigo,
                        fIni,
                        fFin,
                        estado,
                        obs = $"Semana generada automáticamente para el año {dto.Anio}"
                    });
                }

                cursor = cursor.AddDays(7);
            }

            return true;
        }

        public async Task<bool> ActivarSemanaAsync(int id, decimal? stockInicialPersonalizado = null)
        {
            using var connection = new SqlConnection(_connectionString);
            
            // Verificar cuántas semanas están actualmente ABIERTAS (distintas a la actual)
            int abiertas = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' AND Id != @id", new { id });
            
            if (abiertas >= 3)
            {
                throw new InvalidOperationException("No se pueden tener más de 3 semanas operativas abiertas simultáneamente. Por favor cierre alguna semana antes de abrir otra.");
            }

            var sql = @"
                DECLARE @fIniActual DATE = (SELECT FechaInicio FROM TB_CICLOS_OPERATIVOS WHERE Id = @id);
                DECLARE @stockPrevio DECIMAL(18,2) = (
                    SELECT TOP 1 ISNULL(StockFinalTanques, 0) 
                    FROM TB_CICLOS_OPERATIVOS 
                    WHERE Estado = 'CERRADO' AND FechaFin <= @fIniActual 
                    ORDER BY FechaFin DESC
                );
                
                UPDATE TB_CICLOS_OPERATIVOS 
                SET Estado = 'ABIERTO',
                    StockInicialTanques = CASE 
                        WHEN @stockInicialPersonalizado IS NOT NULL THEN @stockInicialPersonalizado
                        WHEN (StockInicialTanques IS NULL OR StockInicialTanques = 0) AND @stockPrevio IS NOT NULL AND @stockPrevio > 0 
                        THEN @stockPrevio 
                        ELSE StockInicialTanques 
                    END
                WHERE Id = @id;";

            var rows = await connection.ExecuteAsync(sql, new { id, stockInicialPersonalizado });
            return rows > 0;
        }

        public async Task<ResumenCierreCicloDto> ObtenerResumenCierreAsync(int cicloId)
        {
            using var connection = new SqlConnection(_connectionString);

            var ciclo = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                "SELECT * FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloId", new { cicloId });

            if (ciclo == null)
            {
                throw new InvalidOperationException("El ciclo operativo especificado no existe.");
            }

            decimal stockInicial = ciclo.StockInicialTanques ?? 0m;

            // Recolección en Fincas
            decimal recolectadoFincas = await connection.ExecuteScalarAsync<decimal>(
                "SELECT ISNULL(SUM(Litros), 0) FROM TB_RUTAS_RECOLECCION WHERE CicloId = @cicloId", new { cicloId });

            // Entradas a Receptoría
            var sqlEntradas = @"
                SELECT ISNULL(SUM(e.Litros), 0)
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                WHERE e.CicloId = @cicloId
                  AND (UPPER(c.Nombre) LIKE '%RECEPTORIA%' OR UPPER(c.Nombre) LIKE '%RECEPTORÍA%')";
            decimal entradasReceptoria = await connection.ExecuteScalarAsync<decimal>(sqlEntradas, new { cicloId });

            // Despachos a Compañías
            var sqlSalidas = @"
                SELECT ISNULL(SUM(COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0)), 0)
                FROM TB_CONTROL_COMPANIAS cc
                INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE cc.CicloId = @cicloId
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORIA%'
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORÍA%'";
            decimal salidasCompanias = await connection.ExecuteScalarAsync<decimal>(sqlSalidas, new { cicloId });

            // Merma de Rutas
            decimal merma = await connection.ExecuteScalarAsync<decimal>(
                "SELECT ISNULL(SUM(DiferenciaLitros), 0) FROM TB_CONTROL_RUTAS WHERE CicloId = @cicloId", new { cicloId });

            decimal balance = stockInicial + entradasReceptoria - salidasCompanias;
            if (balance < 0) balance = 0m;

            // Identificar el siguiente ciclo cronológico
            var nextCiclo = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                "SELECT TOP 1 * FROM TB_CICLOS_OPERATIVOS WHERE FechaInicio > @FechaFin ORDER BY FechaInicio ASC",
                new { ciclo.FechaFin });

            if (nextCiclo == null)
            {
                nextCiclo = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                    "SELECT TOP 1 * FROM TB_CICLOS_OPERATIVOS WHERE Id > @Id ORDER BY Id ASC",
                    new { ciclo.Id });
            }

            return new ResumenCierreCicloDto
            {
                CicloId = ciclo.Id,
                Codigo = ciclo.Codigo,
                FechaInicio = ciclo.FechaInicio,
                FechaFin = ciclo.FechaFin,
                StockInicialTanques = stockInicial,
                TotalRecolectadoFincas = recolectadoFincas,
                TotalEntregasReceptoria = entradasReceptoria,
                TotalDespachosCompanias = salidasCompanias,
                TotalMerma = merma,
                BalanceCalculadoTanque = balance,
                SiguienteCicloId = nextCiclo?.Id,
                SiguienteCicloCodigo = nextCiclo?.Codigo,
                SiguienteCicloFechaInicio = nextCiclo?.FechaInicio,
                SiguienteCicloFechaFin = nextCiclo?.FechaFin
            };
        }

        public async Task<ValidacionActivacionCicloDto> ValidarActivacionCicloAsync(int cicloId)
        {
            using var connection = new SqlConnection(_connectionString);

            var cicloAActivar = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                "SELECT * FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloId", new { cicloId });

            if (cicloAActivar == null)
            {
                throw new InvalidOperationException("El ciclo operativo a activar no existe.");
            }

            // Buscar el último ciclo CERRADO
            var ultimoCerrado = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                "SELECT TOP 1 * FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'CERRADO' ORDER BY FechaFin DESC, Id DESC");

            if (ultimoCerrado == null)
            {
                // No hay ciclos previos cerrados, no hay conflicto de secuencia
                return new ValidacionActivacionCicloDto
                {
                    CicloAActivarId = cicloAActivar.Id,
                    CicloAActivarCodigo = cicloAActivar.Codigo,
                    EsSecuenciaCorrecta = true
                };
            }

            // Buscar el ciclo siguiente esperado cronológicamente después del último cerrado
            var cicloEsperado = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                "SELECT TOP 1 * FROM TB_CICLOS_OPERATIVOS WHERE FechaInicio > @FechaFin ORDER BY FechaInicio ASC",
                new { ultimoCerrado.FechaFin });

            if (cicloEsperado == null)
            {
                cicloEsperado = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                    "SELECT TOP 1 * FROM TB_CICLOS_OPERATIVOS WHERE Id > @Id ORDER BY Id ASC",
                    new { ultimoCerrado.Id });
            }

            decimal stockRemanente = ultimoCerrado.StockFinalTanques ?? 0m;
            bool esSecuenciaCorrecta = (cicloEsperado == null || cicloEsperado.Id == cicloAActivar.Id);

            string? mensaje = null;
            if (!esSecuenciaCorrecta && cicloEsperado != null)
            {
                mensaje = $"El último ciclo cerrado fue '{ultimoCerrado.Codigo}' (con {stockRemanente:N0} Lts que quedaron en tanque). El siguiente ciclo correlativo debería ser '{cicloEsperado.Codigo}', pero estás intentando activar '{cicloAActivar.Codigo}'.";
            }

            return new ValidacionActivacionCicloDto
            {
                CicloAActivarId = cicloAActivar.Id,
                CicloAActivarCodigo = cicloAActivar.Codigo,
                UltimoCicloCerradoId = ultimoCerrado.Id,
                UltimoCicloCerradoCodigo = ultimoCerrado.Codigo,
                UltimoCicloCerradoStockFinal = stockRemanente,
                CicloSiguienteEsperadoId = cicloEsperado?.Id,
                CicloSiguienteEsperadoCodigo = cicloEsperado?.Codigo,
                EsSecuenciaCorrecta = esSecuenciaCorrecta,
                MensajeAdvertencia = mensaje
            };
        }

        public async Task<decimal> ObtenerBalanceTanqueCicloAsync(int cicloId)
        {
            using var connection = new SqlConnection(_connectionString);
            
            var stockInicial = await connection.ExecuteScalarAsync<decimal?>(
                "SELECT ISNULL(StockInicialTanques, 0) FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloId", new { cicloId }) ?? 0m;

            var sqlEntradas = @"
                SELECT ISNULL(SUM(e.Litros), 0)
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                WHERE e.CicloId = @cicloId
                  AND (UPPER(c.Nombre) LIKE '%RECEPTORIA%' OR UPPER(c.Nombre) LIKE '%RECEPTORÍA%')";
            var entradas = await connection.ExecuteScalarAsync<decimal>(sqlEntradas, new { cicloId });

            var sqlSalidas = @"
                SELECT ISNULL(SUM(COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0)), 0)
                FROM TB_CONTROL_COMPANIAS cc
                INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE cc.CicloId = @cicloId
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORIA%'
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORÍA%'";
            var salidas = await connection.ExecuteScalarAsync<decimal>(sqlSalidas, new { cicloId });

            var balance = stockInicial + entradas - salidas;
            return balance >= 0 ? balance : 0m;
        }

        public async Task<bool> CerrarSemanaAsync(int id, decimal? stockFinalTanques = null)
        {
            using var connection = new SqlConnection(_connectionString);

            if (!stockFinalTanques.HasValue)
            {
                stockFinalTanques = await ObtenerBalanceTanqueCicloAsync(id);
            }

            var sql = @"
                UPDATE TB_CICLOS_OPERATIVOS 
                SET Estado = 'CERRADO', 
                    FechaCierre = GETDATE(), 
                    StockFinalTanques = @stockFinalTanques 
                WHERE Id = @id;

                -- Heredar automáticamente el Stock Final como Stock Inicial del siguiente ciclo operativo cronológicamente
                DECLARE @fFinActual DATE = (SELECT FechaFin FROM TB_CICLOS_OPERATIVOS WHERE Id = @id);
                DECLARE @nextId INT = (SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE FechaInicio > @fFinActual ORDER BY FechaInicio ASC);
                IF @nextId IS NULL
                BEGIN
                    SET @nextId = (SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @id ORDER BY Id ASC);
                END

                IF @nextId IS NOT NULL AND @stockFinalTanques IS NOT NULL
                BEGIN
                    UPDATE TB_CICLOS_OPERATIVOS 
                    SET StockInicialTanques = @stockFinalTanques 
                    WHERE Id = @nextId;
                END
            ";
            var rows = await connection.ExecuteAsync(sql, new { id, stockFinalTanques });
            return rows > 0;
        }

        public async Task<bool> ReabrirSemanaAsync(int id, string motivo, int usuarioId, string usuarioNombre)
        {
            using var connection = new SqlConnection(_connectionString);

            // Validar que no haya más de 3 semanas abiertas simultáneamente
            int abiertas = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' AND Id != @id", new { id });

            if (abiertas >= 3)
            {
                throw new InvalidOperationException("No se pueden tener más de 3 semanas operativas abiertas simultáneamente. Cierre al menos una semana antes de reabrir esta.");
            }

            var motivoLimpio = string.IsNullOrWhiteSpace(motivo) ? "Reapertura de ciclo operativo para ajustes y tickets rezagados" : motivo.Trim();
            var logEntry = $"[REAPERTURA {DateTime.Now:yyyy-MM-dd HH:mm} por {usuarioNombre}]: {motivoLimpio}";

            var sql = @"
                UPDATE TB_CICLOS_OPERATIVOS 
                SET Estado = 'ABIERTO',
                    Observaciones = CASE 
                        WHEN Observaciones IS NULL OR Observaciones = '' THEN @logEntry
                        ELSE CONCAT(Observaciones, CHAR(13), CHAR(10), @logEntry)
                    END
                WHERE Id = @id;

                INSERT INTO TB_LOGS_CICLOS_OPERATIVOS (CicloId, Accion, Motivo, UsuarioId, UsuarioNombre, Fecha)
                VALUES (@id, 'REAPERTURA', @motivoLimpio, @usuarioId, @usuarioNombre, GETDATE());
            ";

            var rows = await connection.ExecuteAsync(sql, new { id, logEntry, motivoLimpio, usuarioId, usuarioNombre });
            return rows > 0;
        }

        public async Task<bool> ActualizarStockInicialAsync(int cicloId, decimal stockInicial)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = "UPDATE TB_CICLOS_OPERATIVOS SET StockInicialTanques = @stockInicial WHERE Id = @cicloId";
            var rows = await connection.ExecuteAsync(sql, new { cicloId, stockInicial });
            return rows > 0;
        }
    }

    public interface IEntregasRepository
    {
        Task<IEnumerable<EntregaItemDto>> ObtenerEntregasHoyAsync(int usuarioId, string rol, DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, int? cicloId = null);
        Task<int> RegistrarEntregaAsync(RegistrarEntregaDto dto, int conductorId, string rol = "CHOFER");
        Task<bool> EditarEntregaAsync(int entregaId, EditarEntregaDto dto, int usuarioId, string rol);
        Task<bool> EliminarEntregaAsync(int entregaId, int usuarioId, string rol);
        Task<BalanceVolumetricoDto> ObtenerBalanceVolumetricoAsync(int? cicloId = null, DateTime? fechaInicio = null, DateTime? fechaFin = null);
        Task<ControlTanquesDiarioDto?> ObtenerControlTanquesDiarioAsync(DateTime fecha, string rol);
        Task<int> GuardarControlTanquesDiarioAsync(ControlTanquesDiarioDto dto, int userId, string userName, string rol);
        Task<bool> ConfirmarAperturaTanquesAsync(DateTime fecha, int userId, string userName, string rol);
        Task<bool> ConfirmarCierreTanquesAsync(DateTime fecha, int userId, string userName, string rol);
    }

    public class EntregasRepository : IEntregasRepository
    {
        private readonly string _connectionString;
        public EntregasRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        public async Task<IEnumerable<EntregaItemDto>> ObtenerEntregasHoyAsync(int usuarioId, string rol, DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, int? cicloId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            string whereFilter;
            object param;

            if (cicloId.HasValue && cicloId.Value > 0)
            {
                whereFilter = "e.CicloId = @cicloId";
                param = new { cicloId = cicloId.Value, usuarioId, rol };
            }
            else if (fechaInicio.HasValue && fechaFin.HasValue)
            {
                whereFilter = "e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin";
                param = new { fechaInicio = fechaInicio.Value.Date, fechaFin = fechaFin.Value.Date, usuarioId, rol };
            }
            else
            {
                var fechaConsulta = (fecha ?? DateTime.Today).Date;
                whereFilter = "e.Fecha = @fechaConsulta";
                param = new { fechaConsulta, usuarioId, rol };
            }

            var sql = $@"
                SELECT 
                    e.Id AS Id,
                    e.Fecha AS Fecha,
                    e.CompaniaId AS CompaniaId,
                    c.Nombre AS CompaniaNombre,
                    c.Encargado AS Encargado,
                    ISNULL(c.TipoServicioId, 1) AS TipoServicioId,
                    e.UsuarioId AS ConductorId,
                    u.NombreCompleto AS ConductorNombre,
                    u.NombreCompleto AS ChoferNombre,
                    COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), e.Litros) AS Litros,
                    e.Observacion AS Observacion,
                    e.ControlRutaId AS ControlRutaId,
                    e.ControlCompaniaId AS ControlCompaniaId,
                    ISNULL(cc.LitrosDespachados, cr.TotalLitrosFinca) AS TotalLitrosOrigen,
                    cr.TotalLitrosFinca AS LitrosFinca,
                    cr.LitrosCargadosAdicional AS LitrosCargadosAdicional,
                    ISNULL(cc.DiferenciaLitros, cr.DiferenciaLitros) AS DiferenciaLitros,
                    ISNULL(cc.PorcentajeMerma, cr.PorcentajeMerma) AS PorcentajeMerma,
                    ISNULL(cr.TipoDestino, CASE WHEN c.Nombre LIKE '%RECEPTORIA%' THEN 'RECEPTORIA' ELSE 'PLANTA' END) AS TipoDestino,
                    ISNULL(cc.Estado, cr.Estado) AS EstadoViaje,
                    CASE 
                        WHEN @rol IN ('ADMIN', 'SUPERADMIN') THEN 1
                        WHEN e.ControlRutaId IS NOT NULL AND EXISTS (
                            SELECT 1 FROM TB_CONTROL_RUTAS cr2 WHERE cr2.Id = e.ControlRutaId AND (cr2.Estado IN ('FINALIZADO', 'CERRADO') OR cr2.ProcesoActualId = 4)
                        ) THEN 0
                        WHEN e.ControlCompaniaId IS NOT NULL OR e.Observacion LIKE '%Control Compañías #%' THEN 0
                        WHEN e.UsuarioId = @usuarioId AND CAST(e.Fecha AS DATE) = CAST(GETDATE() AS DATE)
                             AND NOT EXISTS (
                                 SELECT 1 FROM TB_CONTROL_RUTAS cr2 
                                 WHERE (cr2.Id = e.ControlRutaId OR (cr2.UsuarioId = e.UsuarioId AND CAST(cr2.Fecha AS DATE) = CAST(e.Fecha AS DATE)))
                                   AND (cr2.ProcesoActualId > 1 OR cr2.Estado IN ('RECIBIDO', 'ENTREGADO', 'FINALIZADO', 'CERRADO'))
                             ) THEN 1
                        ELSE 0
                    END AS PuedeModificar
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                INNER JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON e.ControlRutaId = cr.Id
                OUTER APPLY (
                    SELECT TOP 1 cc2.LitrosDespachados, cc2.LitrosRecibidosCompania, cc2.DiferenciaLitros, cc2.PorcentajeMerma, cc2.Estado
                    FROM TB_CONTROL_COMPANIAS cc2
                    WHERE (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                       OR (e.ControlCompaniaId IS NULL AND (
                           e.Observacion LIKE '%Control Compañías #' + CAST(cc2.Id AS VARCHAR) + '.%'
                           OR e.Observacion LIKE '%Control Companias #' + CAST(cc2.Id AS VARCHAR) + '.%'
                           OR e.Observacion LIKE '%Control Compañías #' + CAST(cc2.Id AS VARCHAR) + '%'
                           OR e.Observacion LIKE '%Control Companias #' + CAST(cc2.Id AS VARCHAR) + '%'
                           OR e.Observacion LIKE 'Entrega #' + CAST(cc2.Id AS VARCHAR) + '%'
                           OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId = e.ControlRutaId AND cc2.CompaniaId = e.CompaniaId)
                           OR (e.ControlRutaId IS NULL AND cc2.UsuarioId = e.UsuarioId AND CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE) AND cc2.CompaniaId = e.CompaniaId)
                       ))
                    ORDER BY cc2.Id DESC
                ) cc
                WHERE {whereFilter}
                " + (rol == "CHOFER" ? " AND e.UsuarioId = @usuarioId " : "") + @"
                ORDER BY e.Fecha ASC, ISNULL(e.ControlRutaId, 0) ASC, e.Id ASC";

            return await connection.QueryAsync<EntregaItemDto>(sql, param);
        }

        public async Task<int> RegistrarEntregaAsync(RegistrarEntregaDto dto, int conductorId, string rol = "CHOFER")
        {
            using var connection = new SqlConnection(_connectionString);
            var fechaEntrega = dto.Fecha.Date;
            int choferEfectivo;
            if (rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) || rol.Equals("SUPERVISOR", StringComparison.OrdinalIgnoreCase))
            {
                if (!dto.ConductorId.HasValue || dto.ConductorId.Value <= 0)
                {
                    throw new InvalidOperationException("Debe seleccionar el conductor asignado para registrar la entrega.");
                }
                choferEfectivo = dto.ConductorId.Value;
            }
            else
            {
                choferEfectivo = conductorId;
            }

            var esAdmin = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM TB_USUARIOS WHERE Id = @choferEfectivo AND (RolId = 1 OR UPPER(Rol) = 'ADMIN')",
                new { choferEfectivo });
            if (esAdmin > 0)
            {
                throw new InvalidOperationException("El usuario seleccionado tiene rol Administrador y no puede ser asignado como conductor.");
            }

            if (rol == "CHOFER")
            {
                var ticket = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    @"SELECT ProcesoActualId, Estado 
                      FROM TB_CONTROL_RUTAS 
                      WHERE UsuarioId = @choferEfectivo AND CAST(Fecha AS DATE) = @fechaEntrega 
                      ORDER BY Id DESC",
                    new { choferEfectivo, fechaEntrega });

                if (ticket != null && (ticket.ProcesoActualId > 1 || ticket.Estado == "RECIBIDO" || ticket.Estado == "ENTREGADO" || ticket.Estado == "FINALIZADO" || ticket.Estado == "CERRADO"))
                {
                    throw new InvalidOperationException("El ticket del día ya fue recibido o finalizado. El chofer no puede registrar entregas.");
                }
            }

            var cicloSql = "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaEntrega BETWEEN FechaInicio AND FechaFin AND Estado = 'ABIERTO'";
            var cicloId = await connection.ExecuteScalarAsync<int?>(cicloSql, new { fechaEntrega });
            if (cicloId == null)
            {
                var cicloRecienteSql = "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC";
                cicloId = await connection.ExecuteScalarAsync<int?>(cicloRecienteSql);
                if (cicloId == null)
                    throw new Exception("No existe una semana operativa activa en el sistema.");
            }

            // Validación anti-duplicados (mismo chofer, misma compañía, misma fecha y mismos litros)
            var existeDuplicado = await connection.ExecuteScalarAsync<int>(
                @"SELECT COUNT(1) 
                  FROM TB_ENTREGAS_COMPANIA 
                  WHERE UsuarioId = @choferEfectivo 
                    AND CompaniaId = @companiaId 
                    AND CAST(Fecha AS DATE) = @fechaEntrega 
                    AND Litros = @litros",
                new { choferEfectivo, companiaId = dto.CompaniaId, fechaEntrega, litros = dto.Litros });

            if (existeDuplicado > 0)
            {
                throw new InvalidOperationException($"Ya existe una entrega registrada el {fechaEntrega:dd/MM/yyyy} para la compañía seleccionada por un monto de {dto.Litros:N0} Lts.");
            }

            var sqlInsert = @"
                INSERT INTO TB_ENTREGAS_COMPANIA 
                (CicloId, CompaniaId, UsuarioId, Fecha, Litros, Observacion, CreatedAt, CreatedBy)
                VALUES 
                (@cicloId, @companiaId, @conductorId, @fecha, @litros, @observacion, GETDATE(), @conductorId);
                SELECT CAST(SCOPE_IDENTITY() as int);";

            return await connection.ExecuteScalarAsync<int>(sqlInsert, new
            {
                cicloId,
                companiaId = dto.CompaniaId,
                conductorId = choferEfectivo,
                fecha = fechaEntrega,
                litros = dto.Litros,
                observacion = dto.Observacion
            });
        }

        public async Task<bool> EditarEntregaAsync(int entregaId, EditarEntregaDto dto, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var entrega = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_ENTREGAS_COMPANIA WHERE Id = @entregaId", new { entregaId });
            if (entrega == null) return false;

            int conductorActual = (int)entrega.UsuarioId;
            DateTime fechaActual = (DateTime)entrega.Fecha;

            if (rol == "CHOFER")
            {
                if (conductorActual != usuarioId)
                    throw new UnauthorizedAccessException("No tienes permiso para editar entregas de otros conductores.");

                var ticket = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    @"SELECT ProcesoActualId, Estado 
                      FROM TB_CONTROL_RUTAS 
                      WHERE UsuarioId = @conductorActual AND CAST(Fecha AS DATE) = @fechaActual 
                      ORDER BY Id DESC",
                    new { conductorActual, fechaActual = fechaActual.Date });

                if (ticket != null && (ticket.ProcesoActualId != 1 || (ticket.Estado != "ABIERTO" && ticket.Estado != "PENDIENTE")))
                    throw new InvalidOperationException("No puedes editar entregas de un ticket recibido, entregado o cerrado.");

                if (fechaActual.Date != DateTime.Today)
                    throw new UnauthorizedAccessException("Solo puedes editar entregas registradas el día de hoy.");
            }

            DateTime fechaFinal = dto.Fecha?.Date ?? fechaActual;
            int litrosFinal = dto.Litros ?? (int)entrega.Litros;
            int companiaFinal = dto.CompaniaId ?? (int)entrega.CompaniaId;
            int conductorFinal = (rol == "ADMIN" && dto.ConductorId.HasValue && dto.ConductorId.Value > 0)
                ? dto.ConductorId.Value
                : conductorActual;
            string? observacionFinal = dto.Observacion ?? (string?)entrega.Observacion;

            var sql = @"
                UPDATE TB_ENTREGAS_COMPANIA 
                SET Litros = @litrosFinal,
                    CompaniaId = @companiaFinal,
                    UsuarioId = @conductorFinal,
                    Fecha = @fechaFinal,
                    Observacion = @observacionFinal,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @entregaId";

            var rows = await connection.ExecuteAsync(sql, new
            {
                litrosFinal,
                companiaFinal,
                conductorFinal,
                fechaFinal,
                observacionFinal,
                usuarioId,
                entregaId
            });

            if (rows > 0 && entrega.ControlCompaniaId != null)
            {
                long ccId = (long)entrega.ControlCompaniaId;
                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_COMPANIAS
                    SET Fecha = @fechaFinal,
                        CompaniaId = @companiaFinal,
                        UsuarioId = @conductorFinal,
                        LitrosDespachados = @litrosFinal,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @ccId",
                    new { fechaFinal, companiaFinal, conductorFinal, litrosFinal, usuarioId, ccId });
            }

            if (rows > 0 && entrega.ControlRutaId != null)
            {
                long tId = (long)entrega.ControlRutaId;
                await connection.ExecuteAsync(@"
                    UPDATE cr
                    SET cr.LitrosRecibidosReceptoria = (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÍA%')),
                        cr.TotalLitrosReceptoria = (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÍA%')),
                        cr.DiferenciaReceptoria = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÍA%')),
                        cr.DiferenciaLitros = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÍA%')),
                        cr.MermaTotalLitros = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÍA%')),
                        cr.ModifiedAt = GETDATE(),
                        cr.ModifiedBy = @usuarioId
                    FROM TB_CONTROL_RUTAS cr
                    WHERE cr.Id = @tId", new { tId, usuarioId });
            }

            return rows > 0;
        }

        public async Task<bool> EliminarEntregaAsync(int entregaId, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var entrega = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_ENTREGAS_COMPANIA WHERE Id = @entregaId", new { entregaId });
            if (entrega == null) return false;

            if (rol == "CHOFER")
            {
                if ((int)entrega.UsuarioId != usuarioId)
                    throw new UnauthorizedAccessException("No puedes eliminar entregas de otros conductores.");

                DateTime fechaActual = ((DateTime)entrega.Fecha).Date;
                int conductorActual = (int)entrega.UsuarioId;

                var ticket = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    @"SELECT ProcesoActualId, Estado 
                      FROM TB_CONTROL_RUTAS 
                      WHERE UsuarioId = @conductorActual AND CAST(Fecha AS DATE) = @fechaActual 
                      ORDER BY Id DESC",
                    new { conductorActual, fechaActual });

                if (ticket != null && (ticket.ProcesoActualId != 1 || (ticket.Estado != "ABIERTO" && ticket.Estado != "PENDIENTE")))
                    throw new InvalidOperationException("No puedes eliminar entregas de un ticket recibido, entregado o cerrado.");

                if (fechaActual != DateTime.Today)
                    throw new UnauthorizedAccessException("Solo puedes eliminar entregas registradas el día de hoy.");
            }

            var rows = await connection.ExecuteAsync("DELETE FROM TB_ENTREGAS_COMPANIA WHERE Id = @entregaId", new { entregaId });

            if (rows > 0 && entrega.ControlRutaId != null)
            {
                long tId = (long)entrega.ControlRutaId;
                await connection.ExecuteAsync(@"
                    UPDATE cr
                    SET cr.LitrosRecibidosReceptoria = (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÍA%')),
                        cr.TotalLitrosReceptoria = (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÍA%')),
                        cr.DiferenciaReceptoria = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÍA%')),
                        cr.DiferenciaLitros = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÍA%')),
                        cr.MermaTotalLitros = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÍA%')),
                        cr.ModifiedAt = GETDATE(),
                        cr.ModifiedBy = @usuarioId
                    FROM TB_CONTROL_RUTAS cr
                    WHERE cr.Id = @tId", new { tId, usuarioId });
            }
            return rows > 0;
        }

        public async Task<BalanceVolumetricoDto> ObtenerBalanceVolumetricoAsync(int? cicloId = null, DateTime? fechaInicio = null, DateTime? fechaFin = null)
        {
            using var connection = new SqlConnection(_connectionString);

            // 1. Resolver el Ciclo o Rango de Fechas
            int cId = 0;
            string codigoCiclo = "General";
            DateTime fInicio = fechaInicio?.Date ?? DateTime.Today;
            DateTime fFin = fechaFin?.Date.AddDays(1).AddTicks(-1) ?? DateTime.Today.AddDays(1).AddTicks(-1);
            decimal stockInicial = 0m;

            if (cicloId.HasValue && cicloId.Value > 0)
            {
                var ciclo = await connection.QueryFirstOrDefaultAsync<(int Id, string Codigo, DateTime FechaInicio, DateTime FechaFin, decimal StockInicialTanques)>(
                    "SELECT TOP 1 Id, Codigo, FechaInicio, FechaFin, ISNULL(StockInicialTanques, 0) AS StockInicialTanques FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloId",
                    new { cicloId = cicloId.Value });

                if (ciclo.Id > 0)
                {
                    cId = ciclo.Id;
                    codigoCiclo = ciclo.Codigo;
                    fInicio = ciclo.FechaInicio;
                    fFin = ciclo.FechaFin;
                    stockInicial = ciclo.StockInicialTanques;
                }
            }
            else if (fechaInicio.HasValue && fechaFin.HasValue)
            {
                fInicio = fechaInicio.Value.Date;
                fFin = fechaFin.Value.Date.AddDays(1).AddTicks(-1);
                codigoCiclo = $"{fInicio:yyyy-MM-dd} al {fFin:yyyy-MM-dd}";

                var cicloMatch = await connection.QueryFirstOrDefaultAsync<(int Id, decimal StockInicialTanques)?>(
                    "SELECT TOP 1 Id, ISNULL(StockInicialTanques, 0) AS StockInicialTanques FROM TB_CICLOS_OPERATIVOS WHERE @fInicio >= FechaInicio AND @fInicio <= FechaFin",
                    new { fInicio });
                if (cicloMatch.HasValue)
                {
                    cId = cicloMatch.Value.Id;
                    stockInicial = cicloMatch.Value.StockInicialTanques;
                }
            }

            // Reflejar apertura verificada de formulario diario de tanques si existe
            var tanqueDiarioInicial = await connection.ExecuteScalarAsync<int?>(
                "SELECT TOP 1 TotalInicialLitros FROM TB_CONTROL_TANQUES_DIARIO WHERE Fecha = CAST(@fInicio AS DATE) AND (AperturaConfirmada = 1 OR CierreConfirmado = 1)",
                new { fInicio });
            if (tanqueDiarioInicial.HasValue && tanqueDiarioInicial.Value > 0)
            {
                stockInicial = tanqueDiarioInicial.Value;
            }
            else if (cId == 0)
            {
                // Priorizar el ciclo ABIERTO / ACTIVO
                var ciclo = await connection.QueryFirstOrDefaultAsync<(int Id, string Codigo, DateTime FechaInicio, DateTime FechaFin, decimal StockInicialTanques)>(
                    @"SELECT TOP 1 c.Id, c.Codigo, c.FechaInicio, c.FechaFin, ISNULL(c.StockInicialTanques, 0) AS StockInicialTanques 
                      FROM TB_CICLOS_OPERATIVOS c 
                      WHERE c.Estado IN ('ABIERTO', 'ACTIVO', 'ACTIVA')
                      ORDER BY c.Id DESC");

                if (ciclo.Id == 0)
                {
                    ciclo = await connection.QueryFirstOrDefaultAsync<(int Id, string Codigo, DateTime FechaInicio, DateTime FechaFin, decimal StockInicialTanques)>(
                        @"SELECT TOP 1 c.Id, c.Codigo, c.FechaInicio, c.FechaFin, ISNULL(c.StockInicialTanques, 0) AS StockInicialTanques 
                          FROM TB_CICLOS_OPERATIVOS c 
                          WHERE EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION r WHERE r.CicloId = c.Id)
                          ORDER BY c.Id DESC");
                }

                if (ciclo.Id > 0)
                {
                    cId = ciclo.Id;
                    codigoCiclo = ciclo.Codigo;
                    fInicio = ciclo.FechaInicio;
                    fFin = ciclo.FechaFin;
                    stockInicial = ciclo.StockInicialTanques;
                }
            }

            var result = new BalanceVolumetricoDto
            {
                CicloId = cId > 0 ? cId : null,
                CodigoCiclo = codigoCiclo,
                FechaInicio = fInicio != DateTime.MinValue ? fInicio : null,
                FechaFin = fFin != DateTime.MaxValue ? fFin : null,
                StockInicialTanque = stockInicial
            };

            // 2. Consulta de Recolección en Fincas
            string whereFincas = cId > 0 ? "r.CicloId = @cId" : "r.Fecha >= @fInicio AND r.Fecha <= @fFin";
            result.TotalRecolectadoFincas = await connection.ExecuteScalarAsync<decimal>(
                $"SELECT ISNULL(SUM(r.Litros), 0) FROM TB_RUTAS_RECOLECCION r WHERE {whereFincas}",
                new { cId, fInicio, fFin });

            // 3. Consulta de Merma en Rutas
            string whereRutas = cId > 0 ? "cr.CicloId = @cId" : "cr.Fecha >= @fInicio AND cr.Fecha <= @fFin";
            result.TotalMermaRuta = await connection.ExecuteScalarAsync<decimal>(
                $"SELECT ISNULL(SUM(cr.DiferenciaLitros), 0) FROM TB_CONTROL_RUTAS cr WHERE {whereRutas}",
                new { cId, fInicio, fFin });

            // 4. Consultar todas las entregas/movimientos unificados en el ciclo o periodo
            string whereEntregas = cId > 0 ? "e.CicloId = @cId" : "e.Fecha >= @fInicio AND e.Fecha <= @fFin";
            var rawEntregasSql = $@"
                SELECT 
                    e.Id,
                    e.Fecha,
                    e.CompaniaId,
                    c.Nombre AS CompaniaNombre,
                    e.UsuarioId,
                    u.NombreCompleto AS ConductorNombre,
                    ISNULL(cam.Placa, u.VehiculoPlaca) AS CamionPlaca,
                    e.Litros,
                    e.ControlRutaId,
                    e.ControlCompaniaId,
                    e.Observacion,
                    cr.TipoDestino AS RutaTipoDestino,
                    cr.TotalLitrosFinca AS RutaTotalLitrosFinca,
                    cr.LitrosRecibidosReceptoria AS RutaLitrosRecibidosReceptoria,
                    cr.LitrosEntregadosCompania AS RutaLitrosEntregadosCompania,
                    cr.Estado AS RutaEstado,
                    cc.Estado AS ControlCompaniaEstado,
                    cc.LitrosDespachados AS ControlCompaniaLitrosDespachados,
                    cc.LitrosRecibidosCompania AS ControlCompaniaLitrosRecibidos,
                    cc.DiferenciaLitros AS ControlCompaniaDiferencia
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                INNER JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                LEFT JOIN TB_CAMIONES cam ON cam.UsuarioId = u.Id AND cam.Activo = 1
                LEFT JOIN TB_CONTROL_RUTAS cr ON e.ControlRutaId = cr.Id
                LEFT JOIN TB_CONTROL_COMPANIAS cc ON e.ControlCompaniaId = cc.Id
                WHERE {whereEntregas}
                ORDER BY e.Fecha ASC, e.Id ASC";

            var entregasRaw = (await connection.QueryAsync<dynamic>(rawEntregasSql, new { cId, fInicio, fFin })).ToList();

            var movimientos = new List<MovimientoLecheDto>();
            decimal runningStock = stockInicial;

            if (stockInicial > 0)
            {
                movimientos.Add(new MovimientoLecheDto
                {
                    Id = 0,
                    Fecha = fInicio != DateTime.MinValue ? fInicio : (entregasRaw.Count > 0 ? (DateTime)entregasRaw[0].Fecha : DateTime.Now.Date),
                    TipoProceso = 0,
                    TipoProcesoNombre = "Stock Inicial Tanques",
                    TicketReferencia = "Apertura Ciclo",
                    Conductor = "Inventario Físico",
                    CamionPlaca = "Tanques Receptoría",
                    Origen = "Cierre Ciclo Anterior / Medición",
                    Destino = "Tanques Receptoría",
                    LitrosEntradaTanque = stockInicial,
                    LitrosSalidaTanque = 0m,
                    LitrosEntregaDirecta = 0m,
                    SaldoTanque = stockInicial,
                    Estado = "APERTURA",
                    Observacion = "Stock físico de apertura presente en tanques al iniciar el ciclo operativo"
                });
            }

            int p1Count = 0; decimal p1Litros = 0m;
            int p2Count = 0; decimal p2Litros = 0m;
            int p3Count = 0; decimal p3Litros = 0m;
            int p4Count = 0; decimal p4Litros = 0m;

            foreach (var item in entregasRaw)
            {
                long id = (long)item.Id;
                DateTime fecha = (DateTime)item.Fecha;
                int compId = (int)item.CompaniaId;
                string compNombre = (string)item.CompaniaNombre ?? "";
                string conductor = (string)item.ConductorNombre ?? "";
                string? placa = (string?)item.CamionPlaca;
                decimal litros = (decimal)(int)item.Litros;
                long? cRutaId = item.ControlRutaId != null ? (long?)item.ControlRutaId : null;
                long? cCompId = item.ControlCompaniaId != null ? (long?)item.ControlCompaniaId : null;
                string? obs = (string?)item.Observacion;
                string estado = (string?)item.RutaEstado ?? (string?)item.ControlCompaniaEstado ?? "FINALIZADO";

                bool esReceptoria = compId == 5028 || compNombre.IndexOf("RECEPTORIA", StringComparison.OrdinalIgnoreCase) >= 0;

                int tipoProceso = 1;
                string tipoProcesoNombre = "Finca ➔ Receptoría";
                string origen = "Fincas de Ruta";
                string destino = "Tanques Receptoría";
                decimal entradaTanque = 0m;
                decimal salidaTanque = 0m;
                decimal entregaDirecta = 0m;
                string ticketRef = "";
                decimal? litrosVerificados = null;
                decimal? difVerificacion = null;
                string? infoVerif = null;

                if (esReceptoria)
                {
                    // Ingreso a Receptoría
                    bool tieneEntregaCompMismaRuta = cRutaId.HasValue && entregasRaw.Any(x => (long?)x.ControlRutaId == cRutaId && (int)x.CompaniaId != 5028);

                    if (tieneEntregaCompMismaRuta)
                    {
                        tipoProceso = 2;
                        tipoProcesoNombre = "Finca ➔ Receptoría ➔ Compañía";
                        ticketRef = $"Ruta/Paso #{cRutaId}";
                        destino = "Receptoría (Tránsito a Cía)";
                        p2Count++;
                        p2Litros += litros;
                    }
                    else
                    {
                        tipoProceso = 1;
                        tipoProcesoNombre = "Finca ➔ Receptoría";
                        ticketRef = cRutaId.HasValue ? $"Ruta Recolección #{cRutaId}" : $"Descarga #{id}";
                        p1Count++;
                        p1Litros += litros;
                    }

                    entradaTanque = litros;
                    runningStock += litros;
                    result.TotalEntradasTanque += litros;

                    if (cRutaId.HasValue && item.RutaTotalLitrosFinca != null)
                    {
                        litrosVerificados = (decimal)item.RutaTotalLitrosFinca;
                        decimal difReco = litros - litrosVerificados.Value;
                        difVerificacion = difReco;
                        infoVerif = $"Recolectado Campo: {litrosVerificados.Value:N0} Lts";
                    }
                }
                else
                {
                    // Entrega a Compañía
                    destino = compNombre;

                    if (cRutaId.HasValue)
                    {
                        bool pasoPorReceptoria = entregasRaw.Any(x => (long?)x.ControlRutaId == cRutaId && ((int)x.CompaniaId == 5028 || ((string)x.CompaniaNombre).IndexOf("RECEPTORIA", StringComparison.OrdinalIgnoreCase) >= 0));

                        if (pasoPorReceptoria)
                        {
                            tipoProceso = 2;
                            tipoProcesoNombre = "Finca ➔ Receptoría ➔ Compañía";
                            ticketRef = $"Entrega en Ruta (Vía Receptoría) #{cRutaId}";
                            origen = "Ruta de Camión (Paso Receptoría)";
                            entregaDirecta = litros;
                            result.TotalEntregasDirectas += litros;
                            result.TotalComercializadoCompanias += litros;
                            p2Count++;
                            p2Litros += litros;
                        }
                        else
                        {
                            tipoProceso = 3;
                            tipoProcesoNombre = "Finca ➔ Compañía";
                            ticketRef = $"Entrega Directa #{cRutaId}";
                            origen = "Fincas de Ruta";
                            entregaDirecta = litros;
                            result.TotalEntregasDirectas += litros;
                            result.TotalComercializadoCompanias += litros;
                            p3Count++;
                            p3Litros += litros;
                        }
                    }
                    else
                    {
                        tipoProceso = 4;
                        tipoProcesoNombre = "Receptoría ➔ Compañía";
                        ticketRef = cCompId.HasValue ? $"Despacho Tanque #{cCompId}" : $"Despacho #{id}";
                        origen = "Tanques Receptoría";

                        // Para salidas de tanque, la salida física de leche del tanque es siempre LitrosDespachados
                        if (cCompId.HasValue && item.ControlCompaniaLitrosDespachados != null && (decimal)item.ControlCompaniaLitrosDespachados > 0)
                        {
                            salidaTanque = (decimal)item.ControlCompaniaLitrosDespachados;
                        }
                        else
                        {
                            salidaTanque = litros;
                        }

                        runningStock -= salidaTanque;
                        result.TotalSalidasTanque += salidaTanque;
                        result.TotalComercializadoCompanias += salidaTanque;
                        p4Count++;
                        p4Litros += salidaTanque;

                        // Datos de verificación en la planta compradora
                        if (cCompId.HasValue && item.ControlCompaniaLitrosRecibidos != null)
                        {
                            litrosVerificados = (decimal)item.ControlCompaniaLitrosRecibidos;
                            difVerificacion = (decimal)(item.ControlCompaniaDiferencia ?? (salidaTanque - litrosVerificados.Value));
                            decimal varLts = litrosVerificados.Value - salidaTanque;
                            string sign = varLts >= 0 ? "+" : "";
                            infoVerif = $"Verif. en {destino}: {litrosVerificados.Value:N0} Lts ({sign}{varLts:N0} Lts)";
                        }
                    }
                }

                movimientos.Add(new MovimientoLecheDto
                {
                    Id = id,
                    Fecha = fecha,
                    TipoProceso = tipoProceso,
                    TipoProcesoNombre = tipoProcesoNombre,
                    TicketReferencia = ticketRef,
                    Conductor = conductor,
                    CamionPlaca = placa,
                    Origen = origen,
                    Destino = destino,
                    LitrosEntradaTanque = entradaTanque,
                    LitrosSalidaTanque = salidaTanque,
                    LitrosEntregaDirecta = entregaDirecta,
                    SaldoTanque = runningStock,
                    LitrosVerificados = litrosVerificados,
                    DiferenciaVerificacion = difVerificacion,
                    InfoVerificacion = infoVerif,
                    Estado = estado,
                    Observacion = obs
                });
            }

            result.StockActualTanque = result.StockInicialTanque + result.TotalEntradasTanque - result.TotalSalidasTanque;
            result.Movimientos = movimientos;

            decimal totalIngresoCircuito = result.StockInicialTanque + result.TotalRecolectadoFincas;
            decimal totalExplicado = result.TotalComercializadoCompanias + result.StockActualTanque + result.TotalMermaRuta;
            result.DiferenciaDescuadre = Math.Abs(totalIngresoCircuito - totalExplicado);

            decimal totalOperado = result.TotalRecolectadoFincas > 0 ? result.TotalRecolectadoFincas : (p1Litros + p2Litros + p3Litros + p4Litros);
            if (totalOperado <= 0) totalOperado = 1m;

            result.Proceso1_FincaReceptoria = new ResumenProcesoDto
            {
                TipoProceso = 1,
                Nombre = "Finca ➔ Receptoría",
                Descripcion = "Leche recolectada descargada y almacenada físicamente en tanques",
                TotalLitros = p1Litros,
                CantidadMovimientos = p1Count,
                PorcentajeDelTotal = Math.Round((p1Litros / totalOperado) * 100m, 2),
                ImpactoTanque = "SUMA (+)"
            };

            result.Proceso2_FincaReceptoriaCompania = new ResumenProcesoDto
            {
                TipoProceso = 2,
                Nombre = "Finca ➔ Receptoría ➔ Compañía",
                Descripcion = "Leche en tránsito que pasa por receptoría y se despacha a la compañía",
                TotalLitros = p2Litros,
                CantidadMovimientos = p2Count,
                PorcentajeDelTotal = Math.Round((p2Litros / totalOperado) * 100m, 2),
                ImpactoTanque = "TRÁNSITO (Entra/Sale)"
            };

            result.Proceso3_FincaCompania = new ResumenProcesoDto
            {
                TipoProceso = 3,
                Nombre = "Finca ➔ Compañía",
                Descripcion = "Entregas directas en ruta desde fincas a plantas/queseras",
                TotalLitros = p3Litros,
                CantidadMovimientos = p3Count,
                PorcentajeDelTotal = Math.Round((p3Litros / totalOperado) * 100m, 2),
                ImpactoTanque = "NEUTRO (0 Lts en Tanque)"
            };

            result.Proceso4_ReceptoriaCompania = new ResumenProcesoDto
            {
                TipoProceso = 4,
                Nombre = "Receptoría ➔ Compañía",
                Descripcion = "Despachos y venta de leche almacenada en tanques hacia plantas compradoras",
                TotalLitros = p4Litros,
                CantidadMovimientos = p4Count,
                PorcentajeDelTotal = Math.Round((p4Litros / totalOperado) * 100m, 2),
                ImpactoTanque = "RESTA (-)"
            };

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

            // Obtener tanques iniciales del día anterior como base
            var sqlPrev = @"SELECT TOP 1 Tanque1Final, Tanque2Final, Tanque3Final, Tanque4Final, Tanque5Final, TotalFinalFisicoLitros 
                            FROM TB_CONTROL_TANQUES_DIARIO WHERE Fecha < @fecha ORDER BY Fecha DESC";
            var prevDia = await connection.QueryFirstOrDefaultAsync<dynamic>(sqlPrev, new { fecha = fecha.Date });

            int t1Ini = prevDia?.Tanque1Final ?? 0;
            int t2Ini = prevDia?.Tanque2Final ?? 0;
            int t3Ini = prevDia?.Tanque3Final ?? 0;
            int t4Ini = prevDia?.Tanque4Final ?? 0;
            int t5Ini = prevDia?.Tanque5Final ?? 0;
            int totalIni = prevDia?.TotalFinalFisicoLitros ?? (t1Ini + t2Ini + t3Ini + t4Ini + t5Ini);

            // Obtener Entradas y Salidas reales del día (Servicio Tipo 1: RUTA)
            var sqlMovimientos = @"
                -- ENTRADAS A SILOS (CompaniaId = 5028 - Receptoría)
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
                LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON e.ControlRutaId = cr.Id
                WHERE CAST(e.Fecha AS DATE) = @fecha 
                  AND e.CompaniaId = 5028

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
                  AND e.CompaniaId != 5028 
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

            // Si no hubiera entregas en TB_ENTREGAS_COMPANIA pero sí controles de ruta registrados
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

                // Si no tiene tanques iniciales cargados, auto-asignar del día previo
                if (record.Tanque1Inicial == 0 && record.Tanque2Inicial == 0 && record.Tanque3Inicial == 0 && record.Tanque4Inicial == 0 && record.Tanque5Inicial == 0 && totalIni > 0)
                {
                    record.Tanque1Inicial = t1Ini;
                    record.Tanque2Inicial = t2Ini;
                    record.Tanque3Inicial = t3Ini;
                    record.Tanque4Inicial = t4Ini;
                    record.Tanque5Inicial = t5Ini;
                    record.TotalInicialLitros = totalIni;
                }

                // Si no tiene filas de recepción registradas o están vacías, auto-llenar con los movimientos de hoy
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
                    throw new UnauthorizedAccessException("Este control diario ya está confirmado y cerrado. De allí para atrás solo el Administrador puede modificar datos.");
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
            if (!esAdminOSup) throw new UnauthorizedAccessException("Solo un Supervisor o Administrador puede confirmar la apertura del día.");

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
            if (!esAdminOSup) throw new UnauthorizedAccessException("Solo un Supervisor o Administrador puede confirmar el cierre del día.");

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
    }

    // =========================================================================
    // REPOSITORIO DE REPORTES
    // =========================================================================

    public interface IReportesRepository
    {
        Task<ReporteDiariosDto> ObtenerReporteDiariosAsync(DateTime fechaInicio, DateTime fechaFin);
        Task<List<ReporteEntidadResumenDto>> ObtenerReporteReceptoriasAsync(DateTime fechaInicio, DateTime fechaFin, int? companiaId = null);
        Task<List<ReporteEntidadResumenDto>> ObtenerReporteFincasAsync(DateTime fechaInicio, DateTime fechaFin, List<int>? fincaIds = null);
        Task<List<ReporteEntidadResumenDto>> ObtenerReporteChoferesAsync(DateTime fechaInicio, DateTime fechaFin, int? choferId = null);
        Task<List<ReporteBancoFincaDto>> ObtenerReporteBancosFincasAsync(DateTime fechaInicio, DateTime fechaFin, int? bancoId = null, int? cicloId = null, decimal? tasaBcvManual = null);
        Task<List<ReporteRelacionCompaniaDto>> ObtenerReporteRelacionCompaniasAsync(DateTime fechaInicio, DateTime fechaFin, int? companiaId = null, int? cicloId = null, decimal? tasaBcvManual = null);
        Task<List<ReporteRelacionChoferDto>> ObtenerReporteRelacionChoferesAsync(DateTime fechaInicio, DateTime fechaFin);
        Task<DashboardAvanzadoDto> ObtenerDashboardAvanzadoAsync(int semanas = 8, int? usuarioId = null);
    }

    public class ReportesRepository : IReportesRepository
    {
        private readonly string _connectionString;
        private readonly ICatalogosRepository _catalogosRepository;

        public ReportesRepository(IConfiguration configuration, ICatalogosRepository catalogosRepository, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection")!;
            _catalogosRepository = catalogosRepository;
        }

        private async Task<decimal> ObtenerTasaActualAsync(SqlConnection connection)
        {
            var tasa = await connection.QueryFirstOrDefaultAsync<decimal?>(
                "SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC, CreatedAt DESC");
            return tasa ?? 791.3248m;
        }

        public async Task<ReporteDiariosDto> ObtenerReporteDiariosAsync(DateTime fechaInicio, DateTime fechaFin)
        {
            using var connection = new SqlConnection(_connectionString);

            var sqlRutas = @"
                SELECT CONVERT(varchar(10), Fecha, 120) AS Fecha, ISNULL(SUM(Litros), 0) AS Litros
                FROM TB_RUTAS_RECOLECCION
                WHERE Fecha >= @fechaInicio AND Fecha <= @fechaFin
                  AND FincaId != 68
                GROUP BY Fecha
                ORDER BY Fecha";

            var sqlReceptorias = @"
                WITH EntregasUnificadas AS (
                    SELECT 
                        cc.Fecha, 
                        COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0) AS Litros,
                        c.TipoServicioId
                    FROM TB_CONTROL_COMPANIAS cc
                    INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                    WHERE cc.Fecha >= @fechaInicio AND cc.Fecha <= @fechaFin
                      AND (cc.LitrosDespachados > 0 OR cc.LitrosRecibidosCompania > 0)
                    UNION ALL
                    SELECT 
                        e.Fecha, 
                        e.Litros,
                        c.TipoServicioId
                    FROM TB_ENTREGAS_COMPANIA e
                    INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                    WHERE e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin
                      AND e.Litros > 0
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.Fecha >= @fechaInicio AND cc2.Fecha <= @fechaFin
                            AND cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE) AND cc2.UsuarioId = e.UsuarioId)
                            )
                      )
                )
                SELECT CONVERT(varchar(10), Fecha, 120) AS Fecha, ISNULL(SUM(Litros), 0) AS Litros
                FROM EntregasUnificadas
                GROUP BY Fecha
                ORDER BY Fecha";

            var sqlTranspRutas = @"
                SELECT CONVERT(varchar(10), r.Fecha, 120) AS Fecha, ISNULL(SUM(r.Litros), 0) AS Litros
                FROM TB_RUTAS_RECOLECCION r
                LEFT JOIN TB_FINCAS f ON r.FincaId = f.Id
                WHERE r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin
                  AND r.FincaId != 68
                  AND f.TipoServicioId = 2
                GROUP BY r.Fecha
                ORDER BY r.Fecha";

            var sqlTranspReceptorias = @"
                WITH EntregasUnificadas AS (
                    SELECT 
                        cc.Fecha, 
                        COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0) AS Litros,
                        c.TipoServicioId
                    FROM TB_CONTROL_COMPANIAS cc
                    INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                    WHERE cc.Fecha >= @fechaInicio AND cc.Fecha <= @fechaFin
                      AND (cc.LitrosDespachados > 0 OR cc.LitrosRecibidosCompania > 0)
                    UNION ALL
                    SELECT 
                        e.Fecha, 
                        e.Litros,
                        c.TipoServicioId
                    FROM TB_ENTREGAS_COMPANIA e
                    INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                    WHERE e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin
                      AND e.Litros > 0
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.Fecha >= @fechaInicio AND cc2.Fecha <= @fechaFin
                            AND cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE) AND cc2.UsuarioId = e.UsuarioId)
                            )
                      )
                )
                SELECT CONVERT(varchar(10), Fecha, 120) AS Fecha, ISNULL(SUM(Litros), 0) AS Litros
                FROM EntregasUnificadas
                WHERE TipoServicioId = 2
                GROUP BY Fecha
                ORDER BY Fecha";

            var rutas = (await connection.QueryAsync<ReporteDiarioRowDto>(sqlRutas, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
            var receptorias = (await connection.QueryAsync<ReporteDiarioRowDto>(sqlReceptorias, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
            var transpRutas = (await connection.QueryAsync<ReporteDiarioRowDto>(sqlTranspRutas, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
            var transpReceptorias = (await connection.QueryAsync<ReporteDiarioRowDto>(sqlTranspReceptorias, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();

            return new ReporteDiariosDto
            {
                DiarioRutas = rutas,
                TotalDiarioRutas = rutas.Sum(x => x.Litros),
                DiarioReceptorias = receptorias,
                TotalDiarioReceptorias = receptorias.Sum(x => x.Litros),
                DiarioTransporteRutas = transpRutas,
                TotalDiarioTransporteRutas = transpRutas.Sum(x => x.Litros),
                DiarioTransporteReceptorias = transpReceptorias,
                TotalDiarioTransporteReceptorias = transpReceptorias.Sum(x => x.Litros)
            };
        }

        public async Task<List<ReporteEntidadResumenDto>> ObtenerReporteReceptoriasAsync(DateTime fechaInicio, DateTime fechaFin, int? companiaId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            decimal tasaActual = await ObtenerTasaActualAsync(connection);

            var sqlCompanias = @"
                WITH EntregasUnificadas AS (
                    -- 1. Despachos y entregas directas desde TB_CONTROL_COMPANIAS (fuente principal con tipo de leche exacto)
                    SELECT 
                        cc.Id,
                        cc.CompaniaId,
                        cc.Fecha,
                        COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0) AS Litros,
                        ISNULL(cc.TipoLeche, 'VACA') AS TipoLeche,
                        cc.Observacion,
                        cc.UsuarioId
                    FROM TB_CONTROL_COMPANIAS cc
                    INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                    WHERE cc.Fecha >= @fechaInicio AND cc.Fecha <= @fechaFin
                      AND (cc.LitrosDespachados > 0 OR cc.LitrosRecibidosCompania > 0)
                    UNION ALL
                    -- 2. Entregas independientes de TB_ENTREGAS_COMPANIA no asociadas a un ControlCompaniaId ni a un viaje desglosado
                    SELECT 
                        e.Id,
                        e.CompaniaId,
                        e.Fecha,
                        e.Litros,
                        ISNULL(e.TipoLeche, 'VACA') AS TipoLeche,
                        e.Observacion,
                        e.UsuarioId
                    FROM TB_ENTREGAS_COMPANIA e
                    INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                    WHERE e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin
                      AND e.Litros > 0
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE) AND cc2.UsuarioId = e.UsuarioId)
                            )
                      )
                )
                SELECT DISTINCT 
                    c.Id, 
                    c.Nombre, 
                    c.Encargado AS Propietario, 
                    ISNULL(c.PrecioCompraLitroUSD, 0) AS PrecioLitroUSD,
                    ISNULL(c.PrecioBufalaLitroUSD, ISNULL(c.PrecioCompraLitroUSD, 0)) AS PrecioBufalaLitroUSD,
                    ISNULL(c.PrecioAcidaLitroUSD, 0) AS PrecioLitroAcidaUSD
                FROM TB_COMPANIAS c
                INNER JOIN EntregasUnificadas u ON c.Id = u.CompaniaId
                WHERE (@companiaId IS NULL OR c.Id = @companiaId)
                ORDER BY c.Nombre";

            var companias = (await connection.QueryAsync<dynamic>(sqlCompanias, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date, companiaId })).ToList();
            var resultado = new List<ReporteEntidadResumenDto>();

            var sqlDetalle = @"
                WITH EntregasUnificadas AS (
                    -- 1. Despachos y entregas directas desde TB_CONTROL_COMPANIAS (fuente principal con tipo de leche exacto)
                    SELECT 
                        cc.Id,
                        cc.CompaniaId,
                        cc.Fecha,
                        COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0) AS Litros,
                        ISNULL(cc.TipoLeche, 'VACA') AS TipoLeche,
                        cc.Observacion,
                        cc.UsuarioId
                    FROM TB_CONTROL_COMPANIAS cc
                    WHERE cc.Fecha >= @fechaInicio AND cc.Fecha <= @fechaFin
                      AND (cc.LitrosDespachados > 0 OR cc.LitrosRecibidosCompania > 0)
                    UNION ALL
                    -- 2. Entregas independientes de TB_ENTREGAS_COMPANIA no asociadas a un ControlCompaniaId ni a un viaje desglosado
                    SELECT 
                        e.Id,
                        e.CompaniaId,
                        e.Fecha,
                        e.Litros,
                        ISNULL(e.TipoLeche, 'VACA') AS TipoLeche,
                        e.Observacion,
                        e.UsuarioId
                    FROM TB_ENTREGAS_COMPANIA e
                    WHERE e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin
                      AND e.Litros > 0
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE) AND cc2.UsuarioId = e.UsuarioId)
                            )
                      )
                )
                SELECT 
                    CONVERT(varchar(10), u.Fecha, 120) AS Fecha,
                    u.Litros AS Litros,
                    ISNULL(u.TipoLeche, 'VACA') AS TipoLeche,
                    ISNULL(u.Observacion, '') AS Observacion,
                    ISNULL(usr.NombreCompleto, usr.Username) AS ChoferNombre,
                    c.Nombre AS EntidadNombre
                FROM EntregasUnificadas u
                INNER JOIN TB_COMPANIAS c ON u.CompaniaId = c.Id
                LEFT JOIN TB_USUARIOS usr ON u.UsuarioId = usr.Id
                WHERE u.CompaniaId = @id
                  AND u.Litros > 0
                  AND u.Fecha >= @fechaInicio AND u.Fecha <= @fechaFin
                ORDER BY u.Fecha, u.TipoLeche";

            foreach (var comp in companias)
            {
                int id = (int)comp.Id;
                string nombre = (string)comp.Nombre;
                string? prop = (string?)comp.Propietario;
                decimal precio = (decimal)comp.PrecioLitroUSD;
                decimal precioBufala = (decimal)comp.PrecioBufalaLitroUSD;
                decimal precioAcida = (decimal)comp.PrecioLitroAcidaUSD;

                var detalle = (await connection.QueryAsync<ReporteDetalleItemDto>(sqlDetalle, new { id, fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
                
                var detalleBufala = detalle.Where(d => (d.TipoLeche ?? "").ToUpper() == "BUFALA" || (d.Observacion ?? "").ToUpper().Contains("BUFAL")).ToList();
                var detalleVaca = detalle.Where(d => (d.TipoLeche ?? "VACA").ToUpper() != "BUFALA" && !(d.Observacion ?? "").ToUpper().Contains("BUFAL")).ToList();

                bool tieneDosTipos = detalleVaca.Any() && detalleBufala.Any();

                if (tieneDosTipos)
                {
                    // 1. TABLA / CARD DE VACA
                    int totalLitrosV = detalleVaca.Sum(d => d.Litros);
                    decimal totalUSDV = totalLitrosV * precio;
                    decimal totalBsV = totalUSDV * tasaActual;

                    resultado.Add(new ReporteEntidadResumenDto
                    {
                        Id = id,
                        Nombre = $"{nombre} (Vaca)",
                        Propietario = prop,
                        PrecioLitroUSD = precio,
                        PrecioBufalaLitroUSD = precioBufala,
                        PrecioLitroAcidaUSD = precioAcida,
                        TasaBcv = tasaActual,
                        Detalle = detalleVaca,
                        TotalLitros = totalLitrosV,
                        TotalLitrosVaca = totalLitrosV,
                        TotalLitrosBufala = 0,
                        TotalUSDVaca = totalUSDV,
                        TotalUSDBufala = 0,
                        TieneBufala = false,
                        TieneVaca = true,
                        TotalUSD = totalUSDV,
                        TotalBs = totalBsV
                    });

                    // 2. TABLA / CARD DE BÚFALA
                    int totalLitrosB = detalleBufala.Sum(d => d.Litros);
                    decimal pB = precioBufala > 0 ? precioBufala : precio;
                    decimal totalUSDB = totalLitrosB * pB;
                    decimal totalBsB = totalUSDB * tasaActual;

                    resultado.Add(new ReporteEntidadResumenDto
                    {
                        Id = id,
                        Nombre = $"{nombre} (Búfala)",
                        Propietario = prop,
                        PrecioLitroUSD = pB,
                        PrecioBufalaLitroUSD = pB,
                        PrecioLitroAcidaUSD = precioAcida,
                        TasaBcv = tasaActual,
                        Detalle = detalleBufala,
                        TotalLitros = totalLitrosB,
                        TotalLitrosVaca = 0,
                        TotalLitrosBufala = totalLitrosB,
                        TotalUSDVaca = 0,
                        TotalUSDBufala = totalUSDB,
                        TieneBufala = true,
                        TieneVaca = false,
                        TotalUSD = totalUSDB,
                        TotalBs = totalBsB
                    });
                }
                else
                {
                    int totalLitros = detalle.Sum(d => d.Litros);
                    bool esSoloBufala = detalleBufala.Any() && !detalleVaca.Any();
                    decimal pAplicado = esSoloBufala ? (precioBufala > 0 ? precioBufala : precio) : precio;
                    decimal totalUSD = totalLitros * pAplicado;
                    decimal totalBs = totalUSD * tasaActual;

                    resultado.Add(new ReporteEntidadResumenDto
                    {
                        Id = id,
                        Nombre = esSoloBufala ? $"{nombre} (Búfala)" : nombre,
                        Propietario = prop,
                        PrecioLitroUSD = pAplicado,
                        PrecioBufalaLitroUSD = precioBufala,
                        PrecioLitroAcidaUSD = precioAcida,
                        TasaBcv = tasaActual,
                        Detalle = detalle,
                        TotalLitros = totalLitros,
                        TotalLitrosVaca = esSoloBufala ? 0 : totalLitros,
                        TotalLitrosBufala = esSoloBufala ? totalLitros : 0,
                        TotalUSDVaca = esSoloBufala ? 0 : totalUSD,
                        TotalUSDBufala = esSoloBufala ? totalUSD : 0,
                        TieneBufala = esSoloBufala,
                        TieneVaca = !esSoloBufala,
                        TotalUSD = totalUSD,
                        TotalBs = totalBs
                    });
                }
            }

            return resultado;
        }

        public async Task<List<ReporteEntidadResumenDto>> ObtenerReporteFincasAsync(DateTime fechaInicio, DateTime fechaFin, List<int>? fincaIds = null)
        {
            using var connection = new SqlConnection(_connectionString);
            decimal tasaActual = await ObtenerTasaActualAsync(connection);

            int cIdActivo = await connection.ExecuteScalarAsync<int?>(
                "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC") ?? 0;

            int? cicloIdFiltro = await connection.ExecuteScalarAsync<int?>(
                "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaInicio >= CAST(FechaInicio AS DATE) AND @fechaInicio <= CAST(FechaFin AS DATE)",
                new { fechaInicio = fechaInicio.Date });
            if (!cicloIdFiltro.HasValue || cicloIdFiltro.Value <= 0)
            {
                cicloIdFiltro = cIdActivo;
            }

            bool esRangoHistorico = (fechaFin.Date - fechaInicio.Date).TotalDays > 7;
            int targetCicloId = (!esRangoHistorico && cicloIdFiltro.HasValue && cicloIdFiltro.Value > 0) ? cicloIdFiltro.Value : (esRangoHistorico ? 0 : cIdActivo);

            var sqlFincas = @"
                SELECT DISTINCT f.Id, f.Nombre, f.Propietario, f.CedulaRIF, f.PrecioLitroUSD, ISNULL(f.PrecioLitroAcidaUSD, 0) AS PrecioLitroAcidaUSD,
                       ISNULL(f.TieneDosTiposLeche, 0) AS TieneDosTiposLeche, ISNULL(f.PrecioBufalaLitroUSD, 0) AS PrecioBufalaLitroUSD,
                       ISNULL(f.TipoServicioId, 1) AS TipoServicioId, ISNULL(ts.Nombre, 'RUTA') AS TipoServicioNombre
                FROM TB_FINCAS f
                LEFT JOIN TB_TIPO_SERVICIO ts ON f.TipoServicioId = ts.Id
                INNER JOIN TB_RUTAS_RECOLECCION r ON f.Id = r.FincaId
                WHERE f.Id != 68
                  AND (@tieneFincas = 0 OR f.Id IN @fincaIds)
                  AND (
                      (@targetCicloId > 0 AND ISNULL(r.CicloLiquidacionId, r.CicloId) = @targetCicloId)
                      OR (@targetCicloId <= 0 AND r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin)
                  )
                ORDER BY f.Nombre";

            bool tieneFincas = fincaIds != null && fincaIds.Any();
            var fincas = (await connection.QueryAsync<dynamic>(sqlFincas, new { 
                targetCicloId,
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date, 
                tieneFincas = tieneFincas ? 1 : 0, 
                fincaIds = tieneFincas ? fincaIds : new List<int> { 0 } 
            })).ToList();

            if (tieneFincas && fincas.Count > 1)
            {
                var dictOrder = fincaIds!.Select((id, idx) => new { id, idx }).ToDictionary(x => x.id, x => x.idx);
                fincas = fincas.OrderBy(f => dictOrder.ContainsKey((int)f.Id) ? dictOrder[(int)f.Id] : 999).ToList();
            }

            var resultado = new List<ReporteEntidadResumenDto>();

            var sqlDetalle = @"
                SELECT 
                    r.FincaId,
                    CONVERT(varchar(10), r.Fecha, 120) AS Fecha,
                    r.Litros AS Litros,
                    r.EsAcida AS EsAcida,
                    ISNULL(r.TipoLeche, 'VACA') AS TipoLeche,
                    CASE 
                        WHEN r.EsAcida = 1 THEN ISNULL(f.PrecioLitroAcidaUSD, 0) 
                        WHEN ISNULL(r.TipoLeche, 'VACA') = 'BUFALA' AND (ISNULL(f.TieneDosTiposLeche, 0) = 1 OR ISNULL(f.PrecioBufalaLitroUSD, 0) > 0) THEN f.PrecioBufalaLitroUSD
                        WHEN r.PrecioLitroUSDAplicado IS NOT NULL AND r.PrecioLitroUSDAplicado > 0 THEN r.PrecioLitroUSDAplicado
                        ELSE f.PrecioLitroUSD 
                    END AS PrecioLitroUSDAplicado,
                    ISNULL(r.Observacion, '') AS Observacion,
                    ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                    f.Nombre AS EntidadNombre
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                LEFT JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                WHERE f.Id != 68
                  AND (@tieneFincas = 0 OR r.FincaId IN @fincaIds)
                  AND (
                      (@targetCicloId > 0 AND ISNULL(r.CicloLiquidacionId, r.CicloId) = @targetCicloId)
                      OR (@targetCicloId <= 0 AND r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin)
                  )
                ORDER BY r.Fecha";

            var todosDetallesRaw = (await connection.QueryAsync<dynamic>(sqlDetalle, new { 
                targetCicloId, 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date, 
                tieneFincas = tieneFincas ? 1 : 0, 
                fincaIds = tieneFincas ? fincaIds : new List<int> { 0 } 
            })).ToList();

            var detallesPorFinca = todosDetallesRaw
                .Where(d => d.FincaId != null)
                .GroupBy(d => Convert.ToInt32(d.FincaId))
                .ToDictionary(g => g.Key, g => g.Select(d => new ReporteDetalleItemDto
                {
                    Fecha = d.Fecha != null ? Convert.ToString(d.Fecha)! : "",
                    Litros = d.Litros != null ? Convert.ToInt32(d.Litros) : 0,
                    EsAcida = d.EsAcida != null && Convert.ToBoolean(d.EsAcida),
                    TipoLeche = d.TipoLeche != null ? Convert.ToString(d.TipoLeche)! : "VACA",
                    PrecioLitroUSDAplicado = d.PrecioLitroUSDAplicado != null ? Convert.ToDecimal(d.PrecioLitroUSDAplicado) : 0m,
                    Observacion = d.Observacion != null ? Convert.ToString(d.Observacion) : "",
                    ChoferNombre = d.ChoferNombre != null ? Convert.ToString(d.ChoferNombre) : "",
                    EntidadNombre = d.EntidadNombre != null ? Convert.ToString(d.EntidadNombre) : ""
                }).ToList());

            var sqlPagosMap = @"
                SELECT FincaId, Id AS PagoId, FechaPago, TasaBcv, TotalBrutoBs, TotalAdelantosBs, TotalNetoBs
                FROM TB_PAGOS_LIQUIDACION
                WHERE EstadoPago = 'PAGADO' AND (@targetCicloId = 0 OR CicloId = @targetCicloId)";

            var pagosRaw = (await connection.QueryAsync<dynamic>(sqlPagosMap, new { targetCicloId })).ToList();
            var pagosMap = pagosRaw
                .Where(x => x.FincaId != null)
                .GroupBy(x => Convert.ToInt32(x.FincaId))
                .ToDictionary(g => g.Key, g => {
                    var items = g.ToList();
                    var ultimo = items.OrderByDescending(x => (DateTime?)x.FechaPago).FirstOrDefault();
                    decimal totalBruto = 0m;
                    decimal totalAdelantos = 0m;
                    decimal totalNeto = 0m;
                    foreach (var it in items)
                    {
                        if (it.TotalBrutoBs != null) totalBruto += Convert.ToDecimal(it.TotalBrutoBs);
                        if (it.TotalAdelantosBs != null) totalAdelantos += Convert.ToDecimal(it.TotalAdelantosBs);
                        if (it.TotalNetoBs != null) totalNeto += Convert.ToDecimal(it.TotalNetoBs);
                    }
                    return new { 
                        PagoId = ultimo != null && ultimo.PagoId != null ? Convert.ToInt32(ultimo.PagoId) : 0, 
                        FechaPago = ultimo != null ? (DateTime?)ultimo.FechaPago : null,
                        TasaBcv = ultimo != null && ultimo.TasaBcv != null ? (decimal?)Convert.ToDecimal(ultimo.TasaBcv) : null,
                        TotalBrutoBs = totalBruto,
                        TotalAdelantosBs = totalAdelantos,
                        TotalNetoBs = totalNeto
                    };
                });

            var sqlAdelantosFincas = @"
                SELECT 
                    a.EntidadId AS FincaId,
                    ISNULL(SUM(CASE WHEN c.Estado = 'COBRADO' AND ISNULL(c.MontoCobradoBs, 0) > 0 THEN c.MontoCobradoBs ELSE (c.MontoCuotaUSD * @tasaActual) END), 0) AS TotalAdelantosBs,
                    ISNULL(SUM(c.MontoCuotaUSD), 0) AS TotalAdelantosUSD,
                    MAX(CONCAT('Cuota ', c.NumeroCuota, ' de ', a.NumeroCuotas)) AS CuotasDetalle
                FROM TB_ADELANTOS a
                INNER JOIN TB_ADELANTOS_CUOTAS c ON a.Id = c.AdelantoId
                WHERE a.TipoEntidad = 'FINCA' 
                  AND c.Estado <> 'POSPUESTO'
                  AND c.Estado <> 'ANULADA'
                  AND (
                    (@targetCicloId > 0 AND c.SemanaOperativaId = @targetCicloId)
                    OR (
                        @targetCicloId <= 0 
                        AND EXISTS (
                            SELECT 1 FROM TB_CICLOS_OPERATIVOS co 
                            WHERE co.Id = c.SemanaOperativaId 
                              AND co.FechaInicio >= @fechaInicio AND co.FechaFin <= @fechaFin
                        )
                    )
                  )
                GROUP BY a.EntidadId";

            var adelantosRaw = (await connection.QueryAsync<dynamic>(sqlAdelantosFincas, new { 
                targetCicloId, 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date, 
                tasaActual 
            })).ToList();
            var adelantosFincasMap = adelantosRaw
                .Where(x => x.FincaId != null)
                .GroupBy(x => Convert.ToInt32(x.FincaId))
                .ToDictionary(
                    g => g.Key, 
                    g => {
                        var items = g.ToList();
                        decimal totalBs = 0m;
                        decimal totalUsd = 0m;
                        string? cuotasDet = null;
                        foreach (var it in items)
                        {
                            if (it.TotalAdelantosBs != null) totalBs += Convert.ToDecimal(it.TotalAdelantosBs);
                            if (it.TotalAdelantosUSD != null) totalUsd += Convert.ToDecimal(it.TotalAdelantosUSD);
                            if (cuotasDet == null && it.CuotasDetalle != null) cuotasDet = Convert.ToString(it.CuotasDetalle);
                        }
                        return new { 
                            TotalAdelantosBs = totalBs, 
                            TotalAdelantosUSD = totalUsd, 
                            CuotasDetalle = cuotasDet 
                        };
                    });

            foreach (var finca in fincas)
            {
                int id = Convert.ToInt32(finca.Id);
                string nombre = Convert.ToString(finca.Nombre) ?? "";
                string? prop = Convert.ToString(finca.Propietario);
                string? rif = Convert.ToString(finca.CedulaRIF);
                decimal precio = Convert.ToDecimal(finca.PrecioLitroUSD ?? 0m);
                decimal precioAcida = Convert.ToDecimal(finca.PrecioLitroAcidaUSD ?? 0m);
                bool tieneDosTipos = finca.TieneDosTiposLeche != null && Convert.ToBoolean(finca.TieneDosTiposLeche);
                decimal precioBufala = Convert.ToDecimal(finca.PrecioBufalaLitroUSD ?? 0m);

                var detalle = detallesPorFinca.ContainsKey(id) ? detallesPorFinca[id] : new List<ReporteDetalleItemDto>();

                bool esPagado = pagosMap.ContainsKey(id);
                int? pagoId = esPagado ? pagosMap[id].PagoId : null;
                DateTime? fechaPago = esPagado ? pagosMap[id].FechaPago : null;
                decimal tasaAplicada = (esPagado && pagosMap[id].TasaBcv.HasValue && pagosMap[id].TasaBcv.Value > 0)
                    ? pagosMap[id].TasaBcv.Value
                    : tasaActual;

                decimal adelantoUSD = adelantosFincasMap.ContainsKey(id) ? adelantosFincasMap[id].TotalAdelantosUSD : 0;
                decimal adelantoBs = (esPagado && pagosMap[id].TotalAdelantosBs > 0)
                    ? pagosMap[id].TotalAdelantosBs
                    : (adelantosFincasMap.ContainsKey(id) ? adelantosFincasMap[id].TotalAdelantosBs : (adelantoUSD * tasaAplicada));
                string? cuotasDet = adelantosFincasMap.ContainsKey(id) ? adelantosFincasMap[id].CuotasDetalle : null;

                if (tieneDosTipos)
                {
                    var detalleVaca = detalle.Where(d => (d.TipoLeche ?? "VACA").ToUpper() != "BUFALA").ToList();
                    var detalleBufala = detalle.Where(d => (d.TipoLeche ?? "VACA").ToUpper() == "BUFALA").ToList();

                    if (detalleVaca.Any() || !detalleBufala.Any())
                    {
                        int totalLitrosV = detalleVaca.Sum(d => d.Litros);
                        decimal totalUSDV = detalleVaca.Sum(d => d.Litros * d.PrecioLitroUSDAplicado);
                        decimal totalBsV = (esPagado && pagosMap[id].TotalBrutoBs > 0 && !detalleBufala.Any())
                            ? pagosMap[id].TotalBrutoBs
                            : (totalUSDV * tasaAplicada);

                        resultado.Add(new ReporteEntidadResumenDto
                        {
                            Id = id,
                            Nombre = $"{nombre} (Vaca)",
                            Propietario = prop,
                            CedulaRIF = rif,
                            TipoServicioId = finca.TipoServicioId != null ? Convert.ToInt32(finca.TipoServicioId) : 1,
                            TipoServicioNombre = finca.TipoServicioNombre != null ? Convert.ToString(finca.TipoServicioNombre)! : "RUTA",
                            PrecioLitroUSD = precio,
                            PrecioLitroAcidaUSD = precioAcida,
                            TasaBcv = tasaAplicada,
                            Detalle = detalleVaca,
                            TotalLitros = totalLitrosV,
                            TotalUSD = totalUSDV,
                            TotalBs = totalBsV,
                            TotalAdelantosUSD = adelantoUSD,
                            TotalAdelantosBs = adelantoBs,
                            CuotasDetalle = cuotasDet,
                            EsPagado = esPagado,
                            PagoId = pagoId,
                            FechaPago = fechaPago
                        });
                    }

                    if (detalleBufala.Any())
                    {
                        int totalLitrosB = detalleBufala.Sum(d => d.Litros);
                        decimal totalUSDB = detalleBufala.Sum(d => d.Litros * d.PrecioLitroUSDAplicado);
                        decimal totalBsB = totalUSDB * tasaAplicada;

                        resultado.Add(new ReporteEntidadResumenDto
                        {
                            Id = id,
                            Nombre = $"{nombre} (Búfala)",
                            Propietario = prop,
                            CedulaRIF = rif,
                            TipoServicioId = finca.TipoServicioId != null ? Convert.ToInt32(finca.TipoServicioId) : 1,
                            TipoServicioNombre = finca.TipoServicioNombre != null ? Convert.ToString(finca.TipoServicioNombre)! : "RUTA",
                            PrecioLitroUSD = precioBufala > 0 ? precioBufala : precio,
                            PrecioLitroAcidaUSD = precioAcida,
                            TasaBcv = tasaAplicada,
                            Detalle = detalleBufala,
                            TotalLitros = totalLitrosB,
                            TotalUSD = totalUSDB,
                            TotalBs = totalBsB,
                            TotalAdelantosUSD = 0,
                            TotalAdelantosBs = 0,
                            CuotasDetalle = null,
                            EsPagado = esPagado,
                            PagoId = pagoId,
                            FechaPago = fechaPago
                        });
                    }
                }
                else
                {
                    int totalLitros = detalle.Sum(d => d.Litros);
                    decimal totalUSD = detalle.Sum(d => d.Litros * d.PrecioLitroUSDAplicado);
                    decimal totalBs = (esPagado && pagosMap[id].TotalBrutoBs > 0)
                        ? pagosMap[id].TotalBrutoBs
                        : (totalUSD * tasaAplicada);

                    resultado.Add(new ReporteEntidadResumenDto
                    {
                        Id = id,
                        Nombre = nombre,
                        Propietario = prop,
                        CedulaRIF = rif,
                        TipoServicioId = finca.TipoServicioId != null ? Convert.ToInt32(finca.TipoServicioId) : 1,
                        TipoServicioNombre = finca.TipoServicioNombre != null ? Convert.ToString(finca.TipoServicioNombre)! : "RUTA",
                        PrecioLitroUSD = precio,
                        PrecioLitroAcidaUSD = precioAcida,
                        TasaBcv = tasaAplicada,
                        Detalle = detalle,
                        TotalLitros = totalLitros,
                        TotalUSD = totalUSD,
                        TotalBs = totalBs,
                        TotalAdelantosUSD = adelantoUSD,
                        TotalAdelantosBs = adelantoBs,
                        CuotasDetalle = cuotasDet,
                        EsPagado = esPagado,
                        PagoId = pagoId,
                        FechaPago = fechaPago
                    });
                }
            }

            return resultado;
        }

        public async Task<List<ReporteEntidadResumenDto>> ObtenerReporteChoferesAsync(DateTime fechaInicio, DateTime fechaFin, int? choferId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            decimal tasaActual = await ObtenerTasaActualAsync(connection);

            var sqlChoferes = @"
                SELECT DISTINCT u.Id, ISNULL(u.NombreCompleto, u.Username) AS Nombre, u.Username
                FROM TB_USUARIOS u
                WHERE (@choferId IS NULL OR u.Id = @choferId)
                  AND (
                    EXISTS (
                        SELECT 1 FROM TB_CONTROL_RUTAS cr
                        WHERE cr.UsuarioId = u.Id AND cr.Fecha >= @fechaInicio AND cr.Fecha <= @fechaFin
                    ) OR EXISTS (
                        SELECT 1 FROM TB_RUTAS_RECOLECCION r
                        WHERE r.UsuarioId = u.Id AND r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin
                    )
                  )
                ORDER BY Nombre";

            var choferes = (await connection.QueryAsync<dynamic>(sqlChoferes, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date, choferId })).ToList();

            if (!choferes.Any() && choferId.HasValue)
            {
                var sqlChoferSingle = @"
                    SELECT u.Id, ISNULL(u.NombreCompleto, u.Username) AS Nombre, u.Username
                    FROM TB_USUARIOS u
                    WHERE u.Id = @choferId";
                choferes = (await connection.QueryAsync<dynamic>(sqlChoferSingle, new { choferId })).ToList();
            }

            var resultado = new List<ReporteEntidadResumenDto>();

            var sqlDetalleControl = @"
                SELECT 
                    CONVERT(varchar(10), cr.Fecha, 120) AS Fecha,
                    cr.Id AS TicketId,
                    (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0)) AS TotalLitrosFinca,
                    (CASE 
                        WHEN cr.TipoDestino IN ('COMPANIA_DIRECTA', 'DIRECTO', 'RECEPTORIA_Y_COMPANIA') THEN ISNULL(cr.LitrosEntregadosCompania, (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0)))
                        ELSE ISNULL(cr.TotalLitrosReceptoria, (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0)))
                     END) AS LitrosEntregados,
                    -- Balance Neto del Chofer: Entregado - (Finca + CargadoAdicional) (Negativo = Falta/Pérdida, Positivo = Ganancia/Sobrante)
                    ((CASE 
                        WHEN cr.TipoDestino IN ('COMPANIA_DIRECTA', 'DIRECTO', 'RECEPTORIA_Y_COMPANIA') THEN ISNULL(cr.LitrosEntregadosCompania, (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0)))
                        ELSE ISNULL(cr.TotalLitrosReceptoria, (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0)))
                     END) - (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0))) AS Litros,
                    ISNULL(cr.MermaTotalLitros, ISNULL(cr.DiferenciaLitros, 0)) AS MermaLitros,
                    ISNULL(cr.PorcentajeMerma, 0) AS PorcentajeMerma,
                    cr.TipoDestino AS TipoDestino,
                    ISNULL(c.Nombre, 'RECEPTORIA') AS DestinoNombre,
                    COALESCE(
                        NULLIF(LTRIM(RTRIM(cr.Observacion)), ''),
                        'Ticket #' + CAST(cr.Id AS varchar(20)) + ' (' + 
                        CASE WHEN cr.TipoDestino IN ('COMPANIA_DIRECTA', 'DIRECTO', 'RECEPTORIA_Y_COMPANIA') THEN 'Directo Planta: ' + ISNULL(c.Nombre, 'Compañía') 
                             ELSE 'Receptoría' END + ')'
                    ) AS Observacion,
                    ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                    'CONTROL DE VIAJES' AS EntidadNombre
                FROM TB_CONTROL_RUTAS cr
                LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cr.CompaniaDestinoId = c.Id
                WHERE cr.UsuarioId = @id
                  AND cr.Fecha >= @fechaInicio AND cr.Fecha <= @fechaFin
                  AND cr.ProcesoActualId >= 2
                ORDER BY cr.Fecha, cr.Id";

            foreach (var ch in choferes)
            {
                int id = (int)ch.Id;
                string nombre = (string)ch.Nombre;

                var detalle = (await connection.QueryAsync<ReporteDetalleItemDto>(sqlDetalleControl, new { id, fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
                if (!detalle.Any())
                {
                    var sqlFallbackDetalle = @"
                        SELECT 
                            CONVERT(varchar(10), r.Fecha, 120) AS Fecha,
                            NULL AS TicketId,
                            ISNULL(SUM(r.Litros), 0) AS TotalLitrosFinca,
                            ISNULL(SUM(r.Litros), 0) AS LitrosEntregados,
                            0 AS MermaLitros,
                            0 AS PorcentajeMerma,
                            ISNULL(SUM(r.Litros), 0) AS Litros,
                            'RUTA' AS TipoDestino,
                            'RUTA TRADICIONAL' AS DestinoNombre,
                            ISNULL(MAX(r.Observacion), '') AS Observacion,
                            ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                            'CHOFERES' AS EntidadNombre
                        FROM TB_RUTAS_RECOLECCION r
                        INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                        LEFT JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                        WHERE r.UsuarioId = @id
                          AND r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin
                          AND (r.FincaId = 68 OR f.Nombre LIKE '%CHOFER%')
                          AND r.Litros <> 0
                        GROUP BY CONVERT(varchar(10), r.Fecha, 120), u.NombreCompleto, u.Username
                        ORDER BY Fecha";
                    detalle = (await connection.QueryAsync<ReporteDetalleItemDto>(sqlFallbackDetalle, new { id, fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
                }

                if (!detalle.Any() && !choferId.HasValue)
                {
                    // Si no se filtró por un chofer en específico y este chofer no tiene registros de falta/ganancia, no lo incluimos
                    continue;
                }

                int totalBalanceLitros = detalle.Sum(d => d.Litros);
                int sumFinca = detalle.Sum(d => d.TotalLitrosFinca > 0 ? d.TotalLitrosFinca : Math.Abs(d.Litros));
                int sumEntregados = detalle.Sum(d => d.LitrosEntregados);
                int sumMerma = detalle.Sum(d => d.MermaLitros);
                decimal pctGlobal = sumFinca > 0 ? Math.Round(((decimal)Math.Abs(totalBalanceLitros) / (decimal)sumFinca) * 100m, 2) : 0m;

                resultado.Add(new ReporteEntidadResumenDto
                {
                    Id = id,
                    Nombre = nombre,
                    PrecioLitroUSD = 0,
                    TasaBcv = tasaActual,
                    Detalle = detalle,
                    TotalLitros = totalBalanceLitros,
                    TotalLitrosFinca = sumFinca,
                    TotalLitrosEntregados = sumEntregados,
                    TotalMermaLitros = totalBalanceLitros,
                    PorcentajeMermaGlobal = pctGlobal,
                    TotalUSD = 0,
                    TotalBs = 0
                });
            }

            return resultado;
        }

        public async Task<List<ReporteBancoFincaDto>> ObtenerReporteBancosFincasAsync(DateTime fechaInicio, DateTime fechaFin, int? bancoId = null, int? cicloId = null, decimal? tasaBcvManual = null)
        {
            using var connection = new SqlConnection(_connectionString);
            decimal tasaActual = tasaBcvManual ?? await ObtenerTasaActualAsync(connection);

            int cId = cicloId ?? 0;
            if (cId <= 0)
            {
                cId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaInicio >= FechaInicio AND @fechaInicio <= FechaFin", 
                    new { fechaInicio = fechaInicio.Date }) ?? 0;

                if (cId <= 0)
                {
                    cId = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC") ?? 0;
                }
            }

            var preliqList = (await _catalogosRepository.ObtenerPreLiquidacionSemanaAsync(cId)).ToList();

            var rows = preliqList
                .Where(p => !bancoId.HasValue || p.BancoId == bancoId)
                .Select(p => new ReporteBancoFincaDto
                {
                    FincaId = p.FincaId,
                    FincaNombre = p.FincaNombre,
                    Propietario = p.Propietario,
                    CedulaRIF = string.IsNullOrWhiteSpace(p.CedulaRIF) ? "N/A" : p.CedulaRIF,
                    BancoId = p.BancoId,
                    BancoNombre = string.IsNullOrWhiteSpace(p.BancoNombre) ? "SIN BANCO ASIGNADO" : p.BancoNombre,
                    NumeroCuenta = string.IsNullOrWhiteSpace(p.NumeroCuenta) ? "N/A" : p.NumeroCuenta,
                    PrecioLitroUSD = p.PrecioLitroUSD,
                    TotalLitros = p.TotalLitros,
                    TotalUSD = p.TotalUSD,
                    TotalAdelantosUSD = p.TotalAdelantosUSD,
                    TotalAdelantosBs = p.TotalAdelantosBs + p.OtrasDeduccionesBs,
                    TasaBcv = p.PaidTasaBcv ?? tasaActual,
                    TotalNetoBs = p.TotalNetoBs,
                    EsPagado = p.EsPagado,
                    PagoId = p.PagoId > 0 ? p.PagoId : null,
                    FechaPago = p.FechaPago
                })
                .OrderBy(r => r.BancoNombre)
                .ThenBy(r => r.FincaNombre)
                .ToList();

            return rows;
        }

        public async Task<List<ReporteRelacionCompaniaDto>> ObtenerReporteRelacionCompaniasAsync(DateTime fechaInicio, DateTime fechaFin, int? companiaId = null, int? cicloId = null, decimal? tasaBcvManual = null)
        {
            using var connection = new SqlConnection(_connectionString);
            decimal tasaActual = tasaBcvManual ?? await ObtenerTasaActualAsync(connection);

            int cId = cicloId ?? 0;
            if (cId <= 0)
            {
                cId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaInicio >= FechaInicio AND @fechaInicio <= FechaFin", 
                    new { fechaInicio = fechaInicio.Date }) ?? 0;

                if (cId <= 0)
                {
                    cId = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC") ?? 0;
                }
            }

            var sqlEntregas = @"
                WITH EntregasUnificadas AS (
                    -- 1. Control compañías (desglose exacto de litros y tipo de leche)
                    SELECT 
                        cc.Id,
                        cc.CompaniaId,
                        c.Nombre AS CompaniaNombre,
                        ISNULL(c.Encargado, '') AS Encargado,
                        c.Telefono,
                        c.PrecioCompraLitroUSD,
                        cc.Fecha,
                        COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0) AS Litros,
                        ISNULL(cc.TipoLeche, 'VACA') AS TipoLeche,
                        ISNULL(cc.Observacion, '') AS Observacion,
                        ISNULL(u.NombreCompleto, ISNULL(u.Username, ISNULL(uRuta.NombreCompleto, ISNULL(uRuta.Username, 'OTROS')))) AS ChoferNombre
                    FROM TB_CONTROL_COMPANIAS cc
                    INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                    LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                    LEFT JOIN TB_CONTROL_RUTAS cr ON cc.ControlRutaId = cr.Id
                    LEFT JOIN TB_USUARIOS uRuta ON cr.UsuarioId = uRuta.Id
                    WHERE cc.Fecha >= @fechaInicio AND cc.Fecha <= @fechaFin
                      AND UPPER(c.Nombre) NOT LIKE '%RECEPTORIA%'
                      AND UPPER(c.Nombre) NOT LIKE '%RECEPTORÍA%'
                      AND (cc.LitrosDespachados > 0 OR cc.LitrosRecibidosCompania > 0)
                      AND (@companiaId IS NULL OR cc.CompaniaId = @companiaId)

                    UNION ALL

                    -- 2. Entregas independientes en TB_ENTREGAS_COMPANIA no asociadas a un ControlCompaniaId ni a un viaje desglosado
                    SELECT 
                        e.Id,
                        e.CompaniaId,
                        c.Nombre AS CompaniaNombre,
                        ISNULL(c.Encargado, '') AS Encargado,
                        c.Telefono,
                        c.PrecioCompraLitroUSD,
                        e.Fecha,
                        e.Litros,
                        ISNULL(e.TipoLeche, 'VACA') AS TipoLeche,
                        ISNULL(e.Observacion, '') AS Observacion,
                        ISNULL(u.NombreCompleto, ISNULL(u.Username, ISNULL(uRuta.NombreCompleto, ISNULL(uRuta.Username, 'OTROS')))) AS ChoferNombre
                    FROM TB_ENTREGAS_COMPANIA e
                    INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                    LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                    LEFT JOIN TB_CONTROL_RUTAS cr ON e.ControlRutaId = cr.Id
                    LEFT JOIN TB_USUARIOS uRuta ON cr.UsuarioId = uRuta.Id
                    WHERE e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin
                      AND e.Litros > 0
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND UPPER(c.Nombre) NOT LIKE '%RECEPTORIA%'
                      AND UPPER(c.Nombre) NOT LIKE '%RECEPTORÍA%'
                      AND (@companiaId IS NULL OR e.CompaniaId = @companiaId)
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE) AND cc2.UsuarioId = e.UsuarioId)
                            )
                      )
                )
                SELECT * FROM EntregasUnificadas
                ORDER BY CompaniaNombre, Fecha, Id";

            var entregas = (await connection.QueryAsync<dynamic>(sqlEntregas, new { 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date, 
                companiaId 
            })).ToList();

            var companiasIds = entregas.Select(x => (int)x.CompaniaId).Distinct().ToList();
            if (companiaId.HasValue && !companiasIds.Contains(companiaId.Value))
            {
                companiasIds.Add(companiaId.Value);
            }

            var sqlCompanias = @"
                SELECT c.Id, c.Nombre, ISNULL(c.Encargado, '') AS Encargado, c.Telefono, 
                       ISNULL(c.PrecioCompraLitroUSD, 0) AS PrecioCompraLitroUSD,
                       ISNULL(c.PrecioBufalaLitroUSD, c.PrecioCompraLitroUSD) AS PrecioBufalaLitroUSD,
                       ISNULL(c.PrecioAcidaLitroUSD, 0) AS PrecioAcidaLitroUSD,
                       ISNULL(c.DiaAperturaSemana, 'Martes') AS DiaAperturaSemana,
                       ISNULL(c.DiaCierreSemana, 'Lunes') AS DiaCierreSemana,
                       ISNULL(c.TipoServicioId, 1) AS TipoServicioId, ISNULL(ts.Nombre, 'RUTA') AS TipoServicioNombre
                FROM TB_COMPANIAS c
                LEFT JOIN TB_TIPO_SERVICIO ts ON c.TipoServicioId = ts.Id
                WHERE (c.Id IN @companiasIds OR (@companiaId IS NOT NULL AND c.Id = @companiaId))
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORIA%'
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORÍA%'
                  AND c.IsDeleted = 0";

            var companias = companiasIds.Any()
                ? (await connection.QueryAsync<dynamic>(sqlCompanias, new { companiasIds, companiaId })).ToList()
                : new List<dynamic>();

            var sqlAbonos = @"
                SELECT 
                    a.EntidadId AS CompaniaId,
                    ISNULL(SUM(CASE WHEN c.MontoCobradoUSD > 0 THEN c.MontoCobradoUSD ELSE c.MontoCuotaUSD END), 0) AS TotalAbonosUSD,
                    ISNULL(SUM(c.MontoCobradoBs), 0) AS TotalAbonosBs
                FROM TB_ADELANTOS a
                INNER JOIN TB_ADELANTOS_CUOTAS c ON a.Id = c.AdelantoId
                WHERE a.TipoEntidad IN ('COMPANIA', 'RECEPTORIA')
                  AND (
                    (@cId > 0 AND c.SemanaOperativaId = @cId)
                    OR (@cId <= 0 AND (c.CreatedAt >= @fechaInicio AND c.CreatedAt <= @fechaFin))
                  )
                  AND c.Estado != 'ANULADA'
                GROUP BY a.EntidadId";

            var abonos = (await connection.QueryAsync<dynamic>(sqlAbonos, new { cId, fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
            var abonosMap = abonos.ToDictionary(x => (int)x.CompaniaId, x => new { 
                USD = (decimal)x.TotalAbonosUSD, 
                Bs = (decimal)x.TotalAbonosBs 
            });

            var entregasGrouped = entregas.GroupBy(x => (int)x.CompaniaId).ToDictionary(g => g.Key, g => g.ToList());

            var resultado = new List<ReporteRelacionCompaniaDto>();

            foreach (var comp in companias)
            {
                int cIdComp = (int)comp.Id;
                string cNom = (string)comp.Nombre;
                string enc = (string)comp.Encargado;
                string? tel = (string?)comp.Telefono;
                decimal precioVaca = (decimal)comp.PrecioCompraLitroUSD;
                decimal precioBufala = comp.PrecioBufalaLitroUSD != null ? (decimal)comp.PrecioBufalaLitroUSD : precioVaca;
                decimal precioAcida = comp.PrecioAcidaLitroUSD != null ? (decimal)comp.PrecioAcidaLitroUSD : 0m;
                string diaApertura = comp.DiaAperturaSemana != null ? (string)comp.DiaAperturaSemana : "Martes";
                string diaCierre = comp.DiaCierreSemana != null ? (string)comp.DiaCierreSemana : "Lunes";
                int tipoServId = comp.TipoServicioId != null ? (int)comp.TipoServicioId : 1;
                string tipoServNom = comp.TipoServicioNombre != null ? (string)comp.TipoServicioNombre : "RUTA";

                var det = entregasGrouped.ContainsKey(cIdComp) ? entregasGrouped[cIdComp] : new List<dynamic>();
                int totLitros = 0;
                decimal totUSD = 0;

                var detalleList = new List<EntregaItemDto>();
                foreach (var d in det)
                {
                    int dLitros = (int)d.Litros;
                    string dTipo = ((string)(d.TipoLeche ?? "VACA")).ToUpper();
                    string dObs = ((string)(d.Observacion ?? "")).ToUpper();

                    decimal dPrecio = precioVaca;
                    if (dTipo.Contains("BUFAL"))
                    {
                        dPrecio = precioBufala;
                    }
                    else if (dTipo.Contains("ACID") || dTipo.Contains("ÁCID") || dTipo.Contains("MALA") || (dTipo != "VACA" && (dObs.Contains("[ACIDA]") || dObs.Contains("[LECHE ÁCIDA]"))))
                    {
                        dPrecio = precioAcida;
                    }

                    totLitros += dLitros;
                    totUSD += (dLitros * dPrecio);

                    detalleList.Add(new EntregaItemDto
                    {
                        Id = (int)d.Id,
                        CompaniaId = cIdComp,
                        CompaniaNombre = cNom,
                        Fecha = (DateTime)d.Fecha,
                        Litros = dLitros,
                        TipoLeche = (string)(d.TipoLeche ?? "VACA"),
                        PrecioVentaUSD = dPrecio,
                        SubtotalUSD = Math.Round(dLitros * dPrecio, 2),
                        Observacion = (string)d.Observacion,
                        ConductorNombre = (string)d.ChoferNombre,
                        ChoferNombre = (string)d.ChoferNombre
                    });
                }
                totUSD = Math.Round(totUSD, 2);

                decimal abonoUSD = 0;
                decimal abonoBs = 0;
                if (abonosMap.TryGetValue(cIdComp, out var abonoData))
                {
                    abonoUSD = abonoData.USD;
                    abonoBs = abonoData.Bs;
                }

                decimal totBrutoBs = Math.Round(totUSD * tasaActual, 2);
                decimal deduccionesTotalBs = abonoBs + (abonoUSD * tasaActual);
                decimal totNetoBs = Math.Round(totBrutoBs - deduccionesTotalBs, 2);
                decimal totNetoUSD = tasaActual > 0 ? Math.Round(totNetoBs / tasaActual, 2) : totUSD - abonoUSD;

                resultado.Add(new ReporteRelacionCompaniaDto
                {
                    CompaniaId = cIdComp,
                    CompaniaNombre = cNom,
                    Encargado = enc,
                    Telefono = tel,
                    CedulaRIF = "N/A",
                    BancoNombre = "N/A",
                    NumeroCuenta = "N/A",
                    PrecioLitroUSD = precioVaca,
                    PrecioBufalaLitroUSD = precioBufala,
                    PrecioAcidaLitroUSD = precioAcida,
                    DiaAperturaSemana = diaApertura,
                    DiaCierreSemana = diaCierre,
                    TipoServicioId = tipoServId,
                    TipoServicioNombre = tipoServNom,
                    TotalLitros = totLitros,
                    TotalUSD = totUSD,
                    TotalAbonosUSD = abonoUSD,
                    TotalAbonosBs = abonoBs,
                    TasaBcv = tasaActual,
                    TotalBrutoBs = totBrutoBs,
                    TotalNetoBs = totNetoBs,
                    TotalNetoUSD = totNetoUSD,
                    EsPagado = false,
                    PagoId = null,
                    FechaPago = null,
                    EntregasDetalle = detalleList
                });
            }

            return resultado.OrderBy(r => r.CompaniaNombre).ToList();
        }

        public async Task<List<ReporteRelacionChoferDto>> ObtenerReporteRelacionChoferesAsync(DateTime fechaInicio, DateTime fechaFin)
        {
            using var connection = new SqlConnection(_connectionString);

            var sql = @"
                SELECT 
                    c.UsuarioId,
                    ISNULL(u.NombreCompleto, u.Username) AS Chofer,
                    SUM(c.TotalLitrosFinca) AS LitrosRuta,
                    SUM(c.TotalLitrosReceptoria + ISNULL(c.LitrosEntregadosCompania, 0)) AS LitrosQuesera
                FROM TB_CONTROL_RUTAS c
                LEFT JOIN TB_USUARIOS u ON c.UsuarioId = u.Id
                WHERE c.Fecha >= @fechaInicio AND c.Fecha <= @fechaFin
                GROUP BY c.UsuarioId, u.NombreCompleto, u.Username
                ORDER BY Chofer";

            var rows = (await connection.QueryAsync<ReporteRelacionChoferDto>(sql, new { 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date 
            })).ToList();

            if (!rows.Any())
            {
                var sqlFallback = @"
                    WITH RutasPorChofer AS (
                        SELECT 
                            r.UsuarioId,
                            ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                            SUM(r.Litros) AS LitrosRuta
                        FROM TB_RUTAS_RECOLECCION r
                        LEFT JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                        WHERE r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin
                          AND r.FincaId != 68
                        GROUP BY r.UsuarioId, u.NombreCompleto, u.Username
                    ),
                    EntregasPorChofer AS (
                        SELECT 
                            e.UsuarioId,
                            ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                            SUM(e.Litros) AS LitrosQuesera
                        FROM TB_ENTREGAS_COMPANIA e
                        LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                        WHERE e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin
                          AND e.Litros > 0
                        GROUP BY e.UsuarioId, u.NombreCompleto, u.Username
                    )
                    SELECT 
                        COALESCE(r.UsuarioId, e.UsuarioId, 0) AS UsuarioId,
                        COALESCE(r.ChoferNombre, e.ChoferNombre, 'OTROS') AS Chofer,
                        ISNULL(r.LitrosRuta, 0) AS LitrosRuta,
                        ISNULL(e.LitrosQuesera, 0) AS LitrosQuesera
                    FROM RutasPorChofer r
                    FULL OUTER JOIN EntregasPorChofer e ON r.UsuarioId = e.UsuarioId
                    ORDER BY Chofer";

                rows = (await connection.QueryAsync<ReporteRelacionChoferDto>(sqlFallback, new { 
                    fechaInicio = fechaInicio.Date, 
                    fechaFin = fechaFin.Date 
                })).ToList();
            }

            // Consultar detalle completo de fincas recogidas por fecha, chofer y observaciones
            var sqlDetalleFincas = @"
                SELECT 
                    r.Id,
                    r.Fecha,
                    r.UsuarioId,
                    r.FincaId,
                    ISNULL(f.Nombre, 'FINCA ' + CAST(r.FincaId AS varchar(10))) AS FincaNombre,
                    ISNULL(f.Propietario, '') AS Propietario,
                    ISNULL(r.Litros, 0) AS Litros,
                    ISNULL(r.TipoLeche, 'VACA') AS TipoLeche,
                    ISNULL(r.Observacion, '') AS Observacion,
                    ISNULL(r.ControlRutaId, 0) AS TicketControlId
                FROM TB_RUTAS_RECOLECCION r
                LEFT JOIN TB_FINCAS f ON r.FincaId = f.Id
                WHERE r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin
                  AND r.FincaId != 68
                  AND r.Litros > 0
                ORDER BY r.Fecha DESC, r.Id DESC";

            var detalleFincas = (await connection.QueryAsync<ReporteRelacionChoferDetalleDto>(sqlDetalleFincas, new { 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date 
            })).ToList();

            var sqlDetalleDiario = @"
                SELECT 
                    c.UsuarioId,
                    CONVERT(varchar(10), c.Fecha, 120) AS Fecha,
                    c.Id AS TicketId,
                    ISNULL(c.TotalLitrosFinca, 0) AS LitrosRuta,
                    ISNULL(CASE WHEN c.TipoDestino IN ('COMPANIA_DIRECTA', 'DIRECTO', 'RECEPTORIA_Y_COMPANIA') 
                                THEN ISNULL(c.LitrosEntregadosCompania, c.TotalLitrosReceptoria) 
                                ELSE c.TotalLitrosReceptoria END, 0) AS LitrosQuesera,
                    ISNULL(c.Observacion, '') AS Observacion,
                    ISNULL(c.TipoDestino, 'RECEPTORIA') AS Destino
                FROM TB_CONTROL_RUTAS c
                WHERE c.Fecha >= @fechaInicio AND c.Fecha <= @fechaFin
                ORDER BY c.Fecha DESC, c.Id DESC";

            var detalleDiario = (await connection.QueryAsync<ReporteRelacionChoferDiarioDto>(sqlDetalleDiario, new { 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date 
            })).ToList();

            foreach (var ch in rows)
            {
                ch.DetalleFincas = detalleFincas.Where(d => d.UsuarioId == ch.UsuarioId).ToList();
                ch.DetalleDiario = detalleDiario.Where(d => d.UsuarioId == ch.UsuarioId).ToList();
            }

            return rows;
        }

        public async Task<DashboardAvanzadoDto> ObtenerDashboardAvanzadoAsync(int semanas = 8, int? usuarioId = null)
        {
            if (semanas <= 0) semanas = 8;
            using var connection = new SqlConnection(_connectionString);
            var res = new DashboardAvanzadoDto();

            // 1. Tendencia N Semanas (Ordenadas cronológicamente ASC)
            var sqlSemanas = @"
                WITH UltimosCiclos AS (
                    SELECT TOP (@semanas) c.Id AS CicloId, c.Codigo AS Semana
                    FROM TB_CICLOS_OPERATIVOS c
                    WHERE (c.Estado IN ('ABIERTO', 'CERRADO') 
                           OR EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION r WHERE r.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_RUTAS cr WHERE cr.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc WHERE cc.CicloId = c.Id))
                    ORDER BY c.Id DESC
                )
                SELECT uc.CicloId, uc.Semana,
                    ISNULL((
                        SELECT SUM(r.Litros) 
                        FROM TB_RUTAS_RECOLECCION r 
                        WHERE r.CicloId = uc.CicloId AND r.FincaId != 68 
                          AND (@usuarioId IS NULL OR r.UsuarioId = @usuarioId)
                    ), 0) AS Recolectado,
                    ISNULL((
                        SELECT SUM(CASE WHEN cr.TipoDestino = 'COMPANIA_DIRECTA' THEN ISNULL(cr.LitrosEntregadosCompania, cr.TotalLitrosFinca) ELSE ISNULL(cr.TotalLitrosReceptoria, cr.TotalLitrosFinca) END) 
                        FROM TB_CONTROL_RUTAS cr 
                        WHERE cr.CicloId = uc.CicloId AND cr.ProcesoActualId >= 2
                          AND (@usuarioId IS NULL OR cr.UsuarioId = @usuarioId)
                    ), 0) AS Entregado
                FROM UltimosCiclos uc
                ORDER BY uc.CicloId ASC";
            res.TendenciaSemanas = (await connection.QueryAsync<TendenciaSemanaItemDto>(sqlSemanas, new { semanas, usuarioId })).ToList();

            // 2. Desempeño Conductores (en las N semanas)
            var sqlChoferes = @"
                WITH UltimosCiclos AS (
                    SELECT DISTINCT TOP (@semanas) c.Id AS CicloId
                    FROM TB_CICLOS_OPERATIVOS c
                    WHERE (c.Estado IN ('ABIERTO', 'CERRADO') 
                           OR EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION r WHERE r.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_RUTAS cr WHERE cr.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc WHERE cc.CicloId = c.Id))
                    ORDER BY c.Id DESC
                )
                SELECT TOP 10 u.NombreCompleto AS Conductor,
                    SUM(cr.TotalLitrosFinca) AS Litros,
                    COUNT(cr.Id) AS Viajes,
                    ISNULL((
                        SELECT COUNT(DISTINCT r.FincaId)
                        FROM TB_RUTAS_RECOLECCION r
                        WHERE r.UsuarioId = u.Id AND r.FincaId != 68
                          AND r.CicloId IN (SELECT CicloId FROM UltimosCiclos)
                    ), 0) AS Fincas
                FROM TB_CONTROL_RUTAS cr
                INNER JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                WHERE cr.CicloId IN (SELECT CicloId FROM UltimosCiclos)
                  AND (@usuarioId IS NULL OR cr.UsuarioId = @usuarioId)
                GROUP BY u.NombreCompleto, u.Id
                ORDER BY Litros DESC";
            res.DesempenoConductores = (await connection.QueryAsync<DesempenoConductorItemDto>(sqlChoferes, new { semanas, usuarioId })).ToList();

            // 3. Leche Ácida por Finca
            var sqlAcida = @"
                SELECT TOP 10 f.Nombre AS Finca,
                    SUM(r.Litros) AS LitrosAcidos
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                WHERE r.EsAcida = 1 
                  AND r.FincaId != 68
                  AND r.CicloId IN (
                      SELECT TOP (@semanas) c.Id 
                      FROM TB_CICLOS_OPERATIVOS c 
                      WHERE (c.Estado IN ('ABIERTO', 'CERRADO') 
                             OR EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION r0 WHERE r0.CicloId = c.Id)
                             OR EXISTS (SELECT 1 FROM TB_CONTROL_RUTAS cr0 WHERE cr0.CicloId = c.Id)
                             OR EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.CicloId = c.Id))
                      ORDER BY c.Id DESC
                  )
                  AND (@usuarioId IS NULL OR r.UsuarioId = @usuarioId)
                GROUP BY f.Nombre, f.Id
                ORDER BY LitrosAcidos DESC";
            res.LecheAcidaFincas = (await connection.QueryAsync<LecheAcidaFincaItemDto>(sqlAcida, new { semanas, usuarioId })).ToList();

            // 4. Entregas y Salidas a Compañías / Queseras (en las N semanas)
            var sqlPlantas = @"
                WITH UltimosCiclos AS (
                    SELECT DISTINCT TOP (@semanas) c.Id AS CicloId
                    FROM TB_CICLOS_OPERATIVOS c
                    WHERE (c.Estado IN ('ABIERTO', 'CERRADO') 
                           OR EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION r WHERE r.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_RUTAS cr WHERE cr.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc WHERE cc.CicloId = c.Id))
                    ORDER BY c.Id DESC
                ),
                SalidasCombined AS (
                    SELECT cc.CompaniaId, ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados) AS Litros, cc.CicloId, cc.UsuarioId
                    FROM TB_CONTROL_COMPANIAS cc
                    UNION ALL
                    SELECT e.CompaniaId, e.Litros, e.CicloId, e.UsuarioId
                    FROM TB_ENTREGAS_COMPANIA e
                    WHERE e.Litros > 0
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (cc2.CicloId = e.CicloId AND (cc2.UsuarioId = e.UsuarioId OR CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE)))
                            )
                      )
                )
                SELECT TOP 10 cp.Nombre AS Planta,
                    SUM(sc.Litros) AS Litros
                FROM SalidasCombined sc
                INNER JOIN TB_COMPANIAS cp ON sc.CompaniaId = cp.Id
                WHERE sc.CicloId IN (SELECT CicloId FROM UltimosCiclos)
                  AND (@usuarioId IS NULL OR sc.UsuarioId = @usuarioId)
                GROUP BY cp.Nombre, cp.Id
                ORDER BY Litros DESC";
            var plantasList = (await connection.QueryAsync<EntregaPlantaItemDto>(sqlPlantas, new { semanas, usuarioId })).ToList();

            decimal totalPl = plantasList.Sum(x => x.Litros);
            if (totalPl > 0)
            {
                plantasList.ForEach(p => p.Porcentaje = Math.Round((p.Litros / totalPl) * 100, 2));
            }
            res.EntregasPlantas = plantasList;

            // 5. Adelantos Riesgo Financiero (Exclusivo para ADMIN, Chofer nunca ve adelantos)
            if (!usuarioId.HasValue)
            {
                var sqlAdelantos = @"
                    SELECT TOP 10 f.Nombre AS Beneficiario,
                        a.MontoPendienteUSD,
                        a.MontoTotalUSD
                    FROM TB_ADELANTOS a
                    INNER JOIN TB_FINCAS f ON a.EntidadId = f.Id
                    WHERE a.Estado = 'ACTIVO' AND a.MontoPendienteUSD > 0
                    ORDER BY a.MontoPendienteUSD DESC";
                res.AdelantosRiesgo = (await connection.QueryAsync<AdelantoRiesgoItemDto>(sqlAdelantos)).ToList();
            }
            else
            {
                res.AdelantosRiesgo = new List<AdelantoRiesgoItemDto>();
            }

            return res;
        }
    }

    // =========================================================================
    // REPOSITORIO DE ADELANTOS Y CUOTAS POR CICLOS OPERATIVOS
    // =========================================================================

    public interface IAdelantosRepository
    {
        Task<List<AdelantoDto>> ObtenerAdelantosAsync(string? tipoEntidad = null, int? entidadId = null, string? estado = null);
        Task<AdelantoDto?> ObtenerPorIdAsync(int id);
        Task<AdelantoDto> CrearAdelantoAsync(CrearAdelantoDto dto, int? usuarioId = null);
        Task<bool> ActualizarCuotaAsync(int cuotaId, ActualizarCuotaAdelantoDto dto, int? usuarioId = null);
        Task<bool> PosponerCuotaAsync(int cuotaId, string? motivo, int? usuarioId = null, int? semanaOperativaIdDestino = null);
        Task<bool> DividirCuotaAsync(int cuotaId, decimal montoDescontarUSD, int? semanaOperativaIdDestino = null, string? motivo = null, int? usuarioId = null);
        Task<bool> MarcarPagoLiquidacionFincaAsync(int fincaId, DateTime fechaDesde, DateTime fechaHasta, bool pagado, decimal? tasaBcv, int? usuarioId = null);
        Task<bool> ReestructurarCuotasAsync(int adelantoId, ReestructurarCuotasDto dto, int? usuarioId = null);
        Task<bool> EliminarAdelantoAsync(int id);
        Task<List<AbonoDetalleDto>> ObtenerAbonosAsync(string? tipoEntidad = null, int? entidadId = null, int? cicloId = null);
        Task<bool> RegistrarAbonoDirectoAsync(RegistrarAbonoDirectoDto dto, int? usuarioId = null);
        Task<int> ActualizarTasaAdelantosActivosAsync(string tipoEntidad, decimal tasaBcv, int? usuarioId = null);
    }

    public class AdelantosRepository : IAdelantosRepository
    {
        private readonly string _connectionString;

        public AdelantosRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        private async Task<decimal> ObtenerTasaActualAsync(SqlConnection connection, System.Data.IDbTransaction? transaction = null)
        {
            var tasa = await connection.QueryFirstOrDefaultAsync<decimal?>(
                "SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC, CreatedAt DESC", transaction: transaction);
            return tasa ?? 791.3248m;
        }

        public async Task<List<AdelantoDto>> ObtenerAdelantosAsync(string? tipoEntidad = null, int? entidadId = null, string? estado = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    a.Id,
                    a.TipoEntidad,
                    a.EntidadId,
                    CASE 
                        WHEN a.TipoEntidad = 'FINCA' THEN f.Nombre 
                        WHEN a.TipoEntidad IN ('RECEPTORIA', 'COMPANIA') THEN c.Nombre 
                        ELSE 'S/N' 
                    END AS EntidadNombre,
                    a.FechaSolicitud,
                    a.SemanaInicioId,
                    s.Codigo AS SemanaInicioNombre,
                    a.MontoTotalUSD,
                    a.NumeroCuotas,
                    a.MontoCuotaUSD,
                    a.MontoPagadoUSD,
                    a.MontoPendienteUSD,
                    a.Estado,
                    a.Observacion
                FROM TB_ADELANTOS a
                LEFT JOIN TB_FINCAS f ON a.TipoEntidad = 'FINCA' AND a.EntidadId = f.Id
                LEFT JOIN TB_COMPANIAS c ON a.TipoEntidad IN ('RECEPTORIA', 'COMPANIA') AND a.EntidadId = c.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS s ON a.SemanaInicioId = s.Id
                WHERE (@tipoEntidad IS NULL OR a.TipoEntidad = @tipoEntidad)
                  AND (@entidadId IS NULL OR a.EntidadId = @entidadId)
                  AND (@estado IS NULL OR a.Estado = @estado)
                ORDER BY a.FechaSolicitud DESC, a.Id DESC";

            var adelantos = (await connection.QueryAsync<AdelantoDto>(sql, new { tipoEntidad, entidadId, estado })).ToList();
            if (!adelantos.Any()) return adelantos;

            var adelantoIds = adelantos.Select(x => x.Id).ToList();
            var sqlCuotas = @"
                SELECT 
                    c.Id,
                    c.AdelantoId,
                    c.NumeroCuota,
                    c.SemanaOperativaId,
                    s.Codigo AS SemanaNombre,
                    s.FechaInicio AS FechaInicioSemana,
                    s.FechaFin AS FechaFinSemana,
                    c.MontoCuotaUSD,
                    c.MontoCobradoUSD,
                    c.TasaBcvAplicada,
                    c.MontoCobradoBs,
                    c.Estado,
                    c.Observacion
                FROM TB_ADELANTOS_CUOTAS c
                LEFT JOIN TB_CICLOS_OPERATIVOS s ON c.SemanaOperativaId = s.Id
                WHERE c.AdelantoId IN @adelantoIds
                ORDER BY c.AdelantoId, c.NumeroCuota";

            var cuotas = (await connection.QueryAsync<AdelantoCuotaDto>(sqlCuotas, new { adelantoIds })).ToList();
            var cuotasMap = cuotas.GroupBy(x => x.AdelantoId).ToDictionary(g => g.Key, g => g.ToList());

            foreach (var a in adelantos)
            {
                if (cuotasMap.TryGetValue(a.Id, out var listaCuotas))
                {
                    a.Cuotas = listaCuotas;
                }
            }

            return adelantos;
        }

        public async Task<AdelantoDto?> ObtenerPorIdAsync(int id)
        {
            var list = await ObtenerAdelantosAsync(null, null, null);
            return list.FirstOrDefault(x => x.Id == id);
        }

        public async Task<AdelantoDto> CrearAdelantoAsync(CrearAdelantoDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                int numeroCuotas = dto.NumeroCuotas > 0 ? dto.NumeroCuotas : 1;
                decimal montoCuotaUSD = Math.Round(dto.MontoTotalUSD / numeroCuotas, 4);
                DateTime fechaSol = dto.FechaSolicitud ?? DateTime.Now;

                // Buscar semana inicial
                int? semanaInicioId = dto.SemanaInicioId;
                if (!semanaInicioId.HasValue || semanaInicioId.Value <= 0)
                {
                    var semActual = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fecha >= FechaInicio AND @fecha <= FechaFin ORDER BY Id DESC",
                        new { fecha = fechaSol }, transaction);
                    semanaInicioId = semActual?.Id;
                }

                var sqlInsert = @"
                    INSERT INTO TB_ADELANTOS (
                        TipoEntidad, EntidadId, FechaSolicitud, SemanaInicioId,
                        MontoTotalUSD, NumeroCuotas, MontoCuotaUSD, MontoPagadoUSD,
                        MontoPendienteUSD, Estado, Observacion, CreatedAt, CreatedBy
                    ) VALUES (
                        @TipoEntidad, @EntidadId, @FechaSolicitud, @SemanaInicioId,
                        @MontoTotalUSD, @NumeroCuotas, @MontoCuotaUSD, 0,
                        @MontoTotalUSD, 'ACTIVO', @Observacion, GETDATE(), @usuarioId
                    );
                    SELECT CAST(SCOPE_IDENTITY() as int);";

                int adelantoId = await connection.QuerySingleAsync<int>(sqlInsert, new
                {
                    dto.TipoEntidad,
                    dto.EntidadId,
                    FechaSolicitud = fechaSol,
                    SemanaInicioId = semanaInicioId,
                    dto.MontoTotalUSD,
                    NumeroCuotas = numeroCuotas,
                    MontoCuotaUSD = montoCuotaUSD,
                    dto.Observacion,
                    usuarioId
                }, transaction);

                // Obtener lista de semanas operativas consecutivas a partir de la semana inicial
                var sqlSemanas = @"
                    SELECT Id FROM TB_CICLOS_OPERATIVOS 
                    WHERE (@semanaInicioId IS NULL OR Id >= @semanaInicioId)
                    ORDER BY Id ASC";
                var semanasFuturas = (await connection.QueryAsync<int>(sqlSemanas, new { semanaInicioId }, transaction)).ToList();

                decimal tasaActual = dto.TasaBcvInicial.HasValue && dto.TasaBcvInicial.Value > 0 
                    ? dto.TasaBcvInicial.Value 
                    : await ObtenerTasaActualAsync(connection, transaction);

                if (dto.CuotasPersonalizadas != null && dto.CuotasPersonalizadas.Any())
                {
                    for (int i = 0; i < dto.CuotasPersonalizadas.Count; i++)
                    {
                        var item = dto.CuotasPersonalizadas[i];
                        int numCuota = item.NumeroCuota > 0 ? item.NumeroCuota : (i + 1);
                        int? semId = item.SemanaOperativaId.HasValue && item.SemanaOperativaId.Value > 0
                            ? item.SemanaOperativaId.Value
                            : ((i < semanasFuturas.Count) ? semanasFuturas[i] : (int?)null);
                        decimal cuotaUsd = item.MontoCuotaUSD;
                        decimal tasaCuota = item.TasaBcvAplicada.HasValue && item.TasaBcvAplicada.Value > 0
                            ? item.TasaBcvAplicada.Value
                            : tasaActual;

                        var sqlInsertCuota = @"
                            INSERT INTO TB_ADELANTOS_CUOTAS (
                                AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                                MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                                CreatedAt, CreatedBy
                            ) VALUES (
                                @adelantoId, @numCuota, @semId, @cuotaUsd,
                                0, @tasaCuota, 0, 'PENDIENTE',
                                GETDATE(), @usuarioId
                            )";

                        await connection.ExecuteAsync(sqlInsertCuota, new
                        {
                            adelantoId,
                            numCuota,
                            semId,
                            cuotaUsd,
                            tasaCuota,
                            usuarioId
                        }, transaction);
                    }
                }
                else
                {
                    for (int i = 1; i <= numeroCuotas; i++)
                    {
                        int? semId = (i - 1 < semanasFuturas.Count) ? semanasFuturas[i - 1] : (int?)null;
                        decimal cuotaUsd = (i == numeroCuotas) 
                            ? (dto.MontoTotalUSD - (montoCuotaUSD * (numeroCuotas - 1))) 
                            : montoCuotaUSD;

                        var sqlInsertCuota = @"
                            INSERT INTO TB_ADELANTOS_CUOTAS (
                                AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                                MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                                CreatedAt, CreatedBy
                            ) VALUES (
                                @adelantoId, @i, @semId, @cuotaUsd,
                                0, @tasaActual, 0, 'PENDIENTE',
                                GETDATE(), @usuarioId
                            )";

                        await connection.ExecuteAsync(sqlInsertCuota, new
                        {
                            adelantoId,
                            i,
                            semId,
                            cuotaUsd,
                            tasaActual,
                            usuarioId
                        }, transaction);
                    }
                }

                transaction.Commit();

                return (await ObtenerPorIdAsync(adelantoId))!;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> ReestructurarCuotasAsync(int adelantoId, ReestructurarCuotasDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var adelanto = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT Id, SemanaInicioId, MontoTotalUSD, MontoPagadoUSD FROM TB_ADELANTOS WHERE Id = @adelantoId",
                    new { adelantoId }, transaction);

                if (adelanto == null) return false;

                var cuotasCobradas = (await connection.QueryAsync<dynamic>(
                    "SELECT Id, NumeroCuota, SemanaOperativaId FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado = 'COBRADO' ORDER BY NumeroCuota ASC",
                    new { adelantoId }, transaction)).ToList();

                int numCobradas = cuotasCobradas.Count;
                int? ultimaSemanaId = cuotasCobradas.LastOrDefault()?.SemanaOperativaId ?? (int?)adelanto.SemanaInicioId;

                await connection.ExecuteAsync(
                    "DELETE FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado != 'COBRADO'",
                    new { adelantoId }, transaction);

                var sqlSemanas = @"
                    SELECT Id FROM TB_CICLOS_OPERATIVOS 
                    WHERE (@ultimaSemanaId IS NULL OR Id > @ultimaSemanaId)
                    ORDER BY Id ASC";
                var semanasFuturas = (await connection.QueryAsync<int>(sqlSemanas, new { ultimaSemanaId }, transaction)).ToList();

                decimal tasaActual = await ObtenerTasaActualAsync(connection, transaction);

                if (dto.NuevasCuotasPendientes != null && dto.NuevasCuotasPendientes.Any())
                {
                    for (int i = 0; i < dto.NuevasCuotasPendientes.Count; i++)
                    {
                        var item = dto.NuevasCuotasPendientes[i];
                        int numCuota = numCobradas + i + 1;
                        int? semId = item.SemanaOperativaId.HasValue && item.SemanaOperativaId.Value > 0
                            ? item.SemanaOperativaId.Value
                            : ((i < semanasFuturas.Count) ? semanasFuturas[i] : (int?)null);
                        decimal cuotaUsd = item.MontoCuotaUSD;
                        decimal tasaCuota = item.TasaBcvAplicada.HasValue && item.TasaBcvAplicada.Value > 0
                            ? item.TasaBcvAplicada.Value
                            : tasaActual;

                        var sqlInsertCuota = @"
                            INSERT INTO TB_ADELANTOS_CUOTAS (
                                AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                                MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                                CreatedAt, CreatedBy
                            ) VALUES (
                                @adelantoId, @numCuota, @semId, @cuotaUsd,
                                0, @tasaCuota, 0, 'PENDIENTE',
                                GETDATE(), @usuarioId
                            )";

                        await connection.ExecuteAsync(sqlInsertCuota, new
                        {
                            adelantoId,
                            numCuota,
                            semId,
                            cuotaUsd,
                            tasaCuota,
                            usuarioId
                        }, transaction);
                    }
                }

                int totalCuotas = numCobradas + (dto.NuevasCuotasPendientes?.Count ?? 0);
                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS SET
                        NumeroCuotas = @totalCuotas,
                        MontoCuotaUSD = (SELECT ISNULL(AVG(MontoCuotaUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId),
                        MontoPendienteUSD = (SELECT ISNULL(SUM(MontoCuotaUSD - MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado != 'COBRADO'),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @adelantoId",
                    new { totalCuotas, usuarioId, adelantoId }, transaction);

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> ActualizarCuotaAsync(int cuotaId, ActualizarCuotaAdelantoDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var cuota = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM TB_ADELANTOS_CUOTAS WHERE Id = @cuotaId", new { cuotaId }, transaction);
                if (cuota == null) return false;

                int adelantoId = (int)cuota.AdelantoId;
                decimal tasaAplicada = dto.TasaBcvAplicada ?? (decimal)(cuota.TasaBcvAplicada ?? await ObtenerTasaActualAsync(connection, transaction));
                decimal montoCobradoUsd = dto.MontoCobradoUSD ?? (decimal)cuota.MontoCobradoUSD;
                decimal montoCuotaUsd = dto.MontoCuotaUSD ?? montoCobradoUsd;
                decimal montoCobradoBs = dto.MontoCobradoBs ?? (montoCobradoUsd * tasaAplicada);
                int? semanaOperativaId = dto.SemanaOperativaId ?? (int?)cuota.SemanaOperativaId;
                string estado = dto.Estado ?? (string)cuota.Estado;
                string? observacion = dto.Observacion ?? (string?)cuota.Observacion;

                var sqlUpdCuota = @"
                    UPDATE TB_ADELANTOS_CUOTAS 
                    SET MontoCuotaUSD = @montoCuotaUsd,
                        MontoCobradoUSD = @montoCobradoUsd,
                        TasaBcvAplicada = @tasaAplicada,
                        MontoCobradoBs = @montoCobradoBs,
                        SemanaOperativaId = @semanaOperativaId,
                        Estado = @estado,
                        Observacion = @observacion,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @cuotaId;

                    IF (SELECT NumeroCuota FROM TB_ADELANTOS_CUOTAS WHERE Id = @cuotaId) = 1 AND @semanaOperativaId IS NOT NULL
                    BEGIN
                        UPDATE TB_ADELANTOS SET SemanaInicioId = @semanaOperativaId WHERE Id = @adelantoId;
                    END";

                await connection.ExecuteAsync(sqlUpdCuota, new
                {
                    montoCuotaUsd,
                    montoCobradoUsd,
                    tasaAplicada,
                    montoCobradoBs,
                    semanaOperativaId,
                    estado,
                    observacion,
                    usuarioId,
                    cuotaId,
                    adelantoId
                }, transaction);

                // Recalcular montos del Adelanto Padre
                var totalPagado = await connection.QuerySingleAsync<decimal>(
                    "SELECT ISNULL(SUM(MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado = 'COBRADO'",
                    new { adelantoId }, transaction);

                var totalCuotasPactadas = await connection.QuerySingleAsync<decimal>(
                    "SELECT ISNULL(SUM(MontoCuotaUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId",
                    new { adelantoId }, transaction);

                decimal montoPendiente = Math.Max(0, totalCuotasPactadas - totalPagado);
                string estadoAdelanto = (montoPendiente == 0) ? "PAGADO" : "ACTIVO";

                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS 
                    SET MontoTotalUSD = @totalCuotasPactadas,
                        MontoPagadoUSD = @totalPagado,
                        MontoPendienteUSD = @montoPendiente,
                        MontoCuotaUSD = (SELECT ISNULL(AVG(MontoCuotaUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId),
                        Estado = @estadoAdelanto,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @adelantoId", new
                {
                    totalCuotasPactadas,
                    totalPagado,
                    montoPendiente,
                    estadoAdelanto,
                    usuarioId,
                    adelantoId
                }, transaction);

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> PosponerCuotaAsync(int cuotaId, string? motivo, int? usuarioId = null, int? semanaOperativaIdDestino = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var cuota = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM TB_ADELANTOS_CUOTAS WHERE Id = @cuotaId", new { cuotaId }, transaction);
                if (cuota == null) return false;

                int adelantoId = (int)cuota.AdelantoId;
                int semActualId = cuota.SemanaOperativaId ?? 0;

                // Marcar cuota actual como POSPUESTO
                string obsPospuesto = string.IsNullOrWhiteSpace(motivo) 
                    ? "Cuota pospuesta a solicitud del cliente" 
                    : $"Pospuesto: {motivo}";

                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS_CUOTAS 
                    SET Estado = 'POSPUESTO',
                        Observacion = @obsPospuesto,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @cuotaId", new { obsPospuesto, usuarioId, cuotaId }, transaction);

                // Determinar la semana de destino
                int? sigSemanaId = (semanaOperativaIdDestino.HasValue && semanaOperativaIdDestino.Value > 0)
                    ? semanaOperativaIdDestino.Value
                    : null;

                if (!sigSemanaId.HasValue)
                {
                    // Buscar la siguiente semana operativa disponible después de la última cuota activa programada
                    var maxSemanaId = await connection.QuerySingleAsync<int?>(
                        "SELECT MAX(SemanaOperativaId) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado <> 'POSPUESTO'",
                        new { adelantoId }, transaction) ?? semActualId;

                    sigSemanaId = await connection.QueryFirstOrDefaultAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @maxSemanaId ORDER BY Id ASC",
                        new { maxSemanaId }, transaction);

                    if (!sigSemanaId.HasValue)
                    {
                        sigSemanaId = await connection.QueryFirstOrDefaultAsync<int?>(
                            "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @semActualId ORDER BY Id ASC",
                            new { semActualId }, transaction);
                    }
                }

                // Obtener el número máximo de cuota
                int maxNumCuota = await connection.QuerySingleAsync<int>(
                    "SELECT ISNULL(MAX(NumeroCuota), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId",
                    new { adelantoId }, transaction);

                decimal cuotaUsd = (decimal)cuota.MontoCuotaUSD;
                decimal tasaActual = await ObtenerTasaActualAsync(connection, transaction);

                // Crear nueva cuota reprogramada
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_ADELANTOS_CUOTAS (
                        AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                        MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                        Observacion, CreatedAt, CreatedBy
                    ) VALUES (
                        @adelantoId, @nuevaNumCuota, @sigSemanaId, @cuotaUsd,
                        0, @tasaActual, 0, 'PENDIENTE',
                        'Reprogramada por posposición', GETDATE(), @usuarioId
                    )", new
                {
                    adelantoId,
                    nuevaNumCuota = maxNumCuota + 1,
                    sigSemanaId,
                    cuotaUsd,
                    tasaActual,
                    usuarioId
                }, transaction);

                // Mantener actualizado el total de cuotas vigentes en TB_ADELANTOS
                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS 
                    SET NumeroCuotas = (SELECT COUNT(*) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado <> 'ANULADA' AND Estado <> 'POSPUESTO')
                    WHERE Id = @adelantoId", new { adelantoId }, transaction);

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> DividirCuotaAsync(int cuotaId, decimal montoDescontarUSD, int? semanaOperativaIdDestino = null, string? motivo = null, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var cuota = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM TB_ADELANTOS_CUOTAS WHERE Id = @cuotaId", new { cuotaId }, transaction);
                if (cuota == null) return false;

                decimal montoActual = (decimal)cuota.MontoCuotaUSD;
                if (montoDescontarUSD <= 0 || montoDescontarUSD >= montoActual)
                {
                    return false;
                }

                decimal remanenteUSD = montoActual - montoDescontarUSD;
                int adelantoId = (int)cuota.AdelantoId;
                int semActualId = cuota.SemanaOperativaId ?? 0;
                int numCuota = (int)cuota.NumeroCuota;

                // Determinar ciclo destino para el remanente
                int? sigSemanaId = (semanaOperativaIdDestino.HasValue && semanaOperativaIdDestino.Value > 0)
                    ? semanaOperativaIdDestino.Value
                    : null;

                if (!sigSemanaId.HasValue)
                {
                    sigSemanaId = await connection.QueryFirstOrDefaultAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @semActualId ORDER BY Id ASC",
                        new { semActualId }, transaction);

                    if (!sigSemanaId.HasValue)
                    {
                        var maxSemanaId = await connection.QuerySingleAsync<int?>(
                            "SELECT MAX(SemanaOperativaId) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado <> 'POSPUESTO'",
                            new { adelantoId }, transaction) ?? semActualId;

                        sigSemanaId = await connection.QueryFirstOrDefaultAsync<int?>(
                            "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @maxSemanaId ORDER BY Id ASC",
                            new { maxSemanaId }, transaction);
                    }
                }

                // 1. Actualizar cuota actual con el monto a descontar en este ciclo
                string obsAjuste = string.IsNullOrWhiteSpace(motivo)
                    ? $"Deducción parcial: se cobran ${montoDescontarUSD:N2} y se reprograman ${remanenteUSD:N2}"
                    : motivo;

                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS_CUOTAS 
                    SET MontoCuotaUSD = @montoDescontarUSD,
                        Observacion = CASE WHEN Observacion IS NULL OR Observacion = '' THEN @obsAjuste ELSE Observacion + ' | ' + @obsAjuste END,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @cuotaId", new { montoDescontarUSD, obsAjuste, usuarioId, cuotaId }, transaction);

                // 2. Obtener el número máximo de cuota para la nueva cuota
                int maxNumCuota = await connection.QuerySingleAsync<int>(
                    "SELECT ISNULL(MAX(NumeroCuota), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId",
                    new { adelantoId }, transaction);

                decimal tasaActual = await ObtenerTasaActualAsync(connection, transaction);

                // 3. Crear nueva cuota con el remanente asignada al ciclo destino
                string obsRemanente = $"Remanente de Cuota #{numCuota} trasladado al siguiente ciclo";
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_ADELANTOS_CUOTAS (
                        AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                        MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                        Observacion, CreatedAt, CreatedBy
                    ) VALUES (
                        @adelantoId, @nuevaNumCuota, @sigSemanaId, @remanenteUSD,
                        0, @tasaActual, 0, 'PENDIENTE',
                        @obsRemanente, GETDATE(), @usuarioId
                    )", new
                {
                    adelantoId,
                    nuevaNumCuota = maxNumCuota + 1,
                    sigSemanaId,
                    remanenteUSD,
                    tasaActual,
                    obsRemanente,
                    usuarioId
                }, transaction);

                // 4. Actualizar TB_ADELANTOS
                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS 
                    SET NumeroCuotas = (SELECT COUNT(*) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado <> 'ANULADA' AND Estado <> 'POSPUESTO'),
                        MontoCuotaUSD = (SELECT ISNULL(AVG(MontoCuotaUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado <> 'ANULADA' AND Estado <> 'POSPUESTO'),
                        MontoPendienteUSD = (SELECT ISNULL(SUM(MontoCuotaUSD - MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado != 'COBRADO' AND Estado != 'ANULADA'),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @adelantoId", new { usuarioId, adelantoId }, transaction);

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> EliminarAdelantoAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var rows = await connection.ExecuteAsync("DELETE FROM TB_ADELANTOS WHERE Id = @id", new { id });
            return rows > 0;
        }

        public async Task<bool> MarcarPagoLiquidacionFincaAsync(int fincaId, DateTime fechaDesde, DateTime fechaHasta, bool pagado, decimal? tasaBcv, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                decimal tasa = (tasaBcv.HasValue && tasaBcv.Value > 0) 
                    ? tasaBcv.Value 
                    : await ObtenerTasaActualAsync(connection, transaction);

                var semana = await connection.QueryFirstOrDefaultAsync<dynamic>(@"
                    SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS 
                    WHERE (FechaInicio <= @fechaHasta AND FechaFin >= @fechaDesde)
                    ORDER BY Id DESC", new { fechaDesde = fechaDesde.Date, fechaHasta = fechaHasta.Date }, transaction);

                int? semanaId = semana?.Id;

                var cuotasSemana = (await connection.QueryAsync<dynamic>(@"
                    SELECT c.Id, c.AdelantoId, c.MontoCuotaUSD, c.Estado, c.Observacion
                    FROM TB_ADELANTOS_CUOTAS c
                    INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                    WHERE a.TipoEntidad = 'FINCA' 
                      AND a.EntidadId = @fincaId
                      AND (
                          (@semanaId IS NOT NULL AND c.SemanaOperativaId = @semanaId)
                          OR (@semanaId IS NOT NULL AND c.SemanaOperativaId < @semanaId AND c.Estado = 'PENDIENTE')
                          OR (c.SemanaOperativaId IS NULL AND c.Estado = 'PENDIENTE')
                      )
                      AND c.Estado <> 'POSPUESTO'
                      AND c.Estado <> 'ANULADA'
                    ORDER BY c.NumeroCuota ASC", new { fincaId, semanaId }, transaction)).ToList();

                foreach (var cuota in cuotasSemana)
                {
                    int cuotaId = (int)cuota.Id;
                    int adelantoId = (int)cuota.AdelantoId;
                    decimal montoCuotaUsd = (decimal)cuota.MontoCuotaUSD;

                    if (pagado)
                    {
                        decimal montoBs = Math.Round(montoCuotaUsd * tasa, 2);
                        await connection.ExecuteAsync(@"
                            UPDATE TB_ADELANTOS_CUOTAS
                            SET MontoCobradoUSD = @montoCuotaUsd,
                                TasaBcvAplicada = @tasa,
                                MontoCobradoBs = @montoBs,
                                Estado = 'COBRADO',
                                Observacion = 'Descontado y cancelado en Liquidación Bancaria',
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @usuarioId
                            WHERE Id = @cuotaId", new { montoCuotaUsd, tasa, montoBs, usuarioId, cuotaId }, transaction);
                    }
                    else
                    {
                        await connection.ExecuteAsync(@"
                            UPDATE TB_ADELANTOS_CUOTAS
                            SET MontoCobradoUSD = 0,
                                MontoCobradoBs = 0,
                                Estado = 'PENDIENTE',
                                Observacion = 'Pendiente de cobro',
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @usuarioId
                            WHERE Id = @cuotaId AND Observacion LIKE '%Liquidación Bancaria%'", new { usuarioId, cuotaId }, transaction);
                    }

                    var totalPagado = await connection.QuerySingleAsync<decimal>(
                        "SELECT ISNULL(SUM(MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado = 'COBRADO'",
                        new { adelantoId }, transaction);

                    var adelanto = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT MontoTotalUSD FROM TB_ADELANTOS WHERE Id = @adelantoId", new { adelantoId }, transaction);

                    if (adelanto != null)
                    {
                        decimal montoTotalUsd = (decimal)adelanto.MontoTotalUSD;
                        decimal montoPendiente = Math.Max(0, montoTotalUsd - totalPagado);
                        string estadoAdelanto = (montoPendiente == 0) ? "PAGADO" : "ACTIVO";

                        await connection.ExecuteAsync(@"
                            UPDATE TB_ADELANTOS 
                            SET MontoPagadoUSD = @totalPagado,
                                MontoPendienteUSD = @montoPendiente,
                                Estado = @estadoAdelanto,
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @usuarioId
                            WHERE Id = @adelantoId", new { totalPagado, montoPendiente, estadoAdelanto, usuarioId, adelantoId }, transaction);
                    }
                }

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<List<AbonoDetalleDto>> ObtenerAbonosAsync(string? tipoEntidad = null, int? entidadId = null, int? cicloId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    c.Id,
                    c.AdelantoId,
                    c.NumeroCuota,
                    a.TipoEntidad,
                    a.EntidadId,
                    CASE 
                        WHEN a.TipoEntidad = 'FINCA' THEN f.Nombre 
                        WHEN a.TipoEntidad = 'RECEPTORIA' THEN comp.Nombre 
                        ELSE 'S/N' 
                    END AS EntidadNombre,
                    c.SemanaOperativaId,
                    s.Codigo AS SemanaNombre,
                    ISNULL(c.ModifiedAt, c.CreatedAt) AS FechaCobro,
                    c.MontoCuotaUSD,
                    c.MontoCobradoUSD,
                    c.TasaBcvAplicada,
                    c.MontoCobradoBs,
                    c.Estado,
                    c.Observacion,
                    a.MontoPendienteUSD AS SaldoRestanteUSD
                FROM TB_ADELANTOS_CUOTAS c
                INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                LEFT JOIN TB_FINCAS f ON a.TipoEntidad = 'FINCA' AND a.EntidadId = f.Id
                LEFT JOIN TB_COMPANIAS comp ON a.TipoEntidad = 'RECEPTORIA' AND a.EntidadId = comp.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS s ON c.SemanaOperativaId = s.Id
                WHERE c.Estado = 'COBRADO'
                  AND (@tipoEntidad IS NULL OR a.TipoEntidad = @tipoEntidad)
                  AND (@entidadId IS NULL OR a.EntidadId = @entidadId)
                  AND (@cicloId IS NULL OR c.SemanaOperativaId = @cicloId)
                ORDER BY c.ModifiedAt DESC, c.Id DESC";

            return (await connection.QueryAsync<AbonoDetalleDto>(sql, new { tipoEntidad, entidadId, cicloId })).ToList();
        }

        public async Task<bool> RegistrarAbonoDirectoAsync(RegistrarAbonoDirectoDto dto, int? usuarioId = null)
        {
            if (dto.MontoAbonoUSD <= 0) return false;

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var adelanto = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM TB_ADELANTOS WHERE Id = @AdelantoId", new { dto.AdelantoId }, transaction);
                if (adelanto == null) return false;

                decimal tasa = dto.TasaBcv ?? await ObtenerTasaActualAsync(connection, transaction);
                decimal montoBs = dto.MontoAbonoBs ?? Math.Round(dto.MontoAbonoUSD * tasa, 2);
                DateTime fechaAbono = dto.FechaAbono ?? DateTime.Now;

                var cuotaPendiente = await connection.QueryFirstOrDefaultAsync<dynamic>(@"
                    SELECT TOP 1 * FROM TB_ADELANTOS_CUOTAS 
                    WHERE AdelantoId = @AdelantoId AND Estado = 'PENDIENTE' 
                    ORDER BY NumeroCuota ASC", new { dto.AdelantoId }, transaction);

                string obs = string.IsNullOrWhiteSpace(dto.Observacion) 
                    ? $"Abono directo extraordinario ({dto.MetodoPago ?? "DIRECTO"}{(string.IsNullOrWhiteSpace(dto.ReferenciaComprobante) ? "" : $" Ref: {dto.ReferenciaComprobante}")})"
                    : $"{dto.Observacion} ({dto.MetodoPago ?? "DIRECTO"}{(string.IsNullOrWhiteSpace(dto.ReferenciaComprobante) ? "" : $" Ref: {dto.ReferenciaComprobante}")})";

                if (cuotaPendiente != null && (decimal)cuotaPendiente.MontoCuotaUSD <= dto.MontoAbonoUSD)
                {
                    int cuotaId = (int)cuotaPendiente.Id;
                    await connection.ExecuteAsync(@"
                        UPDATE TB_ADELANTOS_CUOTAS
                        SET MontoCobradoUSD = @MontoAbonoUSD,
                            TasaBcvAplicada = @tasa,
                            MontoCobradoBs = @montoBs,
                            Estado = 'COBRADO',
                            Observacion = @obs,
                            SemanaOperativaId = ISNULL(@SemanaOperativaId, SemanaOperativaId),
                            ModifiedAt = @fechaAbono,
                            ModifiedBy = @usuarioId
                        WHERE Id = @cuotaId", new
                    {
                        dto.MontoAbonoUSD,
                        tasa,
                        montoBs,
                        obs,
                        dto.SemanaOperativaId,
                        fechaAbono,
                        usuarioId,
                        cuotaId
                    }, transaction);
                }
                else
                {
                    int maxCuota = await connection.QuerySingleAsync<int>(
                        "SELECT ISNULL(MAX(NumeroCuota), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @AdelantoId",
                        new { dto.AdelantoId }, transaction);

                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_ADELANTOS_CUOTAS (
                            AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                            MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                            Observacion, CreatedAt, CreatedBy, ModifiedAt, ModifiedBy
                        ) VALUES (
                            @AdelantoId, @numCuota, @SemanaOperativaId, @MontoAbonoUSD,
                            @MontoAbonoUSD, @tasa, @montoBs, 'COBRADO',
                            @obs, @fechaAbono, @usuarioId, @fechaAbono, @usuarioId
                        )", new
                    {
                        dto.AdelantoId,
                        numCuota = maxCuota + 1,
                        dto.SemanaOperativaId,
                        dto.MontoAbonoUSD,
                        tasa,
                        montoBs,
                        obs,
                        fechaAbono,
                        usuarioId
                    }, transaction);
                }

                var totalPagado = await connection.QuerySingleAsync<decimal>(
                    "SELECT ISNULL(SUM(MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @AdelantoId AND Estado = 'COBRADO'",
                    new { dto.AdelantoId }, transaction);

                decimal montoTotalUsd = (decimal)adelanto.MontoTotalUSD;
                decimal montoPendiente = Math.Max(0, montoTotalUsd - totalPagado);
                string estadoAdelanto = (montoPendiente == 0) ? "PAGADO" : "ACTIVO";

                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS 
                    SET MontoPagadoUSD = @totalPagado,
                        MontoPendienteUSD = @montoPendiente,
                        Estado = @estadoAdelanto,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @AdelantoId", new
                {
                    totalPagado,
                    montoPendiente,
                    estadoAdelanto,
                    usuarioId,
                    dto.AdelantoId
                }, transaction);

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<int> ActualizarTasaAdelantosActivosAsync(string tipoEntidad, decimal tasaBcv, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var sql = @"
                UPDATE c
                SET c.TasaBcvAplicada = @tasaBcv,
                    c.ModifiedAt = GETDATE(),
                    c.ModifiedBy = @usuarioId
                FROM TB_ADELANTOS_CUOTAS c
                INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                WHERE a.TipoEntidad = @tipoEntidad
                  AND a.Estado != 'PAGADO'
                  AND a.MontoPendienteUSD > 0.001
                  AND c.Estado != 'COBRADO'
                  AND c.Estado != 'ANULADA';

                SELECT COUNT(DISTINCT a.Id)
                FROM TB_ADELANTOS a
                WHERE a.TipoEntidad = @tipoEntidad
                  AND a.Estado != 'PAGADO'
                  AND a.MontoPendienteUSD > 0.001;";

            int cant = await connection.ExecuteScalarAsync<int>(sql, new { tipoEntidad, tasaBcv, usuarioId });
            return cant;
        }
    }

    public interface IChatRepository
    {
        Task<ChatResponseDto> AnalizarDatosSistemaAsync(string mensaje);
        Task<IEnumerable<string>> ObtenerSugerenciasPromptAsync();
    }

    public class ChatRepository : IChatRepository
    {
        private readonly string _connectionString;
        private readonly string _geminiApiKey;
        private static readonly HttpClient _httpClient = new HttpClient();

        public ChatRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection")
                ?? configuration.GetConnectionString("BD_TRANSPORTE")
                ?? "";
            _geminiApiKey = configuration["Gemini:ApiKey"] 
                ?? Environment.GetEnvironmentVariable("Gemini__ApiKey")
                ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY") 
                ?? "";
        }

        public async Task<IEnumerable<string>> ObtenerSugerenciasPromptAsync()
        {
            return await Task.FromResult(new List<string>
            {
                "📊 ¿Cuál es el diagnóstico general del ciclo actual?",
                "⚠️ ¿Dónde están los mayores problemas de merma?",
                "🚜 ¿Cuáles fincas o choferes presentan descuadres?",
                "💰 Estado de adelantos y préstamos pendientes por cobrar",
                "🧪 Evaluar mermas por leche ácida o pérdida de calidad"
            });
        }

        public async Task<ChatResponseDto> AnalizarDatosSistemaAsync(string mensaje)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            // ====================================================
            // 0. BÚSQUEDA DIRECTA Y AUDITORÍA INTELIGENTE POR CIFRAS O ENTIDADES
            // ====================================================
            var hallazgosDirectos = new System.Text.StringBuilder();
            try
            {
                var matchesNumeros = System.Text.RegularExpressions.Regex.Matches(mensaje ?? "", @"-?\b\d+(?:[\.,]\d+)?\b");
                var numerosBuscados = new HashSet<decimal>();
                foreach (System.Text.RegularExpressions.Match m in matchesNumeros)
                {
                    string limpia = m.Value.Replace(".", "").Replace(",", ".");
                    if (decimal.TryParse(limpia, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out decimal n))
                    {
                        numerosBuscados.Add(Math.Abs(n));
                        numerosBuscados.Add(-Math.Abs(n));
                    }
                }

                if (numerosBuscados.Any())
                {
                    var sqlRutasMatch = await connection.QueryAsync<dynamic>(@"
                        SELECT cr.Id, cr.Fecha, u.NombreCompleto AS Conductor,
                               cr.TotalLitrosFinca, cr.TotalLitrosReceptoria, cr.LitrosRecibidosReceptoria,
                               cr.DiferenciaLitros, cr.DiferenciaReceptoria, cr.Estado, cr.Observacion,
                               co.Codigo AS CicloCodigo
                        FROM TB_CONTROL_RUTAS cr
                        LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                        LEFT JOIN TB_CICLOS_OPERATIVOS co ON cr.CicloId = co.Id
                        WHERE cr.TotalLitrosFinca IN @numerosBuscados 
                           OR cr.TotalLitrosReceptoria IN @numerosBuscados
                           OR cr.DiferenciaLitros IN @numerosBuscados
                           OR cr.DiferenciaReceptoria IN @numerosBuscados
                           OR cr.MermaTotalLitros IN @numerosBuscados
                           OR cr.Id IN @numerosBuscados
                        ORDER BY cr.Fecha DESC, cr.Id DESC", new { numerosBuscados = numerosBuscados.ToList() });

                    var sqlCompMatch = await connection.QueryAsync<dynamic>(@"
                        SELECT cc.Id, cc.Fecha, u.NombreCompleto AS Conductor, c.Nombre AS Compania,
                               cc.LitrosDespachados, cc.LitrosRecibidosCompania, cc.DiferenciaLitros, cc.Estado, cc.Observacion,
                               co.Codigo AS CicloCodigo
                        FROM TB_CONTROL_COMPANIAS cc
                        LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                        LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                        LEFT JOIN TB_CICLOS_OPERATIVOS co ON cc.CicloId = co.Id
                        WHERE cc.LitrosDespachados IN @numerosBuscados
                           OR cc.LitrosRecibidosCompania IN @numerosBuscados
                           OR cc.DiferenciaLitros IN @numerosBuscados
                           OR cc.Id IN @numerosBuscados
                        ORDER BY cc.Fecha DESC, cc.Id DESC", new { numerosBuscados = numerosBuscados.ToList() });

                    if (sqlRutasMatch.Any() || sqlCompMatch.Any())
                    {
                        hallazgosDirectos.AppendLine("=== 🔎 REGISTROS EXACTOS ENCONTRADOS EN LA BD PARA LAS CIFRAS CONSULTADAS ===");
                        foreach (var rm in sqlRutasMatch)
                        {
                            string fStr = rm.Fecha != null ? ((DateTime)rm.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                            decimal fincasLts = rm.TotalLitrosFinca != null ? (decimal)rm.TotalLitrosFinca : 0m;
                            decimal recepLts = rm.TotalLitrosReceptoria != null ? (decimal)rm.TotalLitrosReceptoria : (rm.LitrosRecibidosReceptoria != null ? (decimal)rm.LitrosRecibidosReceptoria : 0m);
                            decimal dif = rm.DiferenciaLitros != null ? (decimal)rm.DiferenciaLitros : (rm.DiferenciaReceptoria != null ? (decimal)rm.DiferenciaReceptoria : (recepLts - fincasLts));

                            hallazgosDirectos.AppendLine($"[VIAJE RUTAS / RECEPTORÍA] Control de Viaje #{rm.Id} | Fecha: {fStr} | Chofer: {rm.Conductor ?? "Sin chofer"} | Ciclo: {rm.CicloCodigo ?? "N/A"}");
                            hallazgosDirectos.AppendLine($"  * Total Recolectado en Fincas: {fincasLts:N0} Lts");
                            hallazgosDirectos.AppendLine($"  * Total Recibido en Receptoría: {recepLts:N0} Lts");
                            hallazgosDirectos.AppendLine($"  * Diferencia Registrada: {dif:N0} Lts ({(dif < 0 ? "Faltante / Merma Negativa" : (dif > 0 ? "Sobrante Positivo" : "Cuadre Exacto"))})");
                            hallazgosDirectos.AppendLine($"  * Estado: {rm.Estado} | Observación: {rm.Observacion ?? "Ninguna"}");

                            // Buscar detalle de fincas de este viaje
                            var fincasDelViaje = await connection.QueryAsync<dynamic>(@"
                                SELECT f.Nombre AS Finca, r.Litros, r.EsAcida, r.TipoLeche
                                FROM TB_RUTAS_RECOLECCION r
                                LEFT JOIN TB_FINCAS f ON r.FincaId = f.Id
                                WHERE r.ControlRutaId = @controlId OR (r.Fecha = @fecha AND r.UsuarioId = (SELECT UsuarioId FROM TB_CONTROL_RUTAS WHERE Id = @controlId))",
                                new { controlId = rm.Id, fecha = rm.Fecha });

                            if (fincasDelViaje.Any())
                            {
                                var desglose = string.Join(", ", fincasDelViaje.Select(f => $"{f.Finca}: {f.Litros} Lts{(f.EsAcida == true ? " [Ácida]" : "")}"));
                                hallazgosDirectos.AppendLine($"  * Desglose por Fincas ({fincasDelViaje.Count()} fincas): {desglose}");
                            }
                            hallazgosDirectos.AppendLine();
                        }

                        foreach (var cm in sqlCompMatch)
                        {
                            string fStr = cm.Fecha != null ? ((DateTime)cm.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                            decimal ltsDesp = cm.LitrosDespachados != null ? (decimal)cm.LitrosDespachados : 0m;
                            decimal ltsRec = cm.LitrosRecibidosCompania != null ? (decimal)cm.LitrosRecibidosCompania : 0m;
                            decimal dif = cm.DiferenciaLitros != null ? (decimal)cm.DiferenciaLitros : (ltsRec - ltsDesp);

                            hallazgosDirectos.AppendLine($"[DESPACHO COMPAÑÍA / QUESERA] Ticket Despacho #{cm.Id} | Fecha: {fStr} | Chofer: {cm.Conductor ?? "Sin chofer"} | Destino: {cm.Compania ?? "Sin destino"} | Ciclo: {cm.CicloCodigo ?? "N/A"}");
                            hallazgosDirectos.AppendLine($"  * Litros Despachados: {ltsDesp:N0} Lts | Litros Recibidos en Destino: {ltsRec:N0} Lts | Diferencia/Merma: {dif:N0} Lts");
                            hallazgosDirectos.AppendLine($"  * Estado: {cm.Estado} | Obs: {cm.Observacion ?? "Ninguna"}");
                            hallazgosDirectos.AppendLine();
                        }
                        hallazgosDirectos.AppendLine("=== FIN DE REGISTROS EXACTOS ===");
                        hallazgosDirectos.AppendLine();
                    }
                }

                // Búsqueda inteligente por nombre de chofer o conductor si se menciona en el mensaje (ej: 'JULIO')
                var choferesEncontrados = await connection.QueryAsync<dynamic>(@"
                    SELECT Id, NombreCompleto FROM TB_USUARIOS 
                    WHERE Rol IN ('CHOFER', 'CONDUCTOR', 'OPERADOR') AND Activo = 1");

                var choferMatch = choferesEncontrados.FirstOrDefault(c => {
                    string n = (string)(c.NombreCompleto ?? "");
                    if (string.IsNullOrWhiteSpace(n)) return false;
                    var palabras = n.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    return palabras.Any(p => p.Length >= 4 && (mensaje ?? "").IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0);
                });

                if (choferMatch != null)
                {
                    int choferId = (int)choferMatch.Id;
                    string nombreChofer = (string)choferMatch.NombreCompleto;

                    var ultimosViajesChofer = await connection.QueryAsync<dynamic>(@"
                        SELECT TOP 5 cr.Id, cr.Fecha, cr.TotalLitrosFinca, cr.TotalLitrosReceptoria,
                               cr.LitrosRecibidosReceptoria, cr.DiferenciaLitros, cr.DiferenciaReceptoria,
                               cr.MermaTotalLitros, cr.PorcentajeMerma, cr.Estado, cr.Observacion,
                               co.Codigo AS CicloCodigo
                        FROM TB_CONTROL_RUTAS cr
                        LEFT JOIN TB_CICLOS_OPERATIVOS co ON cr.CicloId = co.Id
                        WHERE cr.UsuarioId = @choferId
                        ORDER BY cr.Fecha DESC, cr.Id DESC", new { choferId });

                    if (ultimosViajesChofer.Any())
                    {
                        hallazgosDirectos.AppendLine($"=== 🔎 ÚLTIMOS TICKETS / VIAJES ENCONTRADOS DEL CONDUCTOR: {nombreChofer} ===");
                        foreach (var v in ultimosViajesChofer)
                        {
                            string fStr = v.Fecha != null ? ((DateTime)v.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                            decimal fincasLts = v.TotalLitrosFinca != null ? (decimal)v.TotalLitrosFinca : 0m;
                            decimal recepLts = v.TotalLitrosReceptoria != null ? (decimal)v.TotalLitrosReceptoria : (v.LitrosRecibidosReceptoria != null ? (decimal)v.LitrosRecibidosReceptoria : 0m);
                            decimal dif = v.DiferenciaLitros != null ? (decimal)v.DiferenciaLitros : (v.DiferenciaReceptoria != null ? (decimal)v.DiferenciaReceptoria : (recepLts - fincasLts));

                            hallazgosDirectos.AppendLine($"• Control de Viaje #{v.Id} | Fecha: {fStr} | Estado: {v.Estado} | Ciclo: {v.CicloCodigo ?? "N/A"}");
                            hallazgosDirectos.AppendLine($"  - Litros en Finca: {fincasLts:N0} L | Litros en Receptoría: {recepLts:N0} L | Diferencia: {dif:+0;-0;0} L (Merma: {v.PorcentajeMerma ?? 0}%)");

                            var fincasV = await connection.QueryAsync<dynamic>(@"
                                SELECT f.Nombre AS Finca, r.Litros, r.EsAcida 
                                FROM TB_RUTAS_RECOLECCION r 
                                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id 
                                WHERE r.ControlRutaId = @cid", new { cid = v.Id });

                            if (fincasV.Any())
                            {
                                var desg = string.Join(", ", fincasV.Select(f => $"{f.Finca}: {f.Litros} L"));
                                hallazgosDirectos.AppendLine($"  - Fincas Recogidas: {desg}");
                            }
                        }
                        hallazgosDirectos.AppendLine("=== FIN DE TICKETS DEL CONDUCTOR ===\n");
                    }
                }

                // Detección automática si pide análisis de mermas o descuadres
                if ((mensaje ?? "").IndexOf("merma", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("descuadre", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("faltante", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    var mayoresMermas = await connection.QueryAsync<dynamic>(@"
                        SELECT TOP 5 cr.Id, cr.Fecha, u.NombreCompleto AS Conductor,
                               cr.TotalLitrosFinca, cr.TotalLitrosReceptoria, cr.LitrosRecibidosReceptoria,
                               cr.DiferenciaLitros, cr.DiferenciaReceptoria, cr.MermaTotalLitros, cr.PorcentajeMerma,
                               cr.Estado, co.Codigo AS CicloCodigo
                        FROM TB_CONTROL_RUTAS cr
                        LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                        LEFT JOIN TB_CICLOS_OPERATIVOS co ON cr.CicloId = co.Id
                        WHERE cr.DiferenciaLitros < 0 OR cr.DiferenciaReceptoria < 0 OR cr.MermaTotalLitros < 0
                        ORDER BY ISNULL(cr.DiferenciaLitros, ISNULL(cr.DiferenciaReceptoria, cr.MermaTotalLitros)) ASC, cr.Fecha DESC");

                    if (mayoresMermas.Any())
                    {
                        hallazgosDirectos.AppendLine("=== ⚠️ TICKETS RECIENTES CON MAYORES MERMAS / FALTANTES DETECTADOS ===");
                        foreach (var m in mayoresMermas)
                        {
                            string fStr = m.Fecha != null ? ((DateTime)m.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                            decimal fincasLts = m.TotalLitrosFinca != null ? (decimal)m.TotalLitrosFinca : 0m;
                            decimal recepLts = m.TotalLitrosReceptoria != null ? (decimal)m.TotalLitrosReceptoria : (m.LitrosRecibidosReceptoria != null ? (decimal)m.LitrosRecibidosReceptoria : 0m);
                            decimal dif = m.DiferenciaLitros != null ? (decimal)m.DiferenciaLitros : (m.DiferenciaReceptoria != null ? (decimal)m.DiferenciaReceptoria : (recepLts - fincasLts));
                            hallazgosDirectos.AppendLine($"• Ticket #{m.Id} ({fStr}) - Chofer: {m.Conductor} | Faltante: {dif:N0} Lts ({m.PorcentajeMerma ?? 0}% Merma) | Fincas: {fincasLts:N0} L -> Recibido: {recepLts:N0} L");
                        }
                        hallazgosDirectos.AppendLine("=== FIN DE MAYORES MERMAS ===\n");
                    }
                }

                // Detección automática si pide análisis de fincas con problemas, leche ácida o calidad
                if ((mensaje ?? "").IndexOf("finca", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("problema", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("acida", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("ácida", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("dañada", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("calidad", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("peor", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    var fincasConProblemas = await connection.QueryAsync<dynamic>(@"
                        SELECT TOP 10 
                            f.Id, f.Nombre AS Finca,
                            SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END) AS LitrosAcida,
                            COUNT(CASE WHEN r.EsAcida = 1 THEN 1 END) AS ViajesConAcida,
                            COUNT(r.Id) AS TotalViajes,
                            SUM(r.Litros) AS TotalLitros,
                            MAX(r.Fecha) AS UltimaFecha
                        FROM TB_RUTAS_RECOLECCION r
                        JOIN TB_FINCAS f ON r.FincaId = f.Id
                        GROUP BY f.Id, f.Nombre
                        HAVING SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END) > 0
                        ORDER BY LitrosAcida DESC");

                    if (fincasConProblemas.Any())
                    {
                        hallazgosDirectos.AppendLine("=== ⚠️ AUDITORÍA DE FINCAS CON MAYORES PROBLEMAS DE LECHE ÁCIDA EN LA BASE DE DATOS ===");
                        int ranking = 1;
                        foreach (var fp in fincasConProblemas)
                        {
                            decimal ltsAcida = (decimal)(fp.LitrosAcida ?? 0m);
                            int viajesAcida = (int)(fp.ViajesConAcida ?? 0);
                            decimal totalLts = (decimal)(fp.TotalLitros ?? 0m);
                            decimal pctAcida = totalLts > 0 ? (ltsAcida / totalLts) * 100m : 0m;
                            string ultF = fp.UltimaFecha != null ? ((DateTime)fp.UltimaFecha).ToString("dd/MM/yyyy") : "N/A";

                            hallazgosDirectos.AppendLine($"{ranking}. FINCA: {fp.Finca}");
                            hallazgosDirectos.AppendLine($"   • Total Leche Ácida Descartada: {ltsAcida:N0} Litros en {viajesAcida} viaje(s)");
                            hallazgosDirectos.AppendLine($"   • Porcentaje de Leche Dañada/Ácida: {pctAcida:N1}% de su producción total ({totalLts:N0} Lts)");
                            hallazgosDirectos.AppendLine($"   • Última Incidencia Registrada: {ultF}");
                            ranking++;
                        }
                        hallazgosDirectos.AppendLine("=== FIN DE FINCAS CON PROBLEMA ===\n");
                    }
                }
            }
            catch { }

            // ====================================================
            // RECOLECCIÓN COMPLETA DEL CONTEXTO DE LA BASE DE DATOS
            // ====================================================

            // 1. Ciclo Activo
            var cicloActivo = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT TOP 1 Id, Codigo, FechaInicio, FechaFin, Estado FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY Id DESC")
                ?? await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT TOP 1 Id, Codigo, FechaInicio, FechaFin, Estado FROM TB_CICLOS_OPERATIVOS ORDER BY Id DESC");

            int cicloId = cicloActivo?.Id ?? 0;
            string cicloCodigo = cicloActivo?.Codigo ?? "Sin Ciclo";

            // 2. Tasa BCV
            decimal tasaBcv = await connection.ExecuteScalarAsync<decimal?>(
                "SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC") ?? 0m;

            // 3. Todos los Choferes/Conductores del sistema
            var conductores = (await connection.QueryAsync<dynamic>(@"
                SELECT u.Id, u.NombreCompleto, u.Username, u.Rol,
                    SUM(ISNULL(r.Litros, 0)) AS TotalLitrosRecolectados,
                    COUNT(DISTINCT r.FincaId) AS TotalFincasAtendidas,
                    SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END) AS LitrosAcidos
                FROM TB_USUARIOS u
                LEFT JOIN TB_RUTAS_RECOLECCION r ON u.Id = r.UsuarioId AND r.CicloId = @cicloId
                WHERE u.Rol IN ('CONDUCTOR', 'CHOFER', 'OPERADOR') OR u.Id IN (SELECT DISTINCT UsuarioId FROM TB_RUTAS_RECOLECCION WHERE CicloId = @cicloId AND UsuarioId IS NOT NULL)
                GROUP BY u.Id, u.NombreCompleto, u.Username, u.Rol
                ORDER BY TotalLitrosRecolectados DESC", new { cicloId })).ToList();

            // Desempeño por chofer en rutas
            var choferesPorRutas = (await connection.QueryAsync<dynamic>(@"
                SELECT u.Id, u.NombreCompleto, u.Username,
                    SUM(r.Litros) AS TotalLitros,
                    COUNT(DISTINCT r.FincaId) AS TotalFincas,
                    COUNT(r.Id) AS TotalViajes,
                    SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END) AS LitrosAcidos,
                    (
                        SELECT STRING_AGG(f2.Nombre, ', ')
                        FROM (
                            SELECT DISTINCT f3.Nombre
                            FROM TB_RUTAS_RECOLECCION r2
                            INNER JOIN TB_FINCAS f3 ON r2.FincaId = f3.Id
                            WHERE r2.UsuarioId = u.Id AND r2.CicloId = @cicloId
                        ) f2
                    ) AS FincasAtendidas
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                WHERE r.CicloId = @cicloId
                GROUP BY u.Id, u.NombreCompleto, u.Username
                ORDER BY TotalLitros DESC", new { cicloId })).ToList();

            // 4. Todas las Fincas con métricas
            var fincas = (await connection.QueryAsync<dynamic>(@"
                SELECT f.Id, f.Nombre, f.TipoServicioId, ts.Nombre AS TipoServicio,
                    ISNULL(SUM(r.Litros), 0) AS TotalLitros,
                    ISNULL(SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END), 0) AS LitrosAcidos,
                    ISNULL(COUNT(r.Id), 0) AS TotalViajes
                FROM TB_FINCAS f
                LEFT JOIN TB_TIPO_SERVICIO ts ON f.TipoServicioId = ts.Id
                LEFT JOIN TB_RUTAS_RECOLECCION r ON f.Id = r.FincaId AND r.CicloId = @cicloId
                GROUP BY f.Id, f.Nombre, f.TipoServicioId, ts.Nombre
                ORDER BY TotalLitros DESC", new { cicloId })).ToList();

            // 5. Entregas a Plantas (Resumen de Receptoría / Compañías)
            var entregas = (await connection.QueryAsync<dynamic>(@"
                SELECT c.Nombre AS Planta, e.Litros, e.Fecha, ts.Nombre AS TipoServicio,
                    u.NombreCompleto AS Conductor
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                LEFT JOIN TB_TIPO_SERVICIO ts ON c.TipoServicioId = ts.Id
                LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                WHERE e.CicloId = @cicloId
                ORDER BY e.Fecha DESC", new { cicloId })).ToList();

            // 6. TICKETS DETALLADOS DE SALIDA / DESPACHOS A COMPAÑÍAS (TB_CONTROL_COMPANIAS)
            var despachosDetallados = (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 300 cc.Id, cc.Fecha, u.NombreCompleto AS Conductor, c.Nombre AS Compania,
                       cc.LitrosDespachados, cc.LitrosRecibidosCompania, cc.DiferenciaLitros, cc.Estado, cc.Observacion,
                       co.Codigo AS CicloCodigo
                FROM TB_CONTROL_COMPANIAS cc
                LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS co ON cc.CicloId = co.Id
                ORDER BY cc.Id DESC")).ToList();

            // 7. TICKETS DETALLADOS DE ENTREGAS A RECEPTORÍA Y COMPAÑÍAS (TB_ENTREGAS_COMPANIA)
            var entregasDetalladas = (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 300 e.Id, e.Fecha, u.NombreCompleto AS Conductor, c.Nombre AS Compania,
                       e.Litros, e.Observacion, co.Codigo AS CicloCodigo, ts.Nombre AS TipoServicio
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS co ON e.CicloId = co.Id
                LEFT JOIN TB_TIPO_SERVICIO ts ON c.TipoServicioId = ts.Id
                ORDER BY e.Id DESC")).ToList();

            // 8. CONTROLES DE VIAJES / ENTRADAS A RECEPTORÍA (TB_CONTROL_RUTAS)
            var controlesRutasDetallados = (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 200 cr.Id, cr.Fecha, u.NombreCompleto AS Conductor,
                       cr.TotalLitrosFinca, cr.TotalLitrosReceptoria, cr.LitrosRecibidosReceptoria,
                       cr.DiferenciaLitros, cr.DiferenciaReceptoria, cr.Estado, cr.Observacion,
                       co.Codigo AS CicloCodigo
                FROM TB_CONTROL_RUTAS cr
                LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS co ON cr.CicloId = co.Id
                ORDER BY cr.Id DESC")).ToList();

            // 9. RECOLECCIONES INDIVIDUALES EN FINCAS (TB_RUTAS_RECOLECCION)
            var recoleccionesDetalladas = (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 250 r.Id, r.Fecha, u.NombreCompleto AS Conductor, f.Nombre AS Finca,
                       r.Litros, r.EsAcida, r.Observacion, co.Codigo AS CicloCodigo
                FROM TB_RUTAS_RECOLECCION r
                LEFT JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                LEFT JOIN TB_FINCAS f ON r.FincaId = f.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS co ON r.CicloId = co.Id
                ORDER BY r.Id DESC")).ToList();

            // 10. Adelantos Activos
            var adelantos = (await connection.QueryAsync<dynamic>(@"
                SELECT a.Id, a.MontoTotalUSD, a.MontoPendienteUSD, a.FechaSolicitud,
                    f.Nombre AS Beneficiario, a.TipoEntidad
                FROM TB_ADELANTOS a
                INNER JOIN TB_FINCAS f ON a.EntidadId = f.Id
                WHERE a.Estado = 'ACTIVO' AND a.MontoPendienteUSD > 0
                ORDER BY a.MontoPendienteUSD DESC", new { cicloId })).ToList();

            // 11. Historial BCV últimas fechas
            var historialBcv = (await connection.QueryAsync<dynamic>(
                "SELECT TOP 5 TasaDolarBs, Fecha FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC")).ToList();

            // 12. Histórico de Últimos 8 Ciclos (~2 meses)
            var historicoCiclos = (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 8 c.Id, c.Codigo, c.FechaInicio, c.FechaFin,
                    ISNULL(SUM(r.Litros), 0) AS TotalLitrosRecolectados,
                    ISNULL(SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END), 0) AS TotalLecheAcida,
                    (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e WHERE e.CicloId = c.Id) AS TotalLitrosEntregados
                FROM TB_CICLOS_OPERATIVOS c
                INNER JOIN TB_RUTAS_RECOLECCION r ON c.Id = r.CicloId
                GROUP BY c.Id, c.Codigo, c.FechaInicio, c.FechaFin
                ORDER BY c.Id DESC")).ToList();

            // 13. Histórico por chofer en los últimos 8 ciclos (~2 meses)
            var historicoChoferesMeses = (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 50 u.NombreCompleto AS Conductor, c.Codigo AS Ciclo,
                    SUM(r.Litros) AS TotalLitros,
                    COUNT(r.Id) AS TotalViajes,
                    SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END) AS LitrosAcidos
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                INNER JOIN TB_CICLOS_OPERATIVOS c ON r.CicloId = c.Id
                WHERE r.CicloId IN (
                    SELECT DISTINCT TOP 8 CicloId
                    FROM TB_RUTAS_RECOLECCION
                    ORDER BY CicloId DESC
                )
                GROUP BY u.NombreCompleto, c.Codigo, c.Id
                ORDER BY c.Id DESC, TotalLitros DESC")).ToList();

            // ====================================================
            // CONSTRUCCIÓN DEL CONTEXTO PARA GEMINI
            // ====================================================
            var ctx = new System.Text.StringBuilder();
            ctx.AppendLine("=== BASE DE DATOS OPERATIVA: SISTEMA DE TRANSPORTE Y CONTROL DE LECHE ===");
            ctx.AppendLine($"Ciclo Activo Actual: {cicloCodigo} | Tasa BCV Oficial: Bs. {tasaBcv:N2}/USD");
            ctx.AppendLine();

            if (hallazgosDirectos.Length > 0)
            {
                ctx.Append(hallazgosDirectos.ToString());
            }

            // Resumen Volumétrico del Ciclo Actual
            decimal totalFincas = fincas.Sum(f => (decimal)f.TotalLitros);
            decimal totalEntregas = entregas.Sum(e => (decimal)e.Litros);
            decimal mermaGlobal = totalFincas - totalEntregas;
            decimal totalAcidos = fincas.Sum(f => (decimal)f.LitrosAcidos);
            decimal totalAdelantos = adelantos.Sum(a => (decimal)a.MontoPendienteUSD);

            ctx.AppendLine("--- RESUMEN GLOBAL DEL CICLO ACTUAL ---");
            ctx.AppendLine($"Total recolectado en fincas: {totalFincas:N0} Lts");
            ctx.AppendLine($"Total entregado en plantas/receptorías: {totalEntregas:N0} Lts");
            ctx.AppendLine($"Merma/Diferencia global: {mermaGlobal:N0} Lts");
            ctx.AppendLine($"Leche ácida registrada: {totalAcidos:N0} Lts");
            ctx.AppendLine($"Adelantos pendientes por cobrar: ${totalAdelantos:N2} USD");
            ctx.AppendLine();

            // REGISTRO DETALLADO DE TICKETS DE DESPACHO / SALIDA (TB_CONTROL_COMPANIAS)
            ctx.AppendLine("--- REGISTRO DE TICKETS DE DESPACHO / SALIDA A COMPAÑÍAS Y QUESERAS (TB_CONTROL_COMPANIAS) ---");
            if (despachosDetallados.Any())
            {
                foreach (var d in despachosDetallados)
                {
                    string fStr = d.Fecha != null ? ((DateTime)d.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                    decimal ltsDesp = d.LitrosDespachados != null ? (decimal)d.LitrosDespachados : 0m;
                    decimal ltsRec = d.LitrosRecibidosCompania != null ? (decimal)d.LitrosRecibidosCompania : 0m;
                    decimal dif = d.DiferenciaLitros != null ? (decimal)d.DiferenciaLitros : (ltsRec - ltsDesp);
                    ctx.AppendLine($"Ticket #{d.Id} | Fecha: {fStr} | Chofer: {d.Conductor ?? "Sin asignar"} | Destino: {d.Compania ?? "Sin destino"} | Litros Despachados: {ltsDesp:N0} Lts | Litros Recibidos: {ltsRec:N0} Lts | Diferencia: {dif:N0} Lts | Estado: {d.Estado} | Ciclo: {d.CicloCodigo ?? "N/A"} | Obs: {d.Observacion ?? "Ninguna"}");
                }
            }
            else
            {
                ctx.AppendLine("No hay tickets de despacho registrados.");
            }
            ctx.AppendLine();

            // REGISTRO DETALLADO DE ENTREGAS A RECEPTORÍA Y COMPAÑÍAS (TB_ENTREGAS_COMPANIA)
            ctx.AppendLine("--- REGISTRO DE TICKETS DE ENTREGA A RECEPTORÍA Y COMPAÑÍAS (TB_ENTREGAS_COMPANIA) ---");
            if (entregasDetalladas.Any())
            {
                foreach (var e in entregasDetalladas)
                {
                    string fStr = e.Fecha != null ? ((DateTime)e.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                    decimal lts = e.Litros != null ? (decimal)e.Litros : 0m;
                    ctx.AppendLine($"Ticket Entrega #{e.Id} | Fecha: {fStr} | Chofer: {e.Conductor ?? "Sin chofer"} | Planta/Destino: {e.Compania} | Litros: {lts:N0} Lts | Ciclo: {e.CicloCodigo ?? "N/A"} | Tipo: {e.TipoServicio ?? "General"} | Obs: {e.Observacion ?? "Ninguna"}");
                }
            }
            else
            {
                ctx.AppendLine("No hay entregas registradas.");
            }
            ctx.AppendLine();

            // CONTROLES DE VIAJES / ENTRADAS A RECEPTORÍA (TB_CONTROL_RUTAS)
            ctx.AppendLine("--- REGISTRO DE ENTRADAS DE VIAJE A RECEPTORÍA (TB_CONTROL_RUTAS) ---");
            if (controlesRutasDetallados.Any())
            {
                foreach (var cr in controlesRutasDetallados)
                {
                    string fStr = cr.Fecha != null ? ((DateTime)cr.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                    decimal fincasLts = cr.TotalLitrosFinca != null ? (decimal)cr.TotalLitrosFinca : 0m;
                    decimal recepLts = cr.TotalLitrosReceptoria != null ? (decimal)cr.TotalLitrosReceptoria : (cr.LitrosRecibidosReceptoria != null ? (decimal)cr.LitrosRecibidosReceptoria : 0m);
                    decimal dif = cr.DiferenciaLitros != null ? (decimal)cr.DiferenciaLitros : (cr.DiferenciaReceptoria != null ? (decimal)cr.DiferenciaReceptoria : (recepLts - fincasLts));
                    ctx.AppendLine($"Control Viaje #{cr.Id} | Fecha: {fStr} | Chofer: {cr.Conductor ?? "Sin chofer"} | Litros Fincas: {fincasLts:N0} Lts | Litros Receptoría: {recepLts:N0} Lts | Diferencia: {dif:N0} Lts | Estado: {cr.Estado} | Ciclo: {cr.CicloCodigo ?? "N/A"} | Obs: {cr.Observacion ?? "Ninguna"}");
                }
            }
            else
            {
                ctx.AppendLine("No hay controles de viaje registrados.");
            }
            ctx.AppendLine();

            // RECOLECCIONES EN FINCAS (TB_RUTAS_RECOLECCION)
            ctx.AppendLine("--- REGISTRO DE RECOLECCIONES INDIVIDUALES EN FINCAS (TB_RUTAS_RECOLECCION) ---");
            foreach (var r in recoleccionesDetalladas.Take(100))
            {
                string fStr = r.Fecha != null ? ((DateTime)r.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                decimal lts = r.Litros != null ? (decimal)r.Litros : 0m;
                bool esAcida = false;
                try { esAcida = r.EsAcida != null && (r.EsAcida is bool ? (bool)r.EsAcida : Convert.ToInt32(r.EsAcida) == 1); } catch { }
                string acida = esAcida ? " [ÁCIDA]" : "";
                ctx.AppendLine($"Recolección #{r.Id} | Fecha: {fStr} | Chofer: {r.Conductor ?? "Sin chofer"} | Finca: {r.Finca ?? "Sin finca"} | Litros: {lts:N0} Lts{acida} | Ciclo: {r.CicloCodigo ?? "N/A"} | Obs: {r.Observacion ?? "Ninguna"}");
            }
            ctx.AppendLine();

            // Choferes Ciclo Actual
            ctx.AppendLine("--- CHOFERES / CONDUCTORES Y SU DESEMPEÑO (CICLO ACTUAL) ---");
            if (choferesPorRutas.Any())
            {
                foreach (var c in choferesPorRutas)
                {
                    ctx.AppendLine($"Conductor: {c.NombreCompleto} | Litros recolectados: {c.TotalLitros:N0} | Viajes: {c.TotalViajes} | Fincas atendidas: {c.TotalFincas} | Leche ácida: {c.LitrosAcidos:N0} Lts");
                    ctx.AppendLine($"  Fincas: {c.FincasAtendidas}");
                }
            }
            else
            {
                ctx.AppendLine("No hay choferes con rutas registradas en este ciclo.");
            }
            ctx.AppendLine();

            // Fincas
            ctx.AppendLine("--- FINCAS Y PRODUCCIÓN (CICLO ACTUAL) ---");
            foreach (var f in fincas.Take(30))
            {
                ctx.AppendLine($"Finca: {f.Nombre} | Servicio: {f.TipoServicio ?? "No definido"} | Litros: {f.TotalLitros:N0} | Ácida: {f.LitrosAcidos:N0} | Viajes: {f.TotalViajes}");
            }
            ctx.AppendLine();

            // Histórico de Últimos 2 Meses (8 Semanas)
            ctx.AppendLine("--- HISTÓRICO DE ÚLTIMOS 2 MESES (ÚLTIMOS 8 CICLOS OPERATIVOS) ---");
            decimal totalRec2Meses = 0;
            decimal totalEnt2Meses = 0;
            decimal totalAcida2Meses = 0;
            foreach (var hc in historicoCiclos)
            {
                decimal rec = (decimal)hc.TotalLitrosRecolectados;
                decimal ent = (decimal)hc.TotalLitrosEntregados;
                decimal ac = (decimal)hc.TotalLecheAcida;
                totalRec2Meses += rec;
                totalEnt2Meses += ent;
                totalAcida2Meses += ac;
                ctx.AppendLine($"Ciclo: {hc.Codigo} | Recolectado: {rec:N0} Lts | Entregado: {ent:N0} Lts | Merma: {(rec - ent):N0} Lts | Ácida: {ac:N0} Lts");
            }
            ctx.AppendLine($"TOTAL ACUMULADO 2 MESES (8 CICLOS): Recolectado: {totalRec2Meses:N0} Lts | Entregado: {totalEnt2Meses:N0} Lts | Leche Ácida: {totalAcida2Meses:N0} Lts");
            ctx.AppendLine();

            // Histórico por Choferes en 2 Meses
            ctx.AppendLine("--- HISTÓRICO DE CONDUCTORES EN ÚLTIMOS 2 MESES ---");
            var choferesAgrupadosMeses = historicoChoferesMeses.GroupBy(h => (string)h.Conductor);
            foreach (var gChofer in choferesAgrupadosMeses)
            {
                decimal totalLitrosChofer = gChofer.Sum(x => (decimal)x.TotalLitros);
                int totalViajesChofer = gChofer.Sum(x => (int)x.TotalViajes);
                decimal totalAcidaChofer = gChofer.Sum(x => (decimal)x.LitrosAcidos);
                ctx.AppendLine($"Conductor: {gChofer.Key} | Total 2 Meses: {totalLitrosChofer:N0} Lts | Viajes: {totalViajesChofer} | Leche Ácida Acumulada: {totalAcidaChofer:N0} Lts");
            }
            ctx.AppendLine();

            // Adelantos
            ctx.AppendLine("--- ADELANTOS ACTIVOS ---");
            foreach (var a in adelantos.Take(15))
            {
                ctx.AppendLine($"Beneficiario: {a.Beneficiario} | Monto Total: ${a.MontoTotalUSD:N2} USD | Pendiente: ${a.MontoPendienteUSD:N2} USD | Fecha: {((DateTime)a.FechaSolicitud).ToString("dd/MM/yyyy")}");
            }
            ctx.AppendLine();

            // BCV
            ctx.AppendLine("--- HISTORIAL TASA BCV ---");
            foreach (var b in historialBcv)
            {
                ctx.AppendLine($"Fecha: {((DateTime)b.Fecha).ToString("dd/MM/yyyy")} | Tasa: Bs. {b.TasaDolarBs:N2}");
            }

            string contextoCompleto = ctx.ToString();

            // ====================================================
            // LLAMADA A GEMINI AI CON FALLBACK Y REINTENTOS
            // ====================================================
            string respuestaGemini;
            var problemas = new List<string>();
            var sugerencias = new List<string>();

            try
            {
                respuestaGemini = await ConsultarGeminiAsync(contextoCompleto, mensaje);
            }
            catch (Exception)
            {
                // Fallback inteligente y experto si Gemini estuviera bajo alta demanda
                respuestaGemini = GenerarRespuestaLocalExperta(mensaje, totalRec2Meses, totalEnt2Meses, totalAcida2Meses, choferesAgrupadosMeses, cicloCodigo, totalFincas, totalEntregas, totalAcidos, totalAdelantos, tasaBcv, hallazgosDirectos.ToString());
            }

            return new ChatResponseDto
            {
                Respuesta = respuestaGemini,
                ProblemasDetectados = problemas,
                Sugerencias = sugerencias,
                Timestamp = DateTime.Now
            };
        }

        private string GenerarRespuestaLocalExperta(string pregunta, decimal totalRec2Meses, decimal totalEnt2Meses, decimal totalAcida2Meses, IEnumerable<dynamic> choferesMeses, string cicloCodigo, decimal totalFincas, decimal totalEntregas, decimal totalAcidos, decimal totalAdelantos, decimal tasaBcv, string hallazgosDirectos = "")
        {
            string p = (pregunta ?? "").ToLower().Trim();
            var sb = new System.Text.StringBuilder();

            // Si hay hallazgos directos encontrados para una cifra, ticket o auditoría específica, mostrarlos de inmediato
            if (!string.IsNullOrWhiteSpace(hallazgosDirectos))
            {
                sb.AppendLine("📊 **AUDITORÍA DE DATOS EXACTOS ENCONTRADOS EN LA BASE DE DATOS**\n");
                sb.AppendLine(hallazgosDirectos);

                if (hallazgosDirectos.Contains("PROBLEMAS DE LECHE ÁCIDA"))
                {
                    sb.AppendLine("💡 **Impacto Operativo & Recomendaciones:**");
                    sb.AppendLine("1. La leche ácida o descompuesta no se remunera ($0.00 / Litro) para proteger la contabilidad de la empresa, pero genera pérdida de flete y merma en cisterna.");
                    sb.AppendLine("2. **Inspección Técnica:** Se recomienda enviar a un supervisor técnico a verificar los equipos de enfriamiento y tanques de frío en las fincas con mayor reincidencia.");
                    sb.AppendLine("3. **Protocolo del Conductor:** En la App Móvil o formato físico, el chofer debe realizar la prueba de alcohol antes de vaciar las pimpinas en el camión cisterna para evitar contaminar la leche buena del resto de la ruta.");
                }
                else
                {
                    sb.AppendLine("💡 **Causa del Saldo / Descuadre:**");
                    sb.AppendLine("Un saldo o merma negativa (como faltante de litros) ocurre cuando el volumen recolectado en las fincas no cuenta con la recepción asentada en Receptoría o no se completó el despacho a Planta.");
                    sb.AppendLine("\n**¿Cómo solucionarlo en el sistema?**");
                    sb.AppendLine("1. Ve a **🥛 Receptoría & Tanque** o **🚚 Rutas de Recolección**.");
                    sb.AppendLine("2. Localiza el Ticket / Control de Viaje correspondiente.");
                    sb.AppendLine("3. Haz clic en **`⚖️ Recibir en Receptoría`** o **`✏️ Editar`** para ingresar los litros reales medidos o ajustar la carga.");
                }
                return sb.ToString();
            }

            if (p.Contains("como registrar") || p.Contains("crear viaje") || p.Contains("nueva ruta") || p.Contains("iniciar viaje") || p.Contains("como crear"))
            {
                sb.AppendLine("🚀 **GUÍA PASO A PASO: Cómo Registrar un Viaje / Ruta de Recolección**\n");
                sb.AppendLine("1. **Ir a la Vista:** En el menú lateral izquierdo, haz clic en **🚚 Rutas de Recolección** (o pulsa la tecla de acceso directo).");
                sb.AppendLine("2. **Iniciar Viaje:** Haz clic en el botón superior azul **`+ Iniciar Nuevo Viaje / Registrar Ruta`**.");
                sb.AppendLine("3. **Datos de Cabecera:**");
                sb.AppendLine("   * Selecciona la **Fecha** del viaje.");
                sb.AppendLine("   * Selecciona el **Conductor / Chofer** en el buscador desplegable.");
                sb.AppendLine("   * Selecciona el **Vehículo / Camión**.");
                sb.AppendLine("   * Define el **Tipo de Servicio**:");
                sb.AppendLine("     - **Servicio de Ruta:** La leche va a acopiarse en Receptoría.");
                sb.AppendLine("     - **Servicio de Transporte:** La leche va directa a una Compañía/Quesera.");
                sb.AppendLine("4. **Cargar Fincas:** Haz clic en **`+ Agregar Finca`**, selecciona la finca del catálogo, ingresa los **Litros Recolectados** y marca la casilla **`🧪 Es Leche Ácida`** si la leche no pasó la prueba de alcohol.");
                sb.AppendLine("5. **Guardar:** Haz clic en **`💾 Guardar Ticket de Viaje`**. El sistema calculará automáticamente los litros totales y lo pondrá disponible en el flujo operativo.");
                return sb.ToString();
            }

            if (p.Contains("receptoria") || p.Contains("recibir") || p.Contains("tanque") || p.Contains("medicion") || p.Contains("regla"))
            {
                sb.AppendLine("🥛 **GUÍA PASO A PASO: Recepción en Receptoría y Balance de Tanque**\n");
                sb.AppendLine("1. **Ir al Módulo:** Haz clic en **🥛 Receptoría & Tanque** en el menú principal.");
                sb.AppendLine("2. **Localizar el Camión:** En la tabla **Pendientes de Recepción**, ubica el ticket del chofer.");
                sb.AppendLine("3. **Medir y Validar:** Haz clic en el botón **`⚖️ Recibir en Receptoría`**.");
                sb.AppendLine("4. **Ingresar Litros Reales:** Ingresa los litros medidos con regla en tanque. El sistema te mostrará en tiempo real si hay **Cuadre Exacto (0 L)**, **Faltante (- Lts)** o **Sobrante (+ Lts)**.");
                sb.AppendLine("5. **Decisión Logística:**");
                sb.AppendLine("   * **🏠 Dejar en Receptoría:** Se almacena en los tanques y se suma al inventario disponible.");
                sb.AppendLine("   * **🔄 Recargar y Despachar:** Si el camión cargará leche adicional del tanque para salir a una o varias queseras/plantas.");
                sb.AppendLine("6. **Confirmar:** Haz clic en **`Confirmar Recepción`**.");
                return sb.ToString();
            }

            if (p.Contains("pagar") || p.Contains("nomina") || p.Contains("sueldo") || p.Contains("chofer") || p.Contains("matera") || p.Contains("flete"))
            {
                sb.AppendLine("💰 **GUÍA PASO A PASO: Liquidación y Pagos a Choferes, Materas y Personal**\n");
                sb.AppendLine("1. **Ir a la Vista:** Menú lateral -> **💵 Pagos Choferes, Materas & Personal**.");
                sb.AppendLine("2. **Seleccionar Semana:** En el filtro superior, escoge el ciclo/semana a liquidar.");
                sb.AppendLine("3. **Pestañas Disponibles:**");
                sb.AppendLine("   * **📄 1. Liquidación Semanal:** Muestra a todos los trabajadores con sus litros transportados, tarifa por litro, sueldo devengado, cuotas de préstamos a descontar y neto final en USD y Bs.");
                sb.AppendLine("   * **⚙️ 2. Configuración de Sueldos & Tarifas:** Permite editar el Sueldo Base ($), Tarifa ($/L), Modalidad (Fijo/Variado/Mixto), Frecuencia (Semanal/Quincenal) y Cuentas de Pago Móvil.");
                sb.AppendLine("4. **Procesar el Pago:** Haz clic en el botón azul **`Pagar`** en la fila del trabajador.");
                sb.AppendLine("5. **Confirmar Detalles:** Verifica monto bruto, cuotas de adelantos, ingresa referencia bancaria y haz clic en **`Procesar Pago`**.");
                sb.AppendLine("6. **Comprobante:** Puedes hacer clic en **`🧾 Ver Recibo`** para imprimir o descargar el comprobante de liquidación firmado.");
                return sb.ToString();
            }

            if (p.Contains("revertir") || p.Contains("anular") || p.Contains("cancelar") || p.Contains("corregir") || p.Contains("error"))
            {
                sb.AppendLine("↩️ **GUÍA DE AUDITORÍA: Cómo Revertir, Corregir o Anular Operaciones**\n");
                sb.AppendLine("### 🚫 **1. Anular un Pago de Nómina / Liquidación:**");
                sb.AppendLine("- Ve a **Pagos Choferes, Materas & Personal**.");
                sb.AppendLine("- En la fila del trabajador con estado **PAGADO**, haz clic en el botón rojo **`🚫 Anular Pago`**.");
                sb.AppendLine("- Escribe el motivo de la anulación para la auditoría y confirma. El sistema **reabrirá automáticamente los saldos de los adelantos amortizados** y devolverá el estado a PENDIENTE.");
                sb.AppendLine("\n### ✏️ **2. Corregir Litros o Fincas en un Viaje:**");
                sb.AppendLine("- Ve a **Rutas de Recolección** -> localiza el ticket -> haz clic en **`✏️ Editar`**.");
                sb.AppendLine("- Modifica los litros, cambia las fincas o marca/desmarca leche ácida y guarda.");
                sb.AppendLine("\n### 🔄 **3. Cambiar Destino de un Viaje (Receptoría vs Compañía):**");
                sb.AppendLine("- Edita el viaje y cambia el selector de **Tipo de Servicio** para redirigir directamente.");
                return sb.ToString();
            }

            if (p.Contains("traspaso") || p.Contains("traspasar"))
            {
                sb.AppendLine("🔄 **GUÍA: Traspasos de Leche entre Camiones**\n");
                sb.AppendLine("1. Ve al módulo **🚚 Rutas de Recolección / Control de Viajes**.");
                sb.AppendLine("2. Haz clic en el botón **`🔄 Traspaso de Leche`** en la barra superior.");
                sb.AppendLine("3. Selecciona el **Ticket Origen** (el camión que cede o transfiere leche).");
                sb.AppendLine("4. Selecciona el **Ticket Destino** (el camión que recibe la carga).");
                sb.AppendLine("5. Ingresa la cantidad exacta de litros a transferir y el motivo de la operación.");
                sb.AppendLine("6. Haz clic en **`Confirmar Traspaso`**. El sistema ajustará automáticamente los inventarios de ambos camiones.");
                return sb.ToString();
            }

            if (p.Contains("adelanto") || p.Contains("prestamo"))
            {
                sb.AppendLine("💳 **GUÍA: Módulo de Adelantos y Préstamos**\n");
                sb.AppendLine("1. Ve al menú lateral -> **💳 Adelantos & Préstamos**.");
                sb.AppendLine("2. Haz clic en **`+ Nuevo Adelanto`**.");
                sb.AppendLine("3. Selecciona si es para una **Finca (Productor)** o un **Empleado / Chofer**.");
                sb.AppendLine("4. Ingresa el **Monto Total en USD**, fecha y número de cuotas semanales para amortizar.");
                sb.AppendLine("5. Al guardar, cada vez que se liquide el pago semanal, el sistema descontará la cuota programada hasta llegar a saldo $0.00.");
                return sb.ToString();
            }

            if (p.Contains("leche acida") || p.Contains("acida") || p.Contains("calidad"))
            {
                sb.AppendLine("🧪 **INFORMACIÓN CLAVE: Manejo de Leche Ácida en el Sistema**\n");
                sb.AppendLine("1. **Medición Física:** La leche ácida sí se cuenta en el volumen físico total transportado en el camión.");
                sb.AppendLine("2. **Facturación y Pago:** Por regla de negocio estándar, la leche ácida tiene precio **$0.00 / Litro** (no se remunera comercialmente) a menos que se defina un acuerdo de rescate.");
                sb.AppendLine("3. **Reportes:** En la Relación de Pagos de Fincas y de Compañías aparece separada claramente en la columna **`TOTAL MALA/ACIDA`** para total transparencia contable.");
                return sb.ToString();
            }

            // Diagnóstico general por defecto
            sb.AppendLine("🤖 **Asistente Virtual & Analista Experto del Sistema**\n");
            sb.AppendLine($"### 📊 **Resumen Operativo Acumulado (Últimos 2 Meses - 8 Ciclos)**");
            sb.AppendLine($"- **Volumen Total Recolectado:** {totalRec2Meses:N0} Lts");
            sb.AppendLine($"- **Volumen Total Entregado:** {totalEnt2Meses:N0} Lts");
            sb.AppendLine($"- **Merma Histórica Acumulada:** {(totalRec2Meses - totalEnt2Meses):N0} Lts");
            sb.AppendLine($"- **Leche Ácida Registrada (2 meses):** {totalAcida2Meses:N0} Lts\n");

            sb.AppendLine($"### 📍 **Estado del Ciclo Actual ({cicloCodigo})**");
            sb.AppendLine($"- Recolección semanal en fincas: {totalFincas:N0} Lts");
            sb.AppendLine($"- Entregas en plantas/receptorías: {totalEntregas:N0} Lts");
            sb.AppendLine($"- Leche ácida: {totalAcidos:N0} Lts");
            sb.AppendLine($"- Adelantos pendientes: ${totalAdelantos:N2} USD");
            sb.AppendLine($"- Tasa BCV Oficial: Bs. {tasaBcv:N2}/USD\n");

            sb.AppendLine("💡 *¿Tienes dudas sobre un proceso? Pregúntame cómo registrar viajes, cómo liquidar nómina, cómo hacer traspasos o cómo revertir cualquier error.*");
            return sb.ToString();
        }

        private async Task<string> ConsultarGeminiAsync(string contexto, string pregunta)
        {
            string prompt = $@"Eres el 'Asistente Virtual & Analista Experto del Sistema Transporte V2' para la recolección, transporte, recepción y comercialización de leche en Venezuela.
Tienes conocimiento de toda la arquitectura del sistema y acceso directo en tiempo real a las tablas, tickets y registros de la base de datos SQL.

================================================================================
REGLA DE ORO DE RESPUESTA (MÁXIMA PRIORIDAD):
================================================================================
1. SI EL USUARIO PREGUNTA POR UNA CIFRA ESPECÍFICA (ej: '-1774 litros', '3380', '656', etc.), UN DESCUADRE, UN CHOFER O UN TICKET:
   - ESTÁ TOTALMENTE PROHIBIDO DAR RESPUESTAS TEÓRICAS ABSTRACTAS O DE MANUAL (NO respondas '1. ¿Qué significa un valor negativo?' ni expliques teoría genérica).
   - DEBES IR DIRECTO A LOS REGISTROS REALES DE LA BASE DE DATOS:
     * Cita el Control de Viaje / Ticket # exacto.
     * Cita la Fecha y el Chofer responsable.
     * Muestra el desglose exacto de litros finca por finca vs lo recibido en receptoría o entregado a planta.
     * Explica con precisión quirúrgica por qué se produjo la diferencia (ej: 'El chofer Julio Atencio recolectó 1.774 L en 5 fincas: Rancho Alegre 116 L, 3 de Mayo 155 L, Repelon 742 L, Punto 11 185 L, La Carolina 576 L, pero en Receptoría se registraron 0 L, generando la diferencia de -1.774 L').
     * Indica la solución exacta en el sistema paso a paso para cuadrarlo.

2. SI EL USUARIO PREGUNTA 'CÓMO HACER ALGO' O 'CÓMO REVERTIR UN ERROR':
   - Guíalo con pasos numerados claros, nombrando las vistas exactas (#rutas, #receptoria, #pagos-usuarios, etc.) y los botones que debe presionar.

3. REGLA DE CONCISIÓN Y PRECISIÓN (MÁXIMA PRIORIDAD):
   - RESPONDE DIRECTAMENTE LO SOLICITADO, SIN RODEOS NI EXTENSIÓN INNECESARIA.
   - Si el usuario hace una pregunta puntual (ej: 'cuál es la finca con mejor promedio', 'cuál es la finca que más problema da', 'cuál chofer recolectó más'), entrega una RESPUESTA PUNTUAL Y DIRECTA:
     * Ejemplo: 'La finca con más problemas es **SAN PEDRO**, con 2.202 Lts de leche ácida en 5 viajes (última incidencia: 02/11/2026). Si requieres el desglose viaje por viaje o recomendaciones, indícamelo.'
   - NO agregues tablas gigantes ni explicaciones de manual si el usuario no pidió expresamente 'más información', 'detalles' o 'reporte completo'.
   - Si el usuario pide explícitamente más detalles o análisis a fondo, entonces sí desglosa la auditoría completa.
   - 100% ESPAÑOL OBLIGATORIO. Profesional, directo y al grano.

=== CONTEXTO COMPLETO DE LA BASE DE DATOS SQL (EN TIEMPO REAL) ===
{contexto}
=== FIN DEL CONTEXTO ===

CONSULTA DEL USUARIO: {pregunta}

RESPUESTA DEL ASISTENTE VIRTUAL (100% ESPAÑOL, DIRECTO A LOS DATOS EXACTOS, SIN TEORÍA ABSTRACTA):";

            var requestBody = new
            {
                systemInstruction = new
                {
                    parts = new[]
                    {
                        new { text = "Eres el Asistente Virtual y Consultor Experto del Sistema Transporte V2. Tienes acceso a datos SQL en vivo. Responde SIEMPRE 100% en ESPAÑOL, DIRECTO A LO QUE SE TE PREGUNTA, de forma CONCISA, EXACTA y SIN RODEOS. Si la pregunta es puntual, responde en 1 o 2 frases con los datos exactos y ofrece dar más detalles si el usuario lo solicita. Solo genera reportes o tablas extensas cuando el usuario pida expresamente más información." }
                    }
                },
                contents = new[]
                {
                    new
                    {
                        parts = new[]
                        {
                            new { text = prompt }
                        }
                    }
                },
                generationConfig = new
                {
                    temperature = 0.15,
                    maxOutputTokens = 8192
                }
            };

            string json = System.Text.Json.JsonSerializer.Serialize(requestBody);

            // Intentar con modelos Gemini ultra-rápidos en cascada con reintentos
            string[] modelos = new[] { "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-3.5-flash" };
            Exception? ultimoError = null;

            foreach (var modelo in modelos)
            {
                for (int intento = 1; intento <= 2; intento++)
                {
                    try
                    {
                        var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
                        string url = $"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={_geminiApiKey}";

                        var response = await _httpClient.PostAsync(url, content);
                        string responseBody = await response.Content.ReadAsStringAsync();

                        if (response.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable ||
                            response.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
                        {
                            ultimoError = new Exception($"Modelo {modelo} no disponible (503/429)");
                            await Task.Delay(1000 * intento);
                            continue;
                        }

                        if (!response.IsSuccessStatusCode)
                        {
                            ultimoError = new Exception($"Modelo {modelo} error {response.StatusCode}");
                            break; // Probar siguiente modelo
                        }

                        using var doc = System.Text.Json.JsonDocument.Parse(responseBody);
                        var candidates = doc.RootElement.GetProperty("candidates");
                        if (candidates.GetArrayLength() > 0)
                        {
                            var parts = candidates[0].GetProperty("content").GetProperty("parts");
                            var sbTexto = new System.Text.StringBuilder();

                            foreach (var part in parts.EnumerateArray())
                            {
                                if (part.TryGetProperty("text", out var t))
                                {
                                    string pText = t.GetString() ?? "";
                                    // Ignorar si la parte es solo pensamiento o metacognición
                                    if (!part.TryGetProperty("thought", out _))
                                    {
                                        sbTexto.AppendLine(pText);
                                    }
                                }
                            }

                            string resultadoFinal = sbTexto.ToString().Trim();

                            if (string.IsNullOrWhiteSpace(resultadoFinal))
                            {
                                resultadoFinal = candidates[0]
                                    .GetProperty("content")
                                    .GetProperty("parts")[0]
                                    .GetProperty("text")
                                    .GetString() ?? "";
                            }

                            return resultadoFinal;
                        }
                    }
                    catch (Exception ex)
                    {
                        ultimoError = ex;
                    }
                }
            }

            throw ultimoError ?? new Exception("No se pudo obtener respuesta del modelo de IA.");
        }
    }

    // =====================================================================
    // INTERFACE: IControlRutasRepository
    // =====================================================================
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

        // Nuevos métodos del ciclo de vida logístico de Viajes / Tickets (AGENTS_2)
        Task<ControlRutaDto?> ObtenerViajeActivoChoferAsync(int choferId);
        Task<IEnumerable<ControlRutaDto>> ObtenerViajesActivosChoferAsync(int choferId, DateTime? fecha = null);
        Task<long> CrearNuevoViajeAsync(CrearViajeDto dto, int usuarioId, string rol);
        Task<long> AgregarFincaAViajeAsync(AgregarFincaViajeDto dto, int usuarioId, string rol);
        Task<IEnumerable<RutaItemDto>> ObtenerFincasDeViajeAsync(long controlRutaId);
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

        // Métodos de Modificación Auditada desde el Control de Viaje
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

            // Auto-enlazar paradas huérfanas de ese conductor y fecha si tienen ControlRutaId NULL
            try
            {
                await connection.ExecuteAsync(@"
                    UPDATE r SET r.ControlRutaId = cr.Id
                    FROM TB_RUTAS_RECOLECCION r
                    INNER JOIN TB_CONTROL_RUTAS cr ON r.UsuarioId = cr.UsuarioId AND CAST(r.Fecha AS DATE) = CAST(cr.Fecha AS DATE)
                    WHERE r.ControlRutaId IS NULL;");
            }
            catch { /* Tolerante */ }

            // Sincronizar automáticamente tickets para planificaciones de esa fecha que aún no existan en TB_CONTROL_RUTAS
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

                    string fIds = (string?)p.FincasIds ?? "";
                    if (!string.IsNullOrWhiteSpace(fIds))
                    {
                        var fList = fIds.Split(',', StringSplitOptions.RemoveEmptyEntries)
                            .Select(s => int.TryParse(s.Trim(), out var n) ? n : 0)
                            .Where(n => n > 0).Distinct();
                        foreach (var fId in fList)
                        {
                            await connection.ExecuteAsync(@"
                                IF NOT EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @newTicketId AND FincaId = @fId)
                                BEGIN
                                    INSERT INTO TB_RUTAS_RECOLECCION 
                                    (ControlRutaId, UsuarioId, FincaId, Fecha, Litros, TipoLeche, EsAcida, EsDiferido, Observacion, CreatedAt, ModifiedAt)
                                    VALUES 
                                    (@newTicketId, @ConductorId, @fId, @Fecha, 0, 'VACA', 0, 0, '', GETDATE(), NULL);
                                END", new { newTicketId, p.ConductorId, fId, p.Fecha });
                        }
                    }
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
                    cr.CicloId, cr.TotalLitrosFinca, cr.TotalLitrosReceptoria,
                    cr.DiferenciaLitros, cr.PorcentajeMerma, cr.Estado, cr.Observacion, cr.CreatedAt,
                    cr.ProcesoActualId,
                    pt.Codigo AS CodigoProceso,
                    pt.Nombre AS NombreProceso,
                    pt.Color AS ColorProceso,
                    pt.Icono AS IconoProceso,
                    cr.RutaLogisticaId,
                    rl.Nombre AS RutaLogisticaNombre,
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
                  AND (UPPER(@rol) LIKE '%ADMIN%' OR @rol IN ('SUPERVISOR', 'GERENTE') OR (cr.UsuarioId = @usuarioId AND CAST(cr.Fecha AS DATE) <= CAST(GETDATE() AS DATE)))
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
                       rl.Nombre AS RutaLogisticaNombre,
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
                VALUES (@nuevoId, @procesoId, GETDATE(), @usuarioId, 'Creación de ticket');",
                new { nuevoId, procesoId, usuarioId });

            return nuevoId;
        }

        public async Task<long> RecalcularControlAsync(DateTime fecha, int conductorId, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var fechaControl = fecha.Date;
            int conductorEfectivo = (rol == "ADMIN" && conductorId > 0) ? conductorId : usuarioId;

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
                    VALUES (@nuevoId, @procesoId, GETDATE(), @usuarioId, 'Generado en recálculo');",
                    new { nuevoId, procesoId, usuarioId });

                return nuevoId;
            }
        }

        public async Task<bool> EditarControlAsync(long id, EditarControlRutaDto dto, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            var control = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @id", new { id });
            if (control == null) return false;

            if (rol == "CHOFER" && (int)control.UsuarioId != usuarioId)
                throw new UnauthorizedAccessException("No tienes permiso para editar controles de otros conductores.");

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
                    RutaLogisticaId = ISNULL(@rutaLogisticaId, RutaLogisticaId),
                    Observacion = @observacion, 
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

                // Cascada: Sincronizar también recepciones y entregas asociadas al ticket
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
                            VALUES (@id, 'TICKET', @id, 'EDITAR_FECHA', @fechaAntStr, @fechaNueStr, 'Cambio de fecha de ticket y sincronización en cascada a fincas', @usuarioId, GETDATE());",
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
                    new { id, procesoId = dto.ProcesoActualId.Value, usuarioId, obs = dto.Observacion ?? "Cambio de proceso en edición" });
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

            // Eliminar registros de fincas vinculados a este ticket de ruta, entregas en receptoría/compañías y su historial
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
            if (proceso == null) throw new InvalidOperationException("El proceso seleccionado no existe o no está activo.");

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
        // MÉTODOS DEL NUEVO FLUJO LOGÍSTICO (AGENTS_2)
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
                    rl.Nombre AS RutaLogisticaNombre,
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
                    WHERE Fecha = @Fecha AND ConductorId = @ChoferId AND Activo = 1 
                    ORDER BY Id DESC";
                var fincasStr = await connection.ExecuteScalarAsync<string?>(fincasPlanSql, new { Fecha = viaje.Fecha.Date, ChoferId = choferId });
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
                    cr.CicloId, cr.TotalLitrosFinca, cr.TotalLitrosReceptoria,
                    cr.DiferenciaLitros, cr.PorcentajeMerma, cr.Estado, cr.Observacion, cr.CreatedAt,
                    cr.ProcesoActualId,
                    pt.Codigo AS CodigoProceso,
                    pt.Nombre AS NombreProceso,
                    pt.Color AS ColorProceso,
                    pt.Icono AS IconoProceso,
                    cr.RutaLogisticaId,
                    rl.Nombre AS RutaLogisticaNombre,
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
                              CAST(cr.Fecha AS DATE) = CAST(GETDATE() AS DATE)
                              OR (
                                  UPPER(ISNULL(cr.Estado, '')) NOT IN ('FINALIZADO', 'CERRADO') 
                                  AND ISNULL(cr.ProcesoActualId, 1) < 4
                                  AND DATEDIFF(day, cr.Fecha, GETDATE()) <= 30
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
                    WHERE Fecha = @Fecha AND ConductorId = @ChoferId AND Activo = 1 
                    ORDER BY Id DESC";
                var fincasStr = await connection.ExecuteScalarAsync<string?>(fincasPlanSql, new { Fecha = v.Fecha.Date, ChoferId = choferId });
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

            // Validar permiso de creación de viaje si es un chofer iniciando la ruta
            if (!rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) && !rol.Equals("SUPERVISOR", StringComparison.OrdinalIgnoreCase))
            {
                var permisoCrear = await connection.ExecuteScalarAsync<bool>(
                    "SELECT ISNULL(PermisoCrearViaje, 0) FROM TB_USUARIOS WHERE Id = @usuarioId",
                    new { usuarioId });

                if (!permisoCrear)
                {
                    // Choferes habilitados en móvil para crear e iniciar tickets y seleccionar la fecha operativa
                    try
                    {
                        await connection.ExecuteAsync("UPDATE TB_USUARIOS SET PermisoCrearViaje = 1 WHERE Id = @usuarioId", new { usuarioId });
                    }
                    catch { /* Tolerante */ }
                }
            }

            // Validar si el ciclo operativo correspondiente a la fecha está cerrado
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
                VALUES (@fecha, @conductorEfectivo, @cicloId, 0, 0, 0, 0, 'ABIERTO', 1, @rutaLogisticaId, @observacion, GETDATE(), @usuarioId);
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

            var nuevoId = await connection.ExecuteScalarAsync<long>(sqlInsert, new
            {
                fecha, conductorEfectivo, cicloId, 
                rutaLogisticaId = primaryRutaId,
                observacion = observacionFinal, usuarioId
            });

            // Si se especificó un CamionId, asociarlo a la planificación del viaje para que la cisterna figure en la App
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
                            (@fecha, @camionId, @conductorEfectivo, @primaryRutaId, @nuevoId, @obs, 1, GETDATE());
                        END",
                        new { fecha, camionId = dto.CamionId.Value, conductorEfectivo, primaryRutaId, nuevoId, obs = observacionFinal });
                }
                catch { /* Tolerante */ }
            }

            // Sincronizar paradas iniciales del viaje con Litros = 0 (Precarga automática de fincas del circuito)
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
                        var fIdsRuta = await connection.QueryAsync<int>(
                            "SELECT Id FROM TB_FINCAS WHERE RutaId IN @rutasAConsultar AND Activo = 1 AND (IsDeleted = 0 OR IsDeleted IS NULL) ORDER BY OrdenRuta, Nombre",
                            new { rutasAConsultar });
                        fincasInicialesIds.AddRange(fIdsRuta);
                    }
                }

                if (fincasInicialesIds.Any())
                {
                    int cicloEfectivoId = cicloId ?? 0;
                    if (cicloEfectivoId <= 0)
                    {
                        cicloEfectivoId = await connection.ExecuteScalarAsync<int?>(
                            "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fecha >= CAST(FechaInicio AS DATE) AND @fecha <= CAST(FechaFin AS DATE)",
                            new { fecha }) ?? 0;
                        if (cicloEfectivoId <= 0)
                        {
                            cicloEfectivoId = await connection.ExecuteScalarAsync<int?>(
                                "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS ORDER BY FechaInicio DESC") ?? 1;
                        }
                    }

                    foreach (var fId in fincasInicialesIds.Distinct())
                    {
                        try
                        {
                            var sqlParada = @"
                                IF NOT EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @nuevoId AND FincaId = @fId)
                                BEGIN
                                    INSERT INTO TB_RUTAS_RECOLECCION
                                    (ControlRutaId, FincaId, CicloId, UsuarioId, Fecha, Litros, EsAcida, TipoLeche, EsDiferido, CreatedAt, Observacion)
                                    VALUES
                                    (@nuevoId, @fId, @cicloEfectivoId, @conductorEfectivo, @fecha, 0, 0, 'VACA', 0, GETDATE(), 'Asignada en inicio de ruta [ORIGEN_PLANIFICACION]');
                                END";
                            await connection.ExecuteAsync(sqlParada, new { nuevoId, fId, cicloEfectivoId, conductorEfectivo, fecha });
                        }
                        catch { /* Tolerante */ }
                    }
                }
            }

            // Notificación automática al chofer de asignación de ruta
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
                            Titulo = "🚛 ¡Nueva Ruta Asignada!",
                            Mensaje = $"Se te ha asignado la recolección para el {fecha:dd/MM/yyyy}. Rutas: {rutasStr}. Ticket #{nuevoId}.",
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

        public async Task<long> AgregarFincaAViajeAsync(AgregarFincaViajeDto dto, int usuarioId, string rol)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureTableNotificacionesExistsAsync(connection);
            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @ControlRutaId", new { dto.ControlRutaId });
            if (viaje == null) throw new InvalidOperationException("El Viaje / Ticket no existe.");

            bool esAdminOSuper = rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase) || 
                                 rol.Equals("SUPERVISOR", StringComparison.OrdinalIgnoreCase) ||
                                 rol.Equals("GERENTE", StringComparison.OrdinalIgnoreCase);

            if (!esAdminOSuper && rol.Equals("CHOFER", StringComparison.OrdinalIgnoreCase) && (int)viaje.UsuarioId != usuarioId)
                throw new UnauthorizedAccessException("No tienes permiso para agregar fincas a viajes de otro chofer.");

            if ((int)viaje.ProcesoActualId != 1)
                throw new InvalidOperationException("El viaje no está en estado ABIERTO. No se pueden agregar más fincas.");

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

            // Unificación Anti-Duplicados: Si la finca ya existe en este viaje/ticket (tenga 0 litros o litros previos), se actualiza
            var paradaExistenteId = await connection.ExecuteScalarAsync<long?>(@"
                SELECT TOP 1 Id FROM TB_RUTAS_RECOLECCION 
                WHERE ControlRutaId = @controlRutaId AND FincaId = @fincaId 
                ORDER BY CASE WHEN Litros = 0 OR Litros IS NULL THEN 0 ELSE 1 END ASC, Id DESC", 
                new { controlRutaId = dto.ControlRutaId, fincaId = dto.FincaId });

            long nuevaRutaId;
            if (paradaExistenteId.HasValue)
            {
                var sqlUpdateRuta = @"
                    UPDATE TB_RUTAS_RECOLECCION
                    SET Litros = @litros,
                        EsAcida = @esAcida,
                        TipoLeche = @tipoLeche,
                        EsDiferido = @esDiferido,
                        LitrosOriginales = CASE WHEN @esDiferido = 1 THEN @litros ELSE LitrosOriginales END,
                        PrecioLitroUSDAplicado = @precioAplicado,
                        TasaDolarBsAplicada = @tasaActual,
                        Observacion = @observacion,
                        FotoComprobante = ISNULL(@fotoComprobante, FotoComprobante),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @paradaExistenteId;

                    -- Limpieza preventiva de duplicados accidentales de la misma finca en el ticket
                    DELETE FROM TB_RUTAS_RECOLECCION 
                    WHERE ControlRutaId = @controlRutaId 
                      AND FincaId = @fincaId 
                      AND Id != @paradaExistenteId;";

                await connection.ExecuteAsync(sqlUpdateRuta, new
                {
                    litros = dto.Litros,
                    esAcida = dto.EsAcida,
                    tipoLeche = tipoLecheEfectivo,
                    esDiferido = esDiferidoEfectivo,
                    precioAplicado,
                    tasaActual,
                    observacion = dto.Observacion,
                    fotoComprobante = dto.FotoComprobante,
                    usuarioId,
                    controlRutaId = dto.ControlRutaId,
                    fincaId = dto.FincaId,
                    paradaExistenteId = paradaExistenteId.Value
                });
                nuevaRutaId = paradaExistenteId.Value;
            }
            else
            {
                var sqlInsertRuta = @"
                    INSERT INTO TB_RUTAS_RECOLECCION
                    (CicloId, Fecha, FincaId, UsuarioId, Litros, EsAcida, TipoLeche, EsDiferido, LitrosOriginales, PrecioLitroUSDAplicado, TasaDolarBsAplicada, UuidLocal, Observacion, FotoComprobante, ControlRutaId, CreatedAt, CreatedBy, ModifiedAt, ModifiedBy)
                    VALUES (@cicloId, @fecha, @fincaId, @choferId, @litros, @esAcida, @tipoLeche, @esDiferido, CASE WHEN @esDiferido = 1 THEN @litros ELSE NULL END, @precioAplicado, @tasaActual, @uuidLocal, @observacion, @fotoComprobante, @controlRutaId, GETDATE(), @usuarioId, GETDATE(), @usuarioId);
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
                    precioAplicado,
                    tasaActual,
                    uuidLocal = Guid.NewGuid().ToString(),
                    observacion = dto.Observacion,
                    fotoComprobante = dto.FotoComprobante,
                    controlRutaId = dto.ControlRutaId,
                    usuarioId
                });
            }

            // Actualizar total litros finca en el viaje
            await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET TotalLitrosFinca = (SELECT ISNULL(SUM(Litros), 0) FROM TB_RUTAS_RECOLECCION WHERE ControlRutaId = @controlRutaId),
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @controlRutaId",
                new { dto.ControlRutaId, usuarioId });

            // Notificar a supervisores y administradores que se agregó una finca a este ticket
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

                // Si la acción fue ejecutada por un Administrador/Supervisor (o alguien distinto al chofer), NOTIFICAR AL CHOFER
                if (viaje.UsuarioId != null && (int)viaje.UsuarioId != usuarioId)
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                        VALUES (@UsuarioId, 'FINCA_AGREGADA', @Titulo, @Mensaje, @FechaOperativa, @ReferenciaId, 0, GETDATE())",
                        new
                        {
                            UsuarioId = (int)viaje.UsuarioId,
                            Titulo = $"➕ Finca Agregada a tu Recorrido",
                            Mensaje = $"Se ha incorporado la finca {nombreFinca} a tu recorrido en el Ticket #{ticketCodigo}.",
                            FechaOperativa = fechaEfectiva,
                            ReferenciaId = dto.ControlRutaId
                        });
                }

                foreach (var destUserId in usuariosNotif)
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                        VALUES (@UsuarioId, 'FINCA_AGREGADA', @Titulo, @Mensaje, @FechaOperativa, @ReferenciaId, 0, GETDATE())",
                        new
                        {
                            UsuarioId = destUserId,
                            Titulo = $"🥛 Finca en Ticket #{ticketCodigo}",
                            Mensaje = $"{choferNombre} agregó {nombreFinca} ({dto.Litros:N0} Lts) al Ticket #{ticketCodigo}.",
                            FechaOperativa = fechaEfectiva,
                            ReferenciaId = dto.ControlRutaId
                        });
                }
            }
            catch { /* Tolerante */ }

            return nuevaRutaId;
        }

        public async Task<IEnumerable<RutaItemDto>> ObtenerFincasDeViajeAsync(long controlRutaId)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureTableNotificacionesExistsAsync(connection);

            // Auto-enlazar recolecciones huérfanas de ese viaje
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

            var sql = @"
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
                WHERE r.ControlRutaId = @controlRutaId
                   OR (r.ControlRutaId IS NULL 
                       AND r.UsuarioId = (SELECT TOP 1 UsuarioId FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId)
                       AND CAST(r.Fecha AS DATE) = (SELECT TOP 1 CAST(Fecha AS DATE) FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId))
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
                    FechaLlegadaReceptoria = GETDATE(),
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @controlRutaId",
                new { controlRutaId, usuarioId });

            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@controlRutaId, 2, GETDATE(), @usuarioId, @obs);",
                new { controlRutaId, usuarioId, obs = observacion ?? "Viaje despachado y enviado a Receptoría" });

            // Revocar permiso de crear viaje al chofer al terminar la ruta (un solo uso)
            int choferViajeId = (viaje.UsuarioId != null && (int)viaje.UsuarioId > 0) ? (int)viaje.UsuarioId : 0;
            if (choferViajeId > 0)
            {
                await connection.ExecuteAsync(
                    "UPDATE TB_USUARIOS SET PermisoCrearViaje = 0 WHERE Id = @choferViajeId",
                    new { choferViajeId });
            }

            return rows > 0;
        }

        public async Task<bool> RecibirEnReceptoriaAsync(long controlRutaId, RecibirEnReceptoriaDto dto, int usuarioId)
        {
            using var connection = new SqlConnection(_connectionString);
            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) return false;

            int totalFinca = Convert.ToInt32(viaje.TotalLitrosFinca ?? 0);
            int diferenciaRec = totalFinca - dto.LitrosRecibidos;
            decimal porcentajeRec = totalFinca > 0 ? Math.Round((Math.Abs(diferenciaRec) * 100.0m) / totalFinca, 2) : 0;

            if (dto.Accion == "DEJAR_EN_RECEPTORIA")
            {
                // La leche se queda en receptoría -> entrada concluida con éxito
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
                        FechaLlegadaReceptoria = ISNULL(FechaLlegadaReceptoria, GETDATE()),
                        CerradoPor = @usuarioId,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @controlRutaId",
                    new { litrosRecibidos = dto.LitrosRecibidos, diferenciaRec, porcentajeRec, estado, usuarioId, controlRutaId });

                await connection.ExecuteAsync(@"
                    INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                    VALUES (@controlRutaId, 4, GETDATE(), @usuarioId, @obs);",
                    new
                    {
                        controlRutaId,
                        usuarioId,
                        obs = $"Leche descargada en Receptoría. Litros recibidos: {dto.LitrosRecibidos} L (Dif: {diferenciaRec:+0;-0;0} L). Cierre del viaje. {dto.Observacion}".Trim()
                    });

                // Registrar entrada a Receptoría en TB_ENTREGAS_COMPANIA (evitar duplicados si ya existe)
                var compReceptoriaId = await connection.ExecuteScalarAsync<int?>(
                    @"SELECT TOP 1 Id FROM TB_COMPANIAS 
                      WHERE Activo = 1 
                      ORDER BY CASE 
                        WHEN EsPrincipal = 1 THEN 0
                        WHEN UPPER(Nombre) LIKE '%RECEPTOR%' THEN 1 
                        WHEN UPPER(Nombre) LIKE '%CAMPO%VERDE%' THEN 2 
                        WHEN UPPER(Nombre) LIKE '%VERGEL%' THEN 3 
                        WHEN UPPER(Nombre) LIKE '%PLANTA%' THEN 4 
                        ELSE 5 END, Id ASC")
                    ?? await connection.ExecuteScalarAsync<int?>("SELECT TOP 1 Id FROM TB_COMPANIAS WHERE Activo = 1 ORDER BY Id ASC")
                    ?? 5028;

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
                            ModifiedAt = GETDATE(),
                            ModifiedBy = @usuarioId
                        WHERE Id = @entregaExistenteId;",
                        new
                        {
                            entregaExistenteId = entregaExistenteId.Value,
                            litros = dto.LitrosRecibidos,
                            obs = $"Descarga en Receptoría desde Viaje #{controlRutaId}",
                            fecha = (DateTime)viaje.Fecha,
                            choferId = (int)viaje.UsuarioId,
                            usuarioId
                        });
                }
                else
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_ENTREGAS_COMPANIA (CicloId, CompaniaId, UsuarioId, Fecha, Litros, Observacion, ControlRutaId, CreatedAt, CreatedBy)
                        VALUES (@cicloId, @compReceptoriaId, @choferId, @fecha, @litros, @obs, @controlRutaId, GETDATE(), @usuarioId);",
                        new
                        {
                            cicloId = (int?)viaje.CicloId,
                            compReceptoriaId,
                            choferId = (int)viaje.UsuarioId,
                            fecha = (DateTime)viaje.Fecha,
                            litros = dto.LitrosRecibidos,
                            obs = $"Descarga en Receptoría desde Viaje #{controlRutaId}",
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
                        WHERE ControlRutaId = @controlRutaId AND Estado != 'FINALIZADO';",
                        new { litrosRecibidos = dto.LitrosRecibidos, diferenciaRec, porcentajeRec, usuarioId, controlRutaId });
                }
                catch { /* Tolerante */ }

                return rows > 0;
            }
            else
            {
                // RECARGAR_Y_DESPACHAR -> Sale a compañía
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
                        var obsItem = $"Recarga y Despacho desde Receptoría (Viaje #{controlRutaId}). {d.Observacion ?? dto.Observacion}".Trim();

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
                    var obsItem = $"Recarga y Despacho desde Receptoría (Viaje #{controlRutaId}). {dto.Observacion}".Trim();
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
                        obs = $"Recepción verificada ({dto.LitrosRecibidos} L). Recarga adicional: {recarga} L. Despachado a Compañía ({finalDespachado} L). {dto.Observacion}".Trim()
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
                            motivo = $"Recarga y despacho a compañía desde Receptoría. {dto.Observacion}".Trim(),
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
                    obs = $"Entrega directa a Compañía ID: {dto.CompaniaDestinoId}. Litros entregados: {dto.LitrosEntregados} L (Dif: {diferencia:+0;-0;0} L). {dto.Observacion}".Trim()
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

                // Eliminar cualquier entrega monolítica residual que no tenga ControlCompaniaId
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

            // Revocar permiso de crear viaje al chofer al finalizar contablemente
            int viajeChoferId = (viaje.UsuarioId != null && (int)viaje.UsuarioId > 0) ? (int)viaje.UsuarioId : 0;
            if (viajeChoferId > 0)
            {
                await connection.ExecuteAsync(
                    "UPDATE TB_USUARIOS SET PermisoCrearViaje = 0 WHERE Id = @viajeChoferId",
                    new { viajeChoferId });
            }

            return rows > 0;
        }

        public async Task<bool> RevertirProcesoViajeAsync(long controlRutaId, RevertirProcesoViajeDto dto, int usuarioId, string rol)
        {
            var motivo = string.IsNullOrWhiteSpace(dto?.Motivo) ? "Reversión de proceso a ruta" : dto.Motivo;

            using var connection = new SqlConnection(_connectionString);
            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) return false;

            int targetProcesoId = dto.NuevoProcesoId > 0 ? dto.NuevoProcesoId : 1;
            string targetEstado = targetProcesoId switch
            {
                1 => "ABIERTO",
                2 => "RECEPCIONADO",
                3 => "CAMINO A COMPAÑIA",
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
                // Reversión a Proceso 1 (En Ruta / Abierto): Dejar el proceso en CERO (solo fincas y litros recogidos)
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
                // Reversión a Proceso 2 (Receptoría): Limpiar despacho a compañías para permitir re-asignar destino
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

            // Priorizar el chofer asignado explícitamente o el que recolectó la ruta (no el admin creador)
            int choferDespacho = (dto.ChoferId.HasValue && dto.ChoferId.Value > 0)
                ? dto.ChoferId.Value
                : ((viaje.UsuarioId != null && (int)viaje.UsuarioId > 0) ? (int)viaje.UsuarioId : 0);

            if (choferDespacho <= 0)
            {
                throw new InvalidOperationException("Debe especificar un conductor asignado válido para el traslado.");
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
            int totalLitrosFinca = (int)(viaje.TotalLitrosFinca ?? 0);

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
                if (companiaId <= 0) throw new Exception("Debe especificar al menos una compañía de destino.");
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

            // Recalcular total acumulado de todos los despachos asociados a este ticket
            int totalDespachado = await connection.ExecuteScalarAsync<int>(
                "SELECT ISNULL(SUM(LitrosDespachados), 0) FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @controlRutaId",
                new { controlRutaId });

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

            // Finalizar la entrada en TB_CONTROL_RUTAS (Estado = 'RECEPCIONADO') con el total consolidado
            await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_RUTAS
                SET Estado = 'RECEPCIONADO',
                    TipoDestino = 'COMPANIA_DIRECTA',
                    ProcesoActualId = 3,
                    CompaniaDestinoId = @companiaId,
                    TotalLitrosReceptoria = @totalDespachado,
                    LitrosEntregadosCompania = @totalDespachado,
                    DiferenciaLitros = @dif,
                    DiferenciaCompania = @dif,
                    MermaTotalLitros = @dif,
                    PorcentajeMerma = @merma,
                    FechaEntregaCompania = GETDATE(),
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @controlRutaId",
                new { companiaId = finalCompaniaDestinoId, totalDespachado, dif, merma, usuarioId, controlRutaId });

            // Revocar permiso de crear viaje al chofer al terminar la ruta (un solo uso)
            int rutaChoferId = (viaje.UsuarioId != null && (int)viaje.UsuarioId > 0) ? (int)viaje.UsuarioId : 0;
            await connection.ExecuteAsync(
                "UPDATE TB_USUARIOS SET PermisoCrearViaje = 0 WHERE Id IN (@choferDespacho, @rutaChoferId)",
                new { choferDespacho, rutaChoferId });

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
                   OR Observacion LIKE '%Control Compañías #' + CAST(@controlCompaniaId AS VARCHAR) + '.%'
                   OR Observacion LIKE '%Control Companias #' + CAST(@controlCompaniaId AS VARCHAR) + '.%'
                   OR Observacion LIKE '%Control Compañías #' + CAST(@controlCompaniaId AS VARCHAR) + '%'
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
                string textoTraspaso = $"Recibió TRASPASO de +{litrosATraspasar} Lts desde Ticket #{ticketOrigenId} ({nombreChoferOrigen}). {dto.Observacion}".Trim();
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
                // Caso 2: Crear automáticamente el ticket de destino
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
                    throw new InvalidOperationException("El Chofer de destino seleccionado no es válido o está inactivo.");
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

            // Actualizar historial y bitácora del ticket destino
            await connection.ExecuteAsync(@"
                INSERT INTO TB_HISTORIAL_PROCESOS_TICKET (ControlRutaId, ProcesoId, FechaCambio, CambiadoPor, Observacion)
                VALUES (@ticketDestinoId, 1, GETDATE(), @usuarioId, @obsDestino);",
                new
                {
                    ticketDestinoId,
                    usuarioId,
                    obsDestino = $"Recepción de TRASPASO: +{litrosATraspasar} Lts transferidos desde Ticket #{ticketOrigenId} ({nombreChoferOrigen}). {dto.Observacion}".Trim()
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

            // Registrar en historial y bitácora del ticket origen
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

            // Obtener tanques iniciales del día anterior como base
            var sqlPrev = @"SELECT TOP 1 Tanque1Final, Tanque2Final, Tanque3Final, Tanque4Final, Tanque5Final, TotalFinalFisicoLitros 
                            FROM TB_CONTROL_TANQUES_DIARIO WHERE Fecha < @fecha ORDER BY Fecha DESC";
            var prevDia = await connection.QueryFirstOrDefaultAsync<dynamic>(sqlPrev, new { fecha = fecha.Date });

            int t1Ini = prevDia?.Tanque1Final ?? 0;
            int t2Ini = prevDia?.Tanque2Final ?? 0;
            int t3Ini = prevDia?.Tanque3Final ?? 0;
            int t4Ini = prevDia?.Tanque4Final ?? 0;
            int t5Ini = prevDia?.Tanque5Final ?? 0;
            int totalIni = prevDia?.TotalFinalFisicoLitros ?? (t1Ini + t2Ini + t3Ini + t4Ini + t5Ini);

            // Obtener Entradas y Salidas reales del día (Servicio Tipo 1: RUTA)
            var sqlMovimientos = @"
                -- ENTRADAS A SILOS (CompaniaId = 5028 - Receptoría)
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
                LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON e.ControlRutaId = cr.Id
                WHERE CAST(e.Fecha AS DATE) = @fecha 
                  AND e.CompaniaId = 5028

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
                  AND e.CompaniaId != 5028 
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

            // Si no hubiera entregas en TB_ENTREGAS_COMPANIA pero sí controles de ruta registrados
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

                // Si no tiene tanques iniciales cargados, auto-asignar del día previo
                if (record.Tanque1Inicial == 0 && record.Tanque2Inicial == 0 && record.Tanque3Inicial == 0 && record.Tanque4Inicial == 0 && record.Tanque5Inicial == 0 && totalIni > 0)
                {
                    record.Tanque1Inicial = t1Ini;
                    record.Tanque2Inicial = t2Ini;
                    record.Tanque3Inicial = t3Ini;
                    record.Tanque4Inicial = t4Ini;
                    record.Tanque5Inicial = t5Ini;
                    record.TotalInicialLitros = totalIni;
                }

                // Si no tiene filas de recepción registradas o están vacías, auto-llenar con los movimientos de hoy
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
                    throw new UnauthorizedAccessException("Este control diario ya está confirmado y cerrado. De allí para atrás solo el Administrador puede modificar datos.");
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
            if (!esAdminOSup) throw new UnauthorizedAccessException("Solo un Supervisor o Administrador puede confirmar la apertura del día.");

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
            if (!esAdminOSup) throw new UnauthorizedAccessException("Solo un Supervisor o Administrador puede confirmar el cierre del día.");

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
            if (rol != "ADMIN" && rol != "SUPERADMIN") throw new UnauthorizedAccessException("Solo un Administrador o SuperAdmin puede modificar fincas desde el Control de Viaje.");
            if (string.IsNullOrWhiteSpace(dto.Motivo)) throw new ArgumentException("El motivo o justificación de la modificación es obligatorio.");

            using var connection = new SqlConnection(_connectionString);

            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) throw new InvalidOperationException("El Viaje / Ticket no existe.");

            var rutaActual = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT r.*, f.Nombre AS FincaNombre, f.PrecioLitroUSD, f.PrecioLitroAcidaUSD 
                  FROM TB_RUTAS_RECOLECCION r 
                  INNER JOIN TB_FINCAS f ON r.FincaId = f.Id 
                  WHERE r.Id = @rutaId AND r.ControlRutaId = @controlRutaId", new { rutaId, controlRutaId });
            if (rutaActual == null) throw new InvalidOperationException("La recolección de finca no pertenece a este ticket o no existe.");

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

            // 1. Actualizar la recolección
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
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @rutaId",
                new { dto.FincaId, dto.Litros, dto.EsAcida, dto.EsDiferido, tipoLeche, precioAplicado, dto.Observacion, dto.FotoComprobante, usuarioId, rutaId });

            // 2. Registrar en Bitácora de Auditoría
            await connection.ExecuteAsync(@"
                INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                (ControlRutaId, TipoEntidad, EntidadId, TipoAccion, ValoresAnteriores, ValoresNuevos, Motivo, UsuarioId, Fecha)
                VALUES (@controlRutaId, 'FINCA_RUTA', @rutaId, 'EDITAR_FINCA', @valAnt, @valNue, @Motivo, @usuarioId, GETDATE());",
                new { controlRutaId, rutaId, valAnt, valNue, dto.Motivo, usuarioId });

            // 3. Recalcular métricas del ticket
            await _RecalcularMetricasTicketAsync(connection, controlRutaId, usuarioId);

            return true;
        }

        public async Task<bool> EliminarFincaDeViajeAuditadoAsync(long controlRutaId, long rutaId, string motivo, int usuarioId, string rol)
        {
            if (rol != "ADMIN") throw new UnauthorizedAccessException("Solo un Administrador puede eliminar fincas desde el Control de Viaje.");
            if (string.IsNullOrWhiteSpace(motivo)) throw new ArgumentException("El motivo o justificación de la eliminación es obligatorio.");

            using var connection = new SqlConnection(_connectionString);

            var viaje = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT * FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId", new { controlRutaId });
            if (viaje == null) throw new InvalidOperationException("El Viaje / Ticket no existe.");

            var rutaActual = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT r.*, f.Nombre AS FincaNombre 
                  FROM TB_RUTAS_RECOLECCION r 
                  INNER JOIN TB_FINCAS f ON r.FincaId = f.Id 
                  WHERE r.Id = @rutaId AND r.ControlRutaId = @controlRutaId", new { rutaId, controlRutaId });
            if (rutaActual == null) throw new InvalidOperationException("La recolección de finca no pertenece a este ticket o no existe.");

            string valAnt = $"Finca: {rutaActual.FincaNombre} (ID: {rutaActual.FincaId}), Litros: {rutaActual.Litros}, EsAcida: {((bool)rutaActual.EsAcida ? "SI" : "NO")}, Obs: {rutaActual.Observacion ?? "-"}";

            // 1. Eliminar la recolección
            await connection.ExecuteAsync("DELETE FROM TB_RUTAS_RECOLECCION WHERE Id = @rutaId", new { rutaId });

            // 2. Registrar en Bitácora de Auditoría
            await connection.ExecuteAsync(@"
                INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                (ControlRutaId, TipoEntidad, EntidadId, TipoAccion, ValoresAnteriores, ValoresNuevos, Motivo, UsuarioId, Fecha)
                VALUES (@controlRutaId, 'FINCA_RUTA', @rutaId, 'ELIMINAR_FINCA', @valAnt, NULL, @motivo, @usuarioId, GETDATE());",
                new { controlRutaId, rutaId, valAnt, motivo, usuarioId });

            // 3. Recalcular métricas del ticket
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
            if (rutaActual == null) throw new InvalidOperationException("La recolección de finca no pertenece a este ticket o no existe.");

            string valAnt = $"Finca: {rutaActual.FincaNombre}, Litros: {rutaActual.Litros}, EsAcida: {((bool)rutaActual.EsAcida ? "SI" : "NO")}, Obs: {rutaActual.Observacion ?? "-"}, Foto: {(string.IsNullOrEmpty((string)rutaActual.FotoComprobante) ? "NO" : "SI")}";

            // Resetear información de recolección manteniendo la asignación de la finca en el ticket (NO se elimina la finca)
            await connection.ExecuteAsync(@"
                UPDATE TB_RUTAS_RECOLECCION
                SET Litros = 0,
                    FotoComprobante = NULL,
                    EsAcida = 0,
                    EsDiferido = 0,
                    LitrosOriginales = NULL,
                    Observacion = NULL,
                    PrecioLitroUSDAplicado = NULL,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @usuarioId
                WHERE Id = @rutaId", new { rutaId, usuarioId });

            // Registrar en auditoría
            try
            {
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                    (ControlRutaId, TipoEntidad, EntidadId, TipoAccion, ValoresAnteriores, ValoresNuevos, Motivo, UsuarioId, Fecha)
                    VALUES (@controlRutaId, 'FINCA_RUTA', @rutaId, 'LIMPIAR_RECOLECCION', @valAnt, 'Litros: 0 (No Recogida)', 'Información de recolección eliminada (marcada como no recogida)', @usuarioId, GETDATE());",
                    new { controlRutaId, rutaId, valAnt, usuarioId });
            }
            catch { /* Tolerante */ }

            // Recalcular métricas del ticket
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
                        VALUES (@chofId, 'RECOLECCION_RESETEADA', '🔄 Parada Marcada como Pendiente', @msg, GETDATE(), @controlRutaId, 0, GETDATE())",
                        new { 
                            chofId, 
                            controlRutaId, 
                            msg = $"La información de \"{fNom}\" fue limpiada y colocada como NO RECOGIDA para tu recorrido en el Ticket #{controlRutaId}." 
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

            // Fechas únicas y Fincas únicas para consultar duplicados eficientemente
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

                // 1. Validaciones básicas
                if (!fila.Fecha.HasValue)
                {
                    res.EsValido = false;
                    res.Mensaje = "Fecha no especificada o inválida.";
                    conError++;
                    resultados.Add(res);
                    continue;
                }

                if (fila.FincaId <= 0)
                {
                    res.EsValido = false;
                    res.Mensaje = string.IsNullOrWhiteSpace(fila.FincaNombre) 
                        ? "Finca no identificada." 
                        : $"La finca \"{fila.FincaNombre}\" no existe en el catálogo activo.";
                    conError++;
                    resultados.Add(res);
                    continue;
                }

                if (fila.ConductorId <= 0)
                {
                    res.EsValido = false;
                    res.Mensaje = string.IsNullOrWhiteSpace(fila.ConductorNombre) 
                        ? "Conductor no identificado." 
                        : $"El conductor \"{fila.ConductorNombre}\" no existe o no está activo.";
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

                // 2. Asociar Camión automáticamente por conductor
                var camionAsociado = camiones.FirstOrDefault(c => c.UsuarioId == fila.ConductorId) 
                                     ?? camiones.FirstOrDefault(c => c.Placa == "S/P-9" || c.Placa == "S/P-4")
                                     ?? camiones.FirstOrDefault();
                if (camionAsociado != null)
                {
                    res.CamionId = (int)camionAsociado.Id;
                    res.CamionPlaca = (string)camionAsociado.Placa;
                    res.CamionCapacidadLitros = camionAsociado.CapacidadLitros != null ? (int)camionAsociado.CapacidadLitros : 10000;
                }

                // 3. Validar si ya está registrada (Detección de Duplicados)
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
                    res.Mensaje = "Fila válida. Lista para crear ticket.";
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
                response.MensajeGeneral = $"Se detectaron {conError} fila(s) con errores críticos que deben corregirse.";
            }
            else if (duplicadas > 0)
            {
                response.MensajeGeneral = $"Data analizada correctamente. Se detectaron {duplicadas} registro(s) que ya existen en el sistema (pueden ser omitidos automáticamente).";
            }
            else
            {
                response.MensajeGeneral = "¡Data 100% válida! No se encontraron inconsistencias ni registros duplicados. Lista para generar tickets.";
            }

            return response;
        }

        public async Task<EjecutarCargaMasivaExcelResponseDto> EjecutarCargaMasivaExcelAsync(EjecutarCargaMasivaExcelRequestDto dto, int usuarioId, string rol)
        {
            if (!rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase))
            {
                throw new UnauthorizedAccessException("Solo usuarios con rol Administrador o SuperAdmin tienen autorización para importar tickets masivos.");
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

                // Determinar camión
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
                    VALUES (@fechaGrupo, @conductorId, @cicloId, 0, 0, 0, 0, 'ABIERTO', 1, '[CARGA_EXCEL] Ticket generado por Importación Masiva', GETDATE(), @usuarioId);
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

                // Recalcular métricas del ticket
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
                        VALUES (@conductorId, 'TICKET_ASIGNADO', '🎫 Nuevo Ticket Creado (Excel)', @msg, @fechaGrupo, @ticketId, 0, GETDATE())",
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
                        CONCAT('Entrega validada desde Control Compañías #', cc.Id, '. Falla: ', cc.DiferenciaLitros, ' L. [', cc.TipoLeche, '] ', cc.Observacion) AS Observacion,
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
            if (rol != "ADMIN") throw new UnauthorizedAccessException("Solo un Administrador puede modificar entregas desde el Control de Viaje.");
            if (string.IsNullOrWhiteSpace(dto.Motivo)) throw new ArgumentException("El motivo o justificación de la modificación es obligatorio.");

            using var connection = new SqlConnection(_connectionString);

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
            if (compNueva == null) throw new InvalidOperationException("La compañía seleccionada no existe.");

            string valAnt = $"Compañía: {entregaActual.CompaniaNombre} (ID: {entregaActual.CompaniaId}), Litros: {entregaActual.Litros}, Obs: {entregaActual.Observacion ?? "-"}";
            string valNue = $"Compañía: {compNueva.Nombre} (ID: {dto.CompaniaId}), Litros: {dto.Litros}, Obs: {dto.Observacion ?? "-"}";

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

            // 2. Registrar en Bitácora de Auditoría
            await connection.ExecuteAsync(@"
                INSERT INTO TB_LOG_MODIFICACIONES_CONTROL
                (ControlRutaId, TipoEntidad, EntidadId, TipoAccion, ValoresAnteriores, ValoresNuevos, Motivo, UsuarioId, Fecha)
                VALUES (@controlRutaId, 'RECEPTORIA_ENTREGA', @entregaId, 'EDITAR_ENTREGA', @valAnt, @valNue, @Motivo, @usuarioId, GETDATE());",
                new { controlRutaId, entregaId, valAnt, valNue, dto.Motivo, usuarioId });

            // 3. Recalcular métricas del ticket
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
    // REPOSITORY: ControlCompaniasRepository (Salidas a Queseras / Compañías)
    // =====================================================================

    public interface IControlCompaniasRepository
    {
        Task<IEnumerable<ControlCompaniaDto>> ObtenerTodosAsync(DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, string? estado = null, int? usuarioId = null, int? companiaId = null, int? cicloId = null);
        Task<ControlCompaniaDto?> ObtenerPorIdAsync(long id);
        Task<ControlCompaniaDto?> ObtenerTicketActivoChoferAsync(int choferId);
        Task<IEnumerable<ControlCompaniaDto>> ObtenerTicketsActivosChoferAsync(int choferId, long? controlRutaId = null);
        Task<long> CrearDespachoAsync(CrearControlCompaniaDto dto, int creadoPor);
        Task<bool> ValidarYFinalizarEntregaAsync(long id, ValidarEntregaCompaniaDto dto, int modificadoPor);
        Task<bool> EditarDespachoAsync(long id, EditarControlCompaniaDto dto, int modificadoPor);
        Task<bool> EliminarDespachoAsync(long id, int modificadoPor);
        Task<ResumenTrazabilidadBufalaDto> ObtenerTrazabilidadBufalaAsync(DateTime? fechaDesde, DateTime? fechaHasta, int? cicloId, int? fincaId, int? companiaId, int? usuarioId, string? tipoServicio = null);
    }

    public class ControlCompaniasRepository : IControlCompaniasRepository
    {
        private readonly string _connectionString;

        public ControlCompaniasRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection")
                ?? configuration.GetConnectionString("BD_TRANSPORTE")
                ?? "Server=DESKTOP-0F548CM;Database=BD_TRANSPORTE_V2;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        public async Task<IEnumerable<ControlCompaniaDto>> ObtenerTodosAsync(DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, string? estado = null, int? usuarioId = null, int? companiaId = null, int? cicloId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var query = @"
                SELECT 
                    cc.Id,
                    cc.Fecha,
                    cc.UsuarioId,
                    u.NombreCompleto AS NombreConductor,
                    cc.CompaniaId,
                    c.Nombre AS NombreCompania,
                    ISNULL(c.TipoServicioId, 1) AS TipoServicioId,
                    cc.CicloId,
                    cc.LitrosDespachados,
                    cc.LitrosRecibidosCompania,
                    cc.DiferenciaLitros,
                    cc.PorcentajeMerma,
                    cc.Estado,
                    cc.TipoLeche,
                    cc.Observacion,
                    cc.FechaSalida,
                    cc.FechaEntrega,
                    cc.ControlRutaId,
                    cc.FotoReciboUrl,
                    cc.CreatedAt
                FROM TB_CONTROL_COMPANIAS cc
                LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE 1 = 1";

            var parameters = new DynamicParameters();

            if (cicloId.HasValue && cicloId.Value > 0)
            {
                var cicloFechas = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT FechaInicio, FechaFin FROM TB_CICLOS_OPERATIVOS WHERE Id = @cId", new { cId = cicloId.Value });
                if (cicloFechas != null && cicloFechas.FechaInicio != null && cicloFechas.FechaFin != null)
                {
                    DateTime fIni = Convert.ToDateTime(cicloFechas.FechaInicio).Date;
                    DateTime fFin = Convert.ToDateTime(cicloFechas.FechaFin).Date;
                    query += " AND (cc.CicloId = @cicloId OR (cc.Fecha >= @fIniCiclo AND cc.Fecha <= @fFinCiclo))";
                    parameters.Add("cicloId", cicloId.Value);
                    parameters.Add("fIniCiclo", fIni);
                    parameters.Add("fFinCiclo", fFin);
                }
                else
                {
                    query += " AND cc.CicloId = @cicloId";
                    parameters.Add("cicloId", cicloId.Value);
                }
            }

            if (fecha.HasValue)
            {
                query += " AND cc.Fecha = @fecha";
                parameters.Add("fecha", fecha.Value.Date);
            }
            if (fechaInicio.HasValue && (!cicloId.HasValue || cicloId.Value <= 0))
            {
                query += " AND cc.Fecha >= @fechaInicio";
                parameters.Add("fechaInicio", fechaInicio.Value.Date);
            }
            if (fechaFin.HasValue && (!cicloId.HasValue || cicloId.Value <= 0))
            {
                query += " AND cc.Fecha <= @fechaFin";
                parameters.Add("fechaFin", fechaFin.Value.Date);
            }
            if (!string.IsNullOrWhiteSpace(estado) && estado != "TODOS")
            {
                query += " AND cc.Estado = @estado";
                parameters.Add("estado", estado.Trim());
            }
            if (usuarioId.HasValue && usuarioId.Value > 0)
            {
                query += " AND cc.UsuarioId = @usuarioId";
                parameters.Add("usuarioId", usuarioId.Value);
            }
            if (companiaId.HasValue && companiaId.Value > 0)
            {
                query += " AND cc.CompaniaId = @companiaId";
                parameters.Add("companiaId", companiaId.Value);
            }

            query += " ORDER BY cc.Id DESC";

            return await connection.QueryAsync<ControlCompaniaDto>(query, parameters);
        }

        public async Task<ControlCompaniaDto?> ObtenerPorIdAsync(long id)
        {
            using var connection = new SqlConnection(_connectionString);
            var query = @"
                SELECT 
                    cc.Id,
                    cc.Fecha,
                    cc.UsuarioId,
                    u.NombreCompleto AS NombreConductor,
                    cc.CompaniaId,
                    c.Nombre AS NombreCompania,
                    cc.CicloId,
                    cc.LitrosDespachados,
                    cc.LitrosRecibidosCompania,
                    cc.DiferenciaLitros,
                    cc.PorcentajeMerma,
                    cc.Estado,
                    cc.TipoLeche,
                    cc.Observacion,
                    cc.FechaSalida,
                    cc.FechaEntrega,
                    cc.ControlRutaId,
                    cc.FotoReciboUrl,
                    cc.CreatedAt
                FROM TB_CONTROL_COMPANIAS cc
                LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE cc.Id = @id";

            return await connection.QueryFirstOrDefaultAsync<ControlCompaniaDto>(query, new { id });
        }

        public async Task<ControlCompaniaDto?> ObtenerTicketActivoChoferAsync(int choferId)
        {
            using var connection = new SqlConnection(_connectionString);
            var query = @"
                SELECT TOP 1
                    cc.Id,
                    cc.Fecha,
                    cc.UsuarioId,
                    u.NombreCompleto AS NombreConductor,
                    cc.CompaniaId,
                    c.Nombre AS NombreCompania,
                    cc.CicloId,
                    cc.LitrosDespachados,
                    cc.LitrosRecibidosCompania,
                    cc.DiferenciaLitros,
                    cc.PorcentajeMerma,
                    cc.Estado,
                    cc.TipoLeche,
                    cc.Observacion,
                    cc.FechaSalida,
                    cc.FechaEntrega,
                    cc.FotoReciboUrl,
                    cc.CreatedAt
                FROM TB_CONTROL_COMPANIAS cc
                LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE cc.UsuarioId = @choferId AND cc.Estado = 'EN VIA'
                ORDER BY cc.Id DESC";

            return await connection.QueryFirstOrDefaultAsync<ControlCompaniaDto>(query, new { choferId });
        }

        public async Task<IEnumerable<ControlCompaniaDto>> ObtenerTicketsActivosChoferAsync(int choferId, long? controlRutaId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var query = @"
                SELECT 
                    cc.Id,
                    cc.Fecha,
                    cc.UsuarioId,
                    u.NombreCompleto AS NombreConductor,
                    cc.CompaniaId,
                    c.Nombre AS NombreCompania,
                    cc.CicloId,
                    cc.LitrosDespachados,
                    cc.LitrosRecibidosCompania,
                    cc.DiferenciaLitros,
                    cc.PorcentajeMerma,
                    cc.Estado,
                    cc.TipoLeche,
                    cc.Observacion,
                    cc.FechaSalida,
                    cc.FechaEntrega,
                    cc.ControlRutaId,
                    cc.FotoReciboUrl,
                    cc.CreatedAt
                FROM TB_CONTROL_COMPANIAS cc
                LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE (
                    (cc.UsuarioId = @choferId AND cc.Estado IN ('EN VIA', 'EN_TRANSITO', 'PENDIENTE'))
                    " + (controlRutaId.HasValue && controlRutaId.Value > 0 ? " OR (cc.ControlRutaId = @controlRutaId AND cc.Estado IN ('EN VIA', 'EN_TRANSITO', 'PENDIENTE')) " : "") + @"
                )
                ORDER BY cc.Id ASC";

            return await connection.QueryAsync<ControlCompaniaDto>(query, new { choferId, controlRutaId });
        }

        public async Task<long> CrearDespachoAsync(CrearControlCompaniaDto dto, int creadoPor)
        {
            using var connection = new SqlConnection(_connectionString);
            var fecha = dto.Fecha ?? DateTime.Today;

            if (dto.UsuarioId <= 0 && dto.CamionId.HasValue && dto.CamionId.Value > 0)
            {
                dto.UsuarioId = await connection.ExecuteScalarAsync<int>(
                    "SELECT TOP 1 ISNULL(UsuarioId, 0) FROM TB_CAMIONES WHERE Id = @camionId",
                    new { camionId = dto.CamionId.Value });
            }

            if (dto.UsuarioId <= 0)
            {
                dto.UsuarioId = await connection.ExecuteScalarAsync<int>(
                    "SELECT TOP 1 Id FROM TB_USUARIOS WHERE UPPER(Rol) = 'CHOFER' AND Activo = 1 ORDER BY Id ASC");
            }

            if (dto.UsuarioId <= 0)
            {
                dto.UsuarioId = creadoPor;
            }

            // Buscar ciclo operativo vigente
            var cicloId = await connection.ExecuteScalarAsync<int?>(
                "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' AND @fecha BETWEEN FechaInicio AND FechaFin ORDER BY Id DESC",
                new { fecha });

            // Validación anti-duplicados para despachos a compañías (misma fecha, misma compañía y mismos litros despachados)
            var existeDuplicadoCC = await connection.ExecuteScalarAsync<long?>(
                @"SELECT TOP 1 Id 
                  FROM TB_CONTROL_COMPANIAS 
                  WHERE CAST(Fecha AS DATE) = CAST(@fecha AS DATE)
                    AND CompaniaId = @companiaId 
                    AND LitrosDespachados = @litrosDespachados
                    AND Estado <> 'CANCELADO'",
                new { fecha, companiaId = dto.CompaniaId, litrosDespachados = dto.LitrosDespachados });

            if (existeDuplicadoCC.HasValue)
            {
                throw new InvalidOperationException($"Ya existe el Ticket #{existeDuplicadoCC.Value} registrado el {fecha:dd/MM/yyyy} para esta compañía por {dto.LitrosDespachados:N0} Lts. Para modificar el conductor o datos, utiliza la opción 'Editar' del ticket existente.");
            }

            var tipoLeche = string.IsNullOrWhiteSpace(dto.TipoLeche) ? "VACA" : dto.TipoLeche.Trim().ToUpper();
            var observacionFinal = string.IsNullOrWhiteSpace(dto.NumeroGuiaSADA)
                ? dto.Observacion
                : (string.IsNullOrWhiteSpace(dto.Observacion) ? $"Guía SADA: {dto.NumeroGuiaSADA.Trim()}" : $"[SADA: {dto.NumeroGuiaSADA.Trim()}] {dto.Observacion}".Trim());

            var query = @"
                INSERT INTO TB_CONTROL_COMPANIAS 
                (Fecha, UsuarioId, CompaniaId, CicloId, LitrosDespachados, LitrosRecibidosCompania, DiferenciaLitros, PorcentajeMerma, Estado, TipoLeche, Observacion, FechaSalida, CreatedAt, CreatedBy)
                VALUES 
                (@fecha, @usuarioId, @companiaId, @cicloId, @litrosDespachados, NULL, 0, 0.00, 'EN VIA', @tipoLeche, @observacion, GETDATE(), GETDATE(), @creadoPor);
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

            var id = await connection.ExecuteScalarAsync<long>(query, new
            {
                fecha,
                usuarioId = dto.UsuarioId,
                companiaId = dto.CompaniaId,
                cicloId,
                litrosDespachados = dto.LitrosDespachados,
                tipoLeche,
                observacion = observacionFinal,
                creadoPor
            });

            // Notificación automática al chofer de salida a compañía
            if (id > 0 && dto.UsuarioId > 0)
            {
                try
                {
                    var compNombre = await connection.ExecuteScalarAsync<string>(
                        "SELECT Nombre FROM TB_COMPANIAS WHERE Id = @companiaId",
                        new { companiaId = dto.CompaniaId }) ?? "Compañía";

                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                        VALUES (@UsuarioId, 'SALIDA_COMPANIA', @Titulo, @Mensaje, @FechaOperativa, @ReferenciaId, 0, GETDATE())",
                        new
                        {
                            UsuarioId = dto.UsuarioId,
                            Titulo = "🏭 Salida a Compañía Asignada",
                            Mensaje = $"Tienes un traslado asignado a la compañía {compNombre} por {dto.LitrosDespachados:N0} Lts de leche {tipoLeche} para la fecha {fecha:dd/MM/yyyy}.",
                            FechaOperativa = fecha,
                            ReferenciaId = id
                        });
                }
                catch { /* Tolerante */ }
            }

            return id;
        }

        public async Task<bool> ValidarYFinalizarEntregaAsync(long id, ValidarEntregaCompaniaDto dto, int modificadoPor)
        {
            using var connection = new SqlConnection(_connectionString);
            var control = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT TOP 1 * FROM TB_CONTROL_COMPANIAS 
                  WHERE Id = @id OR ControlRutaId = @id 
                  ORDER BY CASE WHEN Id = @id THEN 1 ELSE 2 END, Id DESC", new { id });
            if (control == null) return false;
            long actualId = Convert.ToInt64(control.Id);
            id = actualId;

            int despachados = (int)(control.LitrosDespachados ?? 0);
            int recibidos = dto.Desgloses != null && dto.Desgloses.Count > 0 
                ? dto.Desgloses.Sum(d => d.LitrosRecibidos) 
                : (dto.LitrosRecibidosCompania > 0 
                    ? dto.LitrosRecibidosCompania 
                    : (dto.LitrosConfirmados.HasValue && dto.LitrosConfirmados.Value > 0 
                        ? dto.LitrosConfirmados.Value 
                        : (dto.Litros.HasValue && dto.Litros.Value > 0 ? dto.Litros.Value : despachados)));

            int diferencia = despachados - recibidos; // Falla
            decimal porcentaje = despachados > 0 ? Math.Round((decimal)diferencia / despachados * 100m, 2) : 0.00m;

            var cicloId = (int?)control.CicloId;
            if (!cicloId.HasValue || cicloId.Value <= 0)
            {
                cicloId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fecha BETWEEN FechaInicio AND FechaFin ORDER BY Id DESC",
                    new { fecha = (DateTime)control.Fecha });
                if (!cicloId.HasValue)
                {
                    cicloId = await connection.ExecuteScalarAsync<int?>("SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS ORDER BY Id DESC");
                }
            }

            // Manejo de desgloses multi-destino / tipo de leche (Búfala, Vaca, etc.)
            if (dto.Desgloses != null && dto.Desgloses.Count > 1)
            {
                var primer = dto.Desgloses[0];
                var tipoPrimer = !string.IsNullOrWhiteSpace(primer.TipoLeche)
                    ? primer.TipoLeche.Trim().ToUpper()
                    : (!string.IsNullOrWhiteSpace(control.TipoLeche) ? control.TipoLeche : "VACA");
                var tipoPrefix0 = !string.IsNullOrWhiteSpace(tipoPrimer) ? $"[{tipoPrimer}] " : "";
                var obsFinal0 = $"{tipoPrefix0}{control.Observacion} | {primer.Observacion ?? dto.Observacion}".Trim(' ', '|');

                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_COMPANIAS
                    SET CompaniaId = @companiaId,
                        LitrosDespachados = @litrosDespacho,
                        LitrosRecibidosCompania = @recibidos,
                        DiferenciaLitros = 0,
                        PorcentajeMerma = 0.00,
                        Estado = 'FINALIZADO',
                        TipoLeche = @tipoPrimer,
                        FechaEntrega = GETDATE(),
                        Observacion = @obsFinal,
                        FotoReciboUrl = ISNULL(@fotoReciboUrl, FotoReciboUrl),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @modificadoPor
                    WHERE Id = @id",
                    new { companiaId = primer.CompaniaId > 0 ? primer.CompaniaId : control.CompaniaId, litrosDespacho = primer.LitrosRecibidos, recibidos = primer.LitrosRecibidos, tipoPrimer, obsFinal = obsFinal0, fotoReciboUrl = dto.FotoReciboUrl, modificadoPor, id });

                // Registrar primera entrada en TB_ENTREGAS_COMPANIA
                if (cicloId.HasValue && cicloId.Value > 0)
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_ENTREGAS_COMPANIA 
                        (CicloId, CompaniaId, UsuarioId, Fecha, Litros, TipoLeche, Observacion, CreatedAt, CreatedBy)
                        VALUES 
                        (@cicloId, @companiaId, @usuarioId, @fecha, @litros, @tipoPrimer, @obs, GETDATE(), @modificadoPor);",
                        new
                        {
                            cicloId = cicloId.Value,
                            companiaId = primer.CompaniaId > 0 ? primer.CompaniaId : control.CompaniaId,
                            usuarioId = control.UsuarioId,
                            fecha = control.Fecha,
                            litros = primer.LitrosRecibidos,
                            tipoPrimer,
                            obs = $"Entrega #{id} {tipoPrefix0.Trim()}. {primer.Observacion ?? dto.Observacion}".Trim(),
                            modificadoPor
                        });
                }

                // Insertar tickets adicionales para los demás desgloses (ej: VACA, otra quesera)
                for (int i = 1; i < dto.Desgloses.Count; i++)
                {
                    var desg = dto.Desgloses[i];
                    if (desg.LitrosRecibidos <= 0) continue;

                    var tipoDesg = !string.IsNullOrWhiteSpace(desg.TipoLeche) ? desg.TipoLeche.Trim().ToUpper() : "VACA";
                    var tipoPrefix = !string.IsNullOrWhiteSpace(tipoDesg) ? $"[{tipoDesg}] " : "";
                    var obsExtra = $"{tipoPrefix}Desglose Ticket #{id} - {desg.Observacion ?? dto.Observacion}".Trim(' ', '|');
                    var targetCompId = desg.CompaniaId > 0 ? desg.CompaniaId : control.CompaniaId;

                    var extraId = await connection.ExecuteScalarAsync<long>(@"
                        INSERT INTO TB_CONTROL_COMPANIAS 
                        (Fecha, UsuarioId, CompaniaId, CicloId, LitrosDespachados, LitrosRecibidosCompania, DiferenciaLitros, PorcentajeMerma, Estado, TipoLeche, Observacion, ControlRutaId, FechaSalida, FechaEntrega, CreatedAt, CreatedBy, ModifiedAt, ModifiedBy)
                        VALUES 
                        (@fecha, @usuarioId, @companiaId, @cicloId, @litros, @litros, 0, 0.00, 'FINALIZADO', @tipoDesg, @obs, @controlRutaId, @fechaSalida, GETDATE(), GETDATE(), @modificadoPor, GETDATE(), @modificadoPor);
                        SELECT CAST(SCOPE_IDENTITY() AS BIGINT);",
                        new
                        {
                            fecha = control.Fecha,
                            usuarioId = control.UsuarioId,
                            companiaId = targetCompId,
                            cicloId = cicloId,
                            litros = desg.LitrosRecibidos,
                            tipoDesg,
                            obs = obsExtra,
                            controlRutaId = control.ControlRutaId,
                            fechaSalida = control.FechaSalida ?? control.Fecha,
                            modificadoPor
                        });

                    if (cicloId.HasValue && cicloId.Value > 0)
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_ENTREGAS_COMPANIA 
                            (CicloId, CompaniaId, UsuarioId, Fecha, Litros, TipoLeche, Observacion, CreatedAt, CreatedBy)
                            VALUES 
                            (@cicloId, @companiaId, @usuarioId, @fecha, @litros, @tipoDesg, @obs, GETDATE(), @modificadoPor);",
                            new
                            {
                                cicloId = cicloId.Value,
                                companiaId = targetCompId,
                                usuarioId = control.UsuarioId,
                                fecha = control.Fecha,
                                litros = desg.LitrosRecibidos,
                                tipoDesg,
                                obs = $"Entrega Desglose #{extraId} (Orig #{id}) {tipoPrefix.Trim()}. {desg.Observacion ?? dto.Observacion}".Trim(),
                                modificadoPor
                            });
                    }
                }

                return true;
            }

            // Desglose único o validación estándar
            var tipoFinal = !string.IsNullOrWhiteSpace(dto.TipoLeche)
                ? dto.TipoLeche.Trim().ToUpper()
                : (dto.Desgloses != null && dto.Desgloses.Count == 1 && !string.IsNullOrWhiteSpace(dto.Desgloses[0].TipoLeche)
                    ? dto.Desgloses[0].TipoLeche.Trim().ToUpper()
                    : (!string.IsNullOrWhiteSpace(control.TipoLeche) ? control.TipoLeche : "VACA"));

            var tipoUnico = !string.IsNullOrWhiteSpace(tipoFinal) ? $"[{tipoFinal}] " : "";

            var obsFinal = string.IsNullOrWhiteSpace(dto.Observacion) 
                ? $"{tipoUnico}{control.Observacion}".Trim() 
                : $"{tipoUnico}{control.Observacion} | {dto.Observacion}".Trim(' ', '|');

            int targetComp = dto.Desgloses != null && dto.Desgloses.Count == 1 && dto.Desgloses[0].CompaniaId > 0
                ? dto.Desgloses[0].CompaniaId
                : control.CompaniaId;

            var rows = await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_COMPANIAS
                SET CompaniaId = @targetComp,
                    LitrosRecibidosCompania = @recibidos,
                    DiferenciaLitros = @diferencia,
                    PorcentajeMerma = @porcentaje,
                    Estado = 'FINALIZADO',
                    TipoLeche = @tipoFinal,
                    FechaEntrega = GETDATE(),
                    Observacion = @obsFinal,
                    FotoReciboUrl = ISNULL(@fotoReciboUrl, FotoReciboUrl),
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @modificadoPor
                WHERE Id = @id",
                new { targetComp, recibidos, diferencia, porcentaje, tipoFinal, obsFinal, fotoReciboUrl = dto.FotoReciboUrl, modificadoPor, id });

            if (control.ControlRutaId != null)
            {
                try
                {
                    long cRutaId = Convert.ToInt64(control.ControlRutaId);
                    await connection.ExecuteAsync(@"
                        UPDATE TB_CONTROL_RUTAS
                        SET LitrosRecibidosReceptoria = @recibidos,
                            TotalLitrosReceptoria = @recibidos,
                            DiferenciaReceptoria = @diferencia,
                            DiferenciaLitros = @diferencia,
                            PorcentajeMerma = @porcentaje,
                            MermaTotalLitros = @diferencia,
                            ProcesoActualId = 4,
                            Estado = 'FINALIZADO',
                            FechaLlegadaReceptoria = ISNULL(FechaLlegadaReceptoria, GETDATE()),
                            ModifiedAt = GETDATE(),
                            ModifiedBy = @modificadoPor
                        WHERE Id = @cRutaId AND Estado != 'FINALIZADO';",
                        new { recibidos, diferencia, porcentaje, modificadoPor, cRutaId });
                }
                catch { /* Tolerante */ }
            }

            // Registrar / actualizar automáticamente en TB_ENTREGAS_COMPANIA para liquidaciones si existe un ciclo válido
            if (rows > 0 && cicloId.HasValue && cicloId.Value > 0)
            {
                try
                {
                    var compDestino = await connection.ExecuteScalarAsync<string>("SELECT Nombre FROM TB_COMPANIAS WHERE Id = @companiaId", new { companiaId = targetComp }) ?? "Compañía";
                    
                    // 1. Entrada a Compañía / Quesera (Positivo) con vinculación a ControlRutaId si aplica
                    var entregaExistenteId = await connection.ExecuteScalarAsync<long?>(
                        @"SELECT TOP 1 Id FROM TB_ENTREGAS_COMPANIA 
                          WHERE ControlCompaniaId = @id
                            OR (ControlRutaId = @cRutaId AND @cRutaId IS NOT NULL AND ControlCompaniaId IS NULL AND CompaniaId = @targetComp)
                            OR (
                                Observacion LIKE '%Control Compañías #' + CAST(@id AS VARCHAR) + '.%'
                                OR Observacion LIKE '%Control Companias #' + CAST(@id AS VARCHAR) + '.%'
                                OR Observacion LIKE '%Control Compañías #' + CAST(@id AS VARCHAR) + '%'
                                OR Observacion LIKE '%Control Companias #' + CAST(@id AS VARCHAR) + '%'
                                OR Observacion LIKE 'Entrega #' + CAST(@id AS VARCHAR) + ' %'
                                OR Observacion LIKE '%Orig #' + CAST(@id AS VARCHAR) + ')%'
                            )",
                        new { id, targetComp, cRutaId = (long?)control.ControlRutaId });

                    var obsEntrega = $"Entrega validada desde Control Compañías #{id}. Falla: {diferencia:+0;-0;0} L. {tipoUnico}{dto.Observacion}".Trim();

                    if (entregaExistenteId.HasValue)
                    {
                        await connection.ExecuteAsync(@"
                            UPDATE TB_ENTREGAS_COMPANIA
                            SET CompaniaId = @targetComp,
                                Litros = @recibidos,
                                TipoLeche = @tipoFinal,
                                Observacion = @obsEntrega,
                                ControlCompaniaId = @id,
                                ControlRutaId = @cRutaId,
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @modificadoPor
                            WHERE Id = @entregaId;",
                            new { targetComp, recibidos, tipoFinal, obsEntrega, id, cRutaId = (long?)control.ControlRutaId, modificadoPor, entregaId = entregaExistenteId.Value });
                    }
                    else
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_ENTREGAS_COMPANIA 
                            (CicloId, CompaniaId, UsuarioId, Fecha, Litros, TipoLeche, Observacion, ControlRutaId, ControlCompaniaId, CreatedAt, CreatedBy)
                            VALUES 
                            (@cicloId, @companiaId, @usuarioId, @fecha, @litros, @tipoFinal, @obs, @cRutaId, @id, GETDATE(), @modificadoPor);",
                            new
                            {
                                cicloId = cicloId.Value,
                                companiaId = targetComp,
                                usuarioId = (int)control.UsuarioId,
                                fecha = (DateTime)control.Fecha,
                                litros = recibidos,
                                tipoFinal,
                                obs = obsEntrega,
                                cRutaId = (long?)control.ControlRutaId,
                                id,
                                modificadoPor
                            });
                    }
                }
                catch
                {
                    // Evitar que un error auxiliar en liquidaciones bloquee el cierre del despacho
                }
            }

            // 2. Si este despacho proviene de un viaje de ruta (TB_CONTROL_RUTAS), sincronizar y finalizar automáticamente el viaje padre
            if (rows > 0 && control.ControlRutaId != null)
            {
                try
                {
                    long cRutaId = (long)control.ControlRutaId;
                    var despachosRuta = await connection.QueryAsync<dynamic>(
                        "SELECT Id, LitrosRecibidosCompania, Estado FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @cRutaId",
                        new { cRutaId });

                    bool todosFinalizados = despachosRuta.All(d => (string)d.Estado == "FINALIZADO");
                    int totalRecibidoRuta = despachosRuta.Sum(d => (int)(d.LitrosRecibidosCompania ?? 0));

                    var viajePadre = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT TotalLitrosFinca FROM TB_CONTROL_RUTAS WHERE Id = @cRutaId", new { cRutaId });
                    int totalFincas = (int)(viajePadre?.TotalLitrosFinca ?? 0);
                    int mermaRuta = totalFincas - totalRecibidoRuta;
                    string estadoRuta = todosFinalizados ? (mermaRuta == 0 ? "CUADRADO" : "FINALIZADO") : "RECEPCIONADO";
                    int procesoRuta = todosFinalizados ? 4 : 3;

                    await connection.ExecuteAsync(@"
                        UPDATE TB_CONTROL_RUTAS
                        SET CompaniaDestinoId = @targetComp,
                            LitrosEntregadosCompania = @totalRecibidoRuta,
                            TotalLitrosReceptoria = @totalRecibidoRuta,
                            DiferenciaLitros = @mermaRuta,
                            MermaTotalLitros = @mermaRuta,
                            ProcesoActualId = @procesoRuta,
                            Estado = @estadoRuta,
                            FechaEntregaCompania = GETDATE(),
                            ModifiedAt = GETDATE(),
                            ModifiedBy = @modificadoPor
                        WHERE Id = @cRutaId",
                        new { targetComp, totalRecibidoRuta, mermaRuta, procesoRuta, estadoRuta, modificadoPor, cRutaId });
                }
                catch
                {
                    // Registro silencioso si falla actualización secundaria
                }
            }

            return rows > 0;
        }

        public async Task<bool> EditarDespachoAsync(long id, EditarControlCompaniaDto dto, int modificadoPor)
        {
            using var connection = new SqlConnection(_connectionString);
            var control = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_CONTROL_COMPANIAS WHERE Id = @id", new { id });
            if (control == null) return false;

            DateTime fecha = dto.Fecha ?? (DateTime)control.Fecha;
            int choferId = dto.UsuarioId ?? (int)control.UsuarioId;
            int companiaId = dto.CompaniaId ?? (int)control.CompaniaId;
            int despachados = dto.LitrosDespachados ?? (int)control.LitrosDespachados;
            int? recibidos = dto.LitrosRecibidosCompania ?? (int?)control.LitrosRecibidosCompania;
            string estado = dto.Estado ?? (string)control.Estado;
            string? observacion = dto.Observacion ?? (string?)control.Observacion;
            string tipoLeche = !string.IsNullOrWhiteSpace(dto.TipoLeche)
                ? dto.TipoLeche.Trim().ToUpper()
                : (control.TipoLeche != null ? (string)control.TipoLeche : "VACA");

            int diferencia = 0;
            decimal porcentaje = 0.00m;
            if (recibidos.HasValue)
            {
                diferencia = despachados - recibidos.Value;
                porcentaje = despachados > 0 ? Math.Round((Math.Abs(diferencia) * 100.0m) / despachados, 2) : 0.00m;
            }

            var rows = await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_COMPANIAS
                SET Fecha = @fecha,
                    UsuarioId = @choferId,
                    CompaniaId = @companiaId,
                    LitrosDespachados = @despachados,
                    LitrosRecibidosCompania = @recibidos,
                    DiferenciaLitros = @diferencia,
                    PorcentajeMerma = @porcentaje,
                    Estado = @estado,
                    TipoLeche = @tipoLeche,
                    Observacion = @observacion,
                    FotoReciboUrl = ISNULL(@fotoReciboUrl, FotoReciboUrl),
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @modificadoPor
                WHERE Id = @id",
                new { fecha, choferId, companiaId, despachados, recibidos, diferencia, porcentaje, estado, tipoLeche, observacion, fotoReciboUrl = dto.FotoReciboUrl, modificadoPor, id });

            // Sincronizar SIEMPRE la fecha y datos en TB_ENTREGAS_COMPANIA si existe entrega vinculada
            if (rows > 0)
            {
                await connection.ExecuteAsync(@"
                    UPDATE TB_ENTREGAS_COMPANIA
                    SET Fecha = @fecha,
                        CompaniaId = @companiaId,
                        UsuarioId = @choferId,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @modificadoPor
                    WHERE ControlCompaniaId = @id",
                    new { fecha, companiaId, choferId, modificadoPor, id });
            }

            // Sincronizar viaje padre en TB_CONTROL_RUTAS si existe
            if (rows > 0 && control.ControlRutaId != null)
            {
                long cRutaId = (long)control.ControlRutaId;
                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET CompaniaDestinoId = @companiaId,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @modificadoPor
                    WHERE Id = @cRutaId",
                    new { companiaId, modificadoPor, cRutaId });
            }

            if (rows > 0 && recibidos.HasValue && estado == "FINALIZADO" && control.CicloId != null)
            {
                try
                {
                    int cicloId = (int)control.CicloId;
                    var tipoUnico = !string.IsNullOrWhiteSpace(tipoLeche) ? $"[{tipoLeche}] " : "";
                    var obsEntrega = $"Entrega validada desde Control Compañías #{id}. Falla: {diferencia:+0;-0;0} L. {tipoUnico}{observacion}".Trim();

                    // Lo entregado a la compañía son los litros recibidos por la planta (o despachados si aún no hay recepción)
                    int litrosEntrega = (recibidos.HasValue && recibidos.Value > 0) ? recibidos.Value : despachados;

                    var entregaExistenteId = await connection.ExecuteScalarAsync<int?>(
                        @"SELECT TOP 1 Id FROM TB_ENTREGAS_COMPANIA 
                          WHERE ControlCompaniaId = @id
                             OR (ControlRutaId = @cRutaId AND @cRutaId IS NOT NULL AND ControlCompaniaId IS NULL)
                             OR (
                                 Observacion LIKE '%Control Compañías #' + CAST(@id AS VARCHAR) + '%'
                                 OR Observacion LIKE '%Control Companias #' + CAST(@id AS VARCHAR) + '%'
                                 OR Observacion LIKE 'Entrega #' + CAST(@id AS VARCHAR) + ' %'
                                 OR Observacion LIKE '%Orig #' + CAST(@id AS VARCHAR) + ')%'
                             )",
                        new { id, cRutaId = (long?)control.ControlRutaId });

                    if (entregaExistenteId.HasValue)
                    {
                        await connection.ExecuteAsync(@"
                            UPDATE TB_ENTREGAS_COMPANIA
                            SET Litros = @litrosEntrega,
                                CompaniaId = @companiaId,
                                ControlCompaniaId = @id,
                                TipoLeche = @tipoLeche,
                                Observacion = @obsEntrega,
                                UsuarioId = @choferId,
                                Fecha = @fecha,
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @modificadoPor
                            WHERE Id = @entregaId;",
                            new { litrosEntrega, companiaId, id, tipoLeche, obsEntrega, choferId, fecha, modificadoPor, entregaId = entregaExistenteId.Value });
                    }
                    else
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_ENTREGAS_COMPANIA 
                            (CicloId, CompaniaId, UsuarioId, Fecha, Litros, TipoLeche, Observacion, ControlRutaId, ControlCompaniaId, CreatedAt, CreatedBy)
                            VALUES 
                            (@cicloId, @companiaId, @choferId, @fecha, @litrosEntrega, @tipoLeche, @obs, @cRutaId, @id, GETDATE(), @modificadoPor);",
                            new
                            {
                                cicloId,
                                companiaId,
                                choferId,
                                fecha,
                                litrosEntrega,
                                tipoLeche,
                                obs = obsEntrega,
                                cRutaId = (long?)control.ControlRutaId,
                                id,
                                modificadoPor
                            });
                    }

                    // Si proviene de un viaje de ruta (TB_CONTROL_RUTAS), sincronizar viaje padre
                    if (control.ControlRutaId != null)
                    {
                        long cRutaId = (long)control.ControlRutaId;
                        var despachosRuta = await connection.QueryAsync<dynamic>(
                            "SELECT Id, LitrosRecibidosCompania, Estado FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @cRutaId",
                            new { cRutaId });

                        bool todosFinalizados = despachosRuta.All(d => (string)d.Estado == "FINALIZADO");
                        int totalRecibidoRuta = despachosRuta.Sum(d => (int)(d.LitrosRecibidosCompania ?? 0));

                        var viajePadre = await connection.QueryFirstOrDefaultAsync<dynamic>(
                            "SELECT TotalLitrosFinca FROM TB_CONTROL_RUTAS WHERE Id = @cRutaId", new { cRutaId });
                        int totalFincas = (int)(viajePadre?.TotalLitrosFinca ?? 0);
                        int mermaRuta = totalFincas - totalRecibidoRuta;
                        string estadoRuta = todosFinalizados ? (mermaRuta == 0 ? "CUADRADO" : "FINALIZADO") : "RECEPCIONADO";
                        int procesoRuta = todosFinalizados ? 4 : 3;

                        await connection.ExecuteAsync(@"
                            UPDATE TB_CONTROL_RUTAS
                            SET LitrosEntregadosCompania = @totalRecibidoRuta,
                                TotalLitrosReceptoria = @totalRecibidoRuta,
                                DiferenciaLitros = @mermaRuta,
                                MermaTotalLitros = @mermaRuta,
                                ProcesoActualId = @procesoRuta,
                                Estado = @estadoRuta,
                                FechaEntregaCompania = GETDATE(),
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @modificadoPor
                            WHERE Id = @cRutaId",
                            new { totalRecibidoRuta, mermaRuta, procesoRuta, estadoRuta, modificadoPor, cRutaId });
                    }
                }
                catch
                {
                    // Evitar que un fallo auxiliar bloquee la edición del despacho
                }
            }

            return rows > 0;
        }

        public async Task<bool> EliminarDespachoAsync(long id, int modificadoPor)
        {
            using var connection = new SqlConnection(_connectionString);
            var despacho = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_CONTROL_COMPANIAS WHERE Id = @id", new { id });
            if (despacho != null)
            {
                int choferId = (int)despacho.UsuarioId;
                int companiaId = (int)despacho.CompaniaId;
                DateTime fecha = (DateTime)despacho.Fecha;
                await connection.ExecuteAsync(@"
                    DELETE FROM TB_ENTREGAS_COMPANIA 
                    WHERE ControlCompaniaId = @id
                       OR Observacion LIKE '%Control Compañías #' + CAST(@id AS VARCHAR) + '%'
                       OR Observacion LIKE '%Control Companias #' + CAST(@id AS VARCHAR) + '%'
                       OR (CompaniaId = @companiaId AND UsuarioId = @choferId AND CAST(Fecha AS DATE) = CAST(@fecha AS DATE))",
                    new { id, companiaId, choferId, fecha });
            }

            var rows = await connection.ExecuteAsync(
                "DELETE FROM TB_CONTROL_COMPANIAS WHERE Id = @id", new { id });
            return rows > 0;
        }

        public async Task<ResumenTrazabilidadBufalaDto> ObtenerTrazabilidadBufalaAsync(DateTime? fechaDesde, DateTime? fechaHasta, int? cicloId, int? fincaId, int? companiaId, int? usuarioId, string? tipoServicio = null)
        {
            using var connection = new SqlConnection(_connectionString);

            DateTime? fDesde = fechaDesde;
            DateTime? fHasta = fechaHasta;
            if (cicloId.HasValue && !fDesde.HasValue && !fHasta.HasValue)
            {
                var ciclo = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                    "SELECT TOP 1 FechaInicio, FechaFin FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloId", new { cicloId });
                if (ciclo != null)
                {
                    fDesde = ciclo.FechaInicio;
                    fHasta = ciclo.FechaFin;
                }
            }

            var sql = @"
                SELECT 
                    r.Id,
                    r.Fecha,
                    ISNULL(cr.CicloId, DATEDIFF(WEEK, DATEFROMPARTS(YEAR(r.Fecha), 1, 1), r.Fecha) + 1) AS CicloId,
                    f.Id AS FincaId,
                    f.Nombre AS FincaNombre,
                    ISNULL(f.Propietario, f.Nombre) AS Propietario,
                    ISNULL(f.TipoServicioId, CASE WHEN comp.TipoServicioId = 2 THEN 2 ELSE 1 END) AS TipoServicioId,
                    ISNULL(ts.Nombre, CASE WHEN f.TipoServicioId = 2 OR comp.TipoServicioId = 2 THEN 'TRANSPORTE' ELSE 'RUTA' END) AS TipoServicio,
                    r.Litros AS LitrosFinca,
                    r.EsAcida,
                    ISNULL(r.TipoLeche, 'BUFALA') AS TipoLeche,
                    r.UsuarioId,
                    u.NombreCompleto AS ChoferNombre,
                    cr.Id AS ControlRutaId,
                    cc.Id AS ControlCompaniaId,
                    cc.CompaniaId AS CompaniaId,
                    ISNULL(comp.Nombre, CASE WHEN cc.CompaniaId IS NOT NULL THEN 'Compañía #' + CAST(cc.CompaniaId AS VARCHAR) ELSE 'Sin Asignar' END) AS CompaniaNombre,
                    CASE WHEN cc.CompaniaId = 5028 OR comp.Nombre LIKE '%RECEPTORIA%' THEN 1 ELSE 0 END AS EsTanqueReceptoria,
                    (
                        SELECT STRING_AGG(c_sal.Nombre + ' (' + CAST(cc_sal.LitrosDespachados AS VARCHAR) + ' L)', ', ')
                        FROM TB_CONTROL_COMPANIAS cc_sal
                        JOIN TB_COMPANIAS c_sal ON cc_sal.CompaniaId = c_sal.Id
                        WHERE (cc_sal.ControlRutaId = cr.Id AND cc_sal.CompaniaId <> 5028)
                           OR (cc_sal.ControlRutaId IS NULL AND cc_sal.Fecha = r.Fecha AND c_sal.Id <> 5028)
                    ) AS DestinosFinales,
                    cc.LitrosDespachados AS LitrosDespachadosCompania,
                    cc.LitrosRecibidosCompania AS LitrosRecibidosCompania,
                    cc.DiferenciaLitros AS DiferenciaLitros,
                    cc.PorcentajeMerma AS PorcentajeMerma,
                    ISNULL(cc.Estado, ISNULL(cr.Estado, 'FINALIZADO')) AS EstadoViaje,
                    ISNULL(r.Observacion, cc.Observacion) AS Observacion
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                LEFT JOIN TB_TIPO_SERVICIO ts ON f.TipoServicioId = ts.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON r.ControlRutaId = cr.Id
                INNER JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                OUTER APPLY (
                    SELECT TOP 1 cc2.Id, cc2.CompaniaId, cc2.LitrosDespachados, cc2.LitrosRecibidosCompania, cc2.DiferenciaLitros, cc2.PorcentajeMerma, cc2.Estado, cc2.Observacion
                    FROM TB_CONTROL_COMPANIAS cc2
                    WHERE (cc2.ControlRutaId = cr.Id AND (cc2.TipoLeche = 'BUFALA' OR cc2.Observacion LIKE '%BUFAL%' OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc3 WHERE cc3.ControlRutaId = cr.Id AND cc3.TipoLeche = 'BUFALA')))
                       OR (cc2.ControlRutaId IS NULL AND cc2.UsuarioId = r.UsuarioId AND cc2.Fecha = r.Fecha AND (cc2.TipoLeche = 'BUFALA' OR cc2.Observacion LIKE '%BUFAL%'))
                    ORDER BY CASE WHEN cc2.TipoLeche = 'BUFALA' THEN 1 ELSE 2 END, cc2.Id DESC
                ) cc
                LEFT JOIN TB_COMPANIAS comp ON cc.CompaniaId = comp.Id
                WHERE (r.TipoLeche = 'BUFALA' OR f.Nombre LIKE '%BUFAL%' OR (f.TieneDosTiposLeche = 1 AND r.TipoLeche = 'BUFALA'))
                  AND (@fDesde IS NULL OR r.Fecha >= @fDesde)
                  AND (@fHasta IS NULL OR r.Fecha <= @fHasta)
                  AND (@cicloId IS NULL OR cr.CicloId = @cicloId OR (r.Fecha >= @fDesde AND r.Fecha <= @fHasta))
                  AND (@fincaId IS NULL OR f.Id = @fincaId)
                  AND (@companiaId IS NULL OR cc.CompaniaId = @companiaId)
                  AND (@usuarioId IS NULL OR r.UsuarioId = @usuarioId)
                  AND (@tipoServicio IS NULL OR @tipoServicio = '' OR @tipoServicio = 'TODOS' OR ISNULL(ts.Nombre, CASE WHEN f.TipoServicioId = 2 OR comp.TipoServicioId = 2 THEN 'TRANSPORTE' ELSE 'RUTA' END) = @tipoServicio)

                UNION ALL

                -- Entregas directas de Búfala a compañías registradas en TB_ENTREGAS_COMPANIA
                SELECT 
                    e.Id,
                    e.Fecha,
                    ISNULL(e.CicloId, ISNULL(cr.CicloId, DATEDIFF(WEEK, DATEFROMPARTS(YEAR(e.Fecha), 1, 1), e.Fecha) + 1)) AS CicloId,
                    0 AS FincaId,
                    'ENTREGA DIRECTA EN PLANTA' AS FincaNombre,
                    ISNULL(u.NombreCompleto, u.Username) AS Propietario,
                    1 AS TipoServicioId,
                    'RUTA' AS TipoServicio,
                    e.Litros AS LitrosFinca,
                    CAST(0 AS BIT) AS EsAcida,
                    'BUFALA' AS TipoLeche,
                    e.UsuarioId,
                    ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                    e.ControlRutaId AS ControlRutaId,
                    e.ControlCompaniaId AS ControlCompaniaId,
                    e.CompaniaId AS CompaniaId,
                    ISNULL(comp.Nombre, 'Compañía #' + CAST(e.CompaniaId AS VARCHAR)) AS CompaniaNombre,
                    0 AS EsTanqueReceptoria,
                    comp.Nombre + ' (' + CAST(e.Litros AS VARCHAR) + ' L)' AS DestinosFinales,
                    e.Litros AS LitrosDespachadosCompania,
                    e.Litros AS LitrosRecibidosCompania,
                    0 AS DiferenciaLitros,
                    0.00 AS PorcentajeMerma,
                    'FINALIZADO' AS EstadoViaje,
                    e.Observacion
                FROM TB_ENTREGAS_COMPANIA e
                LEFT JOIN TB_COMPANIAS comp ON e.CompaniaId = comp.Id
                LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON e.ControlRutaId = cr.Id
                WHERE e.TipoLeche = 'BUFALA'
                  AND (@fDesde IS NULL OR e.Fecha >= @fDesde)
                  AND (@fHasta IS NULL OR e.Fecha <= @fHasta)
                  AND (@cicloId IS NULL OR e.CicloId = @cicloId OR (e.Fecha >= @fDesde AND e.Fecha <= @fHasta))
                  AND (@fincaId IS NULL)
                  AND (@companiaId IS NULL OR e.CompaniaId = @companiaId)
                  AND (@usuarioId IS NULL OR e.UsuarioId = @usuarioId)
                  AND (@tipoServicio IS NULL OR @tipoServicio = '' OR @tipoServicio = 'TODOS' OR @tipoServicio = 'RUTA')
                  AND NOT EXISTS (
                      SELECT 1 FROM TB_RUTAS_RECOLECCION r2 
                      WHERE r2.ControlRutaId = e.ControlRutaId AND (r2.TipoLeche = 'BUFALA' OR EXISTS (SELECT 1 FROM TB_FINCAS f2 WHERE f2.Id = r2.FincaId AND f2.Nombre LIKE '%BUFAL%'))
                  )

                ORDER BY Fecha DESC, Id DESC";

            var list = (await connection.QueryAsync<TrazabilidadBufalaItemDto>(sql, new
            {
                fDesde,
                fHasta,
                cicloId,
                fincaId,
                companiaId,
                usuarioId,
                tipoServicio
            })).ToList();

            var totalFincas = list.Sum(x => x.LitrosFinca);
            var totalLitrosRuta = list.Where(x => (x.TipoServicio ?? "RUTA").ToUpper() == "RUTA").Sum(x => x.LitrosFinca);
            var totalLitrosTransporte = list.Where(x => (x.TipoServicio ?? "RUTA").ToUpper() == "TRANSPORTE").Sum(x => x.LitrosFinca);
            
            // Total entregado consolidado por viaje/despacho para no duplicar sumas si varias fincas van al mismo ticket de entrega
            var despachosConControl = list
                .Where(x => x.ControlCompaniaId.HasValue && x.LitrosRecibidosCompania.HasValue)
                .GroupBy(x => x.ControlCompaniaId!.Value)
                .Select(g => g.First())
                .ToList();

            var entregasDirectas = list
                .Where(x => !x.ControlCompaniaId.HasValue && x.LitrosRecibidosCompania.HasValue)
                .ToList();

            var despachosUnicos = despachosConControl.Concat(entregasDirectas).ToList();

            var totalLitrosTanques = despachosUnicos
                .Where(x => x.EsTanqueReceptoria || (x.CompaniaNombre != null && x.CompaniaNombre.ToUpper().Contains("RECEPTOR")))
                .Sum(x => x.LitrosRecibidosCompania ?? 0);

            var totalLitrosCompaniasDirectas = despachosUnicos
                .Where(x => !x.EsTanqueReceptoria && (x.CompaniaNombre == null || !x.CompaniaNombre.ToUpper().Contains("RECEPTOR")))
                .Sum(x => x.LitrosRecibidosCompania ?? 0);

            var totalCompaniasDirectasRuta = despachosUnicos
                .Where(x => !x.EsTanqueReceptoria && (x.CompaniaNombre == null || !x.CompaniaNombre.ToUpper().Contains("RECEPTOR")) && (x.TipoServicio ?? "RUTA").ToUpper() == "RUTA")
                .Sum(x => x.LitrosRecibidosCompania ?? 0);

            var totalCompaniasDirectasTransporte = despachosUnicos
                .Where(x => !x.EsTanqueReceptoria && (x.CompaniaNombre == null || !x.CompaniaNombre.ToUpper().Contains("RECEPTOR")) && (x.TipoServicio ?? "RUTA").ToUpper() == "TRANSPORTE")
                .Sum(x => x.LitrosRecibidosCompania ?? 0);

            var totalEntregado = despachosUnicos.Sum(x => x.LitrosRecibidosCompania ?? 0);
            if (totalEntregado == 0 && despachosUnicos.Count == 0)
            {
                // Fallback si no hay desgloses finales creados aún
                totalEntregado = totalFincas;
            }

            var totalEntregadosRuta = despachosUnicos.Where(x => (x.TipoServicio ?? "RUTA").ToUpper() == "RUTA").Sum(x => x.LitrosRecibidosCompania ?? 0);
            var totalEntregadosTransporte = despachosUnicos.Where(x => (x.TipoServicio ?? "RUTA").ToUpper() == "TRANSPORTE").Sum(x => x.LitrosRecibidosCompania ?? 0);

            var totalDif = totalFincas - totalEntregado;
            var pctMerma = totalFincas > 0 ? Math.Round((Math.Abs(totalDif) * 100.0m) / totalFincas, 2) : 0;

            var fincasActivas = list.Select(x => x.FincaId).Distinct().Count();
            var viajesCount = list.Where(x => x.ControlRutaId.HasValue).Select(x => x.ControlRutaId!.Value).Distinct().Count();
            var companiasCount = list.Where(x => x.CompaniaId.HasValue).Select(x => x.CompaniaId!.Value).Distinct().Count();

            return new ResumenTrazabilidadBufalaDto
            {
                TotalLitrosFincas = totalFincas,
                TotalLitrosRuta = totalLitrosRuta,
                TotalLitrosTransporte = totalLitrosTransporte,
                TotalLitrosEntregados = totalEntregado,
                TotalLitrosTanques = totalLitrosTanques,
                TotalLitrosCompaniasDirectas = totalLitrosCompaniasDirectas,
                TotalCompaniasDirectasRuta = totalCompaniasDirectasRuta,
                TotalCompaniasDirectasTransporte = totalCompaniasDirectasTransporte,
                TotalEntregadosRuta = totalEntregadosRuta,
                TotalEntregadosTransporte = totalEntregadosTransporte,
                TotalDiferenciaLitros = totalDif,
                PorcentajeMermaGlobal = pctMerma,
                CantidadFincasActivas = fincasActivas,
                CantidadViajes = viajesCount,
                CantidadCompaniasDestino = companiasCount,
                Detalle = list
            };
        }
    }

    // =========================================================================
    // INTERFACE & IMPLEMENTATION: INotificacionesRepository
    // =========================================================================
    public interface INotificacionesRepository
    {
        Task<IEnumerable<NotificacionMovilDto>> ObtenerMisNotificacionesAsync(int usuarioId, int limite = 30);
        Task<long> CrearNotificacionAsync(CrearNotificacionMovilDto dto);
        Task<bool> MarcarComoLeidaAsync(long id, int usuarioId);
        Task<bool> MarcarTodasComoLeidasAsync(int usuarioId);
        Task<bool> GuardarSuscripcionPushAsync(int usuarioId, SuscripcionPushDto dto);
        Task EnviarWebPushAsync(int usuarioId, string titulo, string mensaje, string? url = "/movil");
    }

    public class NotificacionesRepository : INotificacionesRepository
    {
        private readonly string _connectionString;
        private readonly Transporte.Core.Interfaces.ITenantService? _tenantService;
        private static bool _tableEnsured = false;

        public NotificacionesRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _tenantService = tenantService;
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE")!;
        }

        private IDbConnection CreateConnection()
        {
            var connStr = _tenantService?.GetConnectionString() ?? _connectionString;
            return new SqlConnection(connStr);
        }

        private async Task EnsureTableAsync(IDbConnection connection)
        {
            if (_tableEnsured) return;
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
                    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TB_PUSH_SUBSCRIPTIONS')
                    BEGIN
                        CREATE TABLE TB_PUSH_SUBSCRIPTIONS (
                            Id INT IDENTITY(1,1) PRIMARY KEY,
                            UsuarioId INT NOT NULL,
                            Endpoint NVARCHAR(MAX) NOT NULL,
                            P256dh NVARCHAR(500) NOT NULL,
                            Auth NVARCHAR(500) NOT NULL,
                            UserAgent NVARCHAR(500) NULL,
                            Activo BIT NOT NULL DEFAULT 1,
                            CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                            UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
                        );
                        CREATE INDEX IX_TB_PUSH_SUBSCRIPTIONS_UsuarioId ON TB_PUSH_SUBSCRIPTIONS(UsuarioId, Activo);
                    END";
                await connection.ExecuteAsync(sql);
                _tableEnsured = true;
            }
            catch { /* Tolerante */ }
        }

        public async Task<IEnumerable<NotificacionMovilDto>> ObtenerMisNotificacionesAsync(int usuarioId, int limite = 30)
        {
            using var connection = CreateConnection();
            await EnsureTableAsync(connection);
            var sql = @"
                SELECT TOP (@limite)
                    Id, UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt
                FROM TB_NOTIFICACIONES_MOVIL
                WHERE UsuarioId = @usuarioId
                ORDER BY CreatedAt DESC, Id DESC";

            return await connection.QueryAsync<NotificacionMovilDto>(sql, new { usuarioId, limite });
        }

        public async Task<long> CrearNotificacionAsync(CrearNotificacionMovilDto dto)
        {
            using var connection = CreateConnection();
            await EnsureTableAsync(connection);
            var sql = @"
                INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                VALUES (@UsuarioId, @Tipo, @Titulo, @Mensaje, @FechaOperativa, @ReferenciaId, 0, GETDATE());
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

            var id = await connection.ExecuteScalarAsync<long>(sql, dto);

            // Disparar WebPush a nivel de sistema operativo para pantalla apagada / segundo plano
            _ = Task.Run(() => EnviarWebPushAsync(dto.UsuarioId, dto.Titulo, dto.Mensaje));

            return id;
        }

        public async Task<bool> MarcarComoLeidaAsync(long id, int usuarioId)
        {
            using var connection = CreateConnection();
            await EnsureTableAsync(connection);
            var sql = "UPDATE TB_NOTIFICACIONES_MOVIL SET Leido = 1 WHERE Id = @id AND UsuarioId = @usuarioId";
            var rows = await connection.ExecuteAsync(sql, new { id, usuarioId });
            return rows > 0;
        }

        public async Task<bool> MarcarTodasComoLeidasAsync(int usuarioId)
        {
            using var connection = CreateConnection();
            await EnsureTableAsync(connection);
            var sql = "UPDATE TB_NOTIFICACIONES_MOVIL SET Leido = 1 WHERE UsuarioId = @usuarioId AND Leido = 0";
            var rows = await connection.ExecuteAsync(sql, new { usuarioId });
            return rows > 0;
        }

        public async Task<bool> GuardarSuscripcionPushAsync(int usuarioId, SuscripcionPushDto dto)
        {
            using var connection = CreateConnection();
            await EnsureTableAsync(connection);
            var sql = @"
                IF EXISTS (SELECT 1 FROM TB_PUSH_SUBSCRIPTIONS WHERE Endpoint = @Endpoint)
                BEGIN
                    UPDATE TB_PUSH_SUBSCRIPTIONS 
                    SET UsuarioId = @usuarioId, P256dh = @P256dh, Auth = @Auth, UserAgent = @UserAgent, Activo = 1, UpdatedAt = GETDATE()
                    WHERE Endpoint = @Endpoint;
                END
                ELSE
                BEGIN
                    INSERT INTO TB_PUSH_SUBSCRIPTIONS (UsuarioId, Endpoint, P256dh, Auth, UserAgent, Activo, CreatedAt, UpdatedAt)
                    VALUES (@usuarioId, @Endpoint, @P256dh, @Auth, @UserAgent, 1, GETDATE(), GETDATE());
                END";

            var rows = await connection.ExecuteAsync(sql, new
            {
                usuarioId,
                dto.Endpoint,
                dto.P256dh,
                dto.Auth,
                dto.UserAgent
            });
            return rows > 0;
        }

        public async Task EnviarWebPushAsync(int usuarioId, string titulo, string mensaje, string? url = "/movil")
        {
            try
            {
                using var connection = CreateConnection();
                await EnsureTableAsync(connection);
                var sql = "SELECT Endpoint, P256dh, Auth FROM TB_PUSH_SUBSCRIPTIONS WHERE UsuarioId = @usuarioId AND Activo = 1";
                var subs = (await connection.QueryAsync<dynamic>(sql, new { usuarioId })).ToList();
                if (subs.Count == 0) return;

                var vapidSubject = "mailto:admin@transporte-app.com";
                var vapidPublicKey = "BLaD6DOWHSNTZ2TVY91CnRLuOCb8p9NpUv4AGslQ_Cp1vg3oiHA7MIR-qF74ZxzkHKp1ucbg2kVMU61S4IpxRHo";
                var vapidPrivateKey = "ZDe2FHrKmgH8Gk6ijr0FsWmWdQrAqC2LqaQ3K7gSI98";
                var vapidDetails = new WebPush.VapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
                var client = new WebPush.WebPushClient();

                var payload = System.Text.Json.JsonSerializer.Serialize(new
                {
                    titulo,
                    mensaje,
                    url = url ?? "/movil",
                    id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });

                foreach (var s in subs)
                {
                    try
                    {
                        var sub = new WebPush.PushSubscription((string)s.Endpoint, (string)s.P256dh, (string)s.Auth);
                        await client.SendNotificationAsync(sub, payload, vapidDetails);
                    }
                    catch (WebPush.WebPushException ex)
                    {
                        if (ex.StatusCode == System.Net.HttpStatusCode.Gone || ex.StatusCode == System.Net.HttpStatusCode.NotFound)
                        {
                            await connection.ExecuteAsync("UPDATE TB_PUSH_SUBSCRIPTIONS SET Activo = 0, UpdatedAt = GETDATE() WHERE Endpoint = @endpoint", new { endpoint = (string)s.Endpoint });
                        }
                    }
                    catch { /* No interrumpir ciclo de notificaciones */ }
                }
            }
            catch { /* Tolerante */ }
        }
    }
}

