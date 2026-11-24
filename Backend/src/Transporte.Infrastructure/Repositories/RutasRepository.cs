using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

namespace Transporte.Infrastructure.Repositories
{
    public interface IRutasRepository
    {
        Task<IEnumerable<RutaItemDto>> ObtenerRutasHoyAsync(int usuarioId, string rol, DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, int? cicloId = null);
        Task<int> RegistrarRutaAsync(RegistrarRutaDto dto, int conductorId, string rol = "CHOFER");
        Task<IEnumerable<int>> RegistrarRutasMasivoAsync(RegistrarRutasMasivoDto dto, int conductorId, string rol = "CHOFER");
        Task<bool> ModificarLitrosAsync(int rutaId, int nuevosLitros, int usuarioId, string rol);
        Task<bool> EditarRutaAsync(int rutaId, EditarRutaDto dto, int usuarioId, string rol);
        Task<bool> EliminarRutaAsync(int rutaId, int usuarioId, string rol);
        Task<bool> LimpiarRecoleccionAsync(long rutaId, int usuarioId, string rol);
        Task<bool> DiferirLitrosAsync(long rutaId, int litrosDiferir, int? cicloDestinoId, string? motivo, int usuarioId, string rol, DateTime? fechaDestino = null);
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
                    r.FotosEvidenciaJson AS FotosEvidenciaJson,
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
            if (!string.IsNullOrWhiteSpace(dto.UuidLocal))
            {
                var existenteId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_RUTAS_RECOLECCION WHERE UuidLocal = @uuid",
                    new { uuid = dto.UuidLocal.Trim() });
                if (existenteId.HasValue && existenteId.Value > 0)
                {
                    return existenteId.Value;
                }
            }
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
                        VALUES (@ticketId, 1, GETDATE(), @choferEfectivo, 'Apertura automÃ¡tica de viaje al registrar recolecciÃ³n');",
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
                        throw new InvalidOperationException("El ticket del dÃ­a ya fue recibido o finalizado. El chofer no puede registrar mÃ¡s recolecciones.");
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
                            VALUES (@ticketId, 1, GETDATE(), @choferEfectivo, 'Apertura automÃ¡tica de viaje al registrar lote de recolecciones');",
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

                    // Auto-registro de fincas si no vienen con Id pero sÃ­ con un nombre nuevo confirmado
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
                            ? "Entrega y recepciÃ³n registrada mediante Carga Masiva (Hoja de ruta fÃ­sica)."
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
                        throw new InvalidOperationException("No se puede editar una recolecciÃ³n de un viaje recibido, entregado o cerrado.");
                }
                else if (fechaActual.Date < DateTime.Today.AddDays(-7))
                {
                    throw new UnauthorizedAccessException("Solo puedes editar registros recientes o con viaje abierto.");
                }
            }

            DateTime fechaFinal = dto.Fecha?.Date ?? fechaActual;
            int litrosFinal = dto.Litros ?? dto.NuevosLitros ?? (int)ruta.Litros;
            int fincaFinal = dto.FincaId ?? (int)ruta.FincaId;
            var rUp = (rol ?? string.Empty).Trim().ToUpperInvariant();
            bool esAdminRut = rUp == "ADMIN" || rUp == "SUPERADMIN" || rUp == "SUPER_ADMIN" || rUp == "ADMINISTRADOR";
            int conductorFinal = (esAdminRut && dto.ConductorId.HasValue && dto.ConductorId.Value > 0)
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

            int? cicloLiquidacionFinal = (int?)ruta.CicloLiquidacionId;
            if (dto.EsDiferido.HasValue)
            {
                if (dto.EsDiferido.Value)
                {
                    if (!cicloLiquidacionFinal.HasValue || cicloLiquidacionFinal.Value <= 0)
                    {
                        int sig = await ResolveSiguienteCicloAsync(connection, (int)ruta.CicloId);
                        cicloLiquidacionFinal = sig > 0 ? sig : (int?)null;
                    }
                }
                else
                {
                    cicloLiquidacionFinal = null;
                }
            }

            var sql = @"
                UPDATE TB_RUTAS_RECOLECCION 
                SET Litros = @litrosFinal,
                    FincaId = @fincaFinal,
                    UsuarioId = @conductorFinal,
                    Fecha = @fechaFinal,
                    EsAcida = @esAcidaFinal,
                    EsDiferido = @esDiferidoFinal,
                    CicloLiquidacionId = @cicloLiquidacionFinal,
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
                cicloLiquidacionFinal,
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
                        throw new InvalidOperationException("No se puede eliminar una recolecciÃ³n de un viaje recibido, entregado o cerrado.");
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

            // Resetear informaciÃ³n de recolecciÃ³n manteniendo la asignaciÃ³n de la finca en el ticket
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
                            VALUES (@chofId, 'RECOLECCION_RESETEADA', 'ðŸ”„ Parada Marcada como Pendiente', @msg, GETDATE(), @tId, 0, GETDATE())",
                            new { 
                                chofId, 
                                tId, 
                                msg = $"La informaciÃ³n de \"{fincaNom}\" fue limpiada y colocada como NO RECOGIDA para tu recorrido en el Ticket #{tId}." 
                            });
                    }
                    catch { /* Tolerante */ }
                }
            }

            return true;
        }

        internal static async Task<int> ResolveSiguienteCicloAsync(SqlConnection connection, int cicloActualId, System.Data.IDbTransaction? tx = null)
        {
            int destinoCiclo = 0;
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
            return destinoCiclo;
        }

        public async Task<bool> DiferirLitrosAsync(long rutaId, int litrosDiferir, int? cicloDestinoId, string? motivo, int usuarioId, string rol, DateTime? fechaDestino = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var tx = connection.BeginTransaction();

            var original = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT * FROM TB_RUTAS_RECOLECCION WHERE Id = @rutaId",
                new { rutaId }, tx);

            if (original == null)
                throw new InvalidOperationException("No se encontrÃ³ la recolecciÃ³n especificada.");

            int litrosActuales = (int)original.Litros;
            if (litrosDiferir <= 0 || litrosDiferir > litrosActuales)
                throw new InvalidOperationException($"Los litros a diferir deben ser mayores a 0 y menores o iguales a los litros actuales ({litrosActuales} L).");

            int cicloActualId = (int)original.CicloId;
            int destinoCiclo = cicloDestinoId ?? 0;

            if (destinoCiclo <= 0)
            {
                destinoCiclo = await ResolveSiguienteCicloAsync(connection, cicloActualId, tx);
            }

            if (destinoCiclo <= 0)
                throw new InvalidOperationException("No se encontrÃ³ el siguiente ciclo operativo para diferir los litros.");

            int litrosRestantes = litrosActuales - litrosDiferir;
            int litrosOrig = (int?)original.LitrosOriginales ?? litrosActuales;
            string notaOriginal = (string)original.Observacion ?? "";
            string motivoStr = string.IsNullOrWhiteSpace(motivo) ? "Solicitud del productor" : motivo.Trim();

            string obsPadre = $"{notaOriginal} [Diferido: {litrosDiferir} L para Sem. {destinoCiclo} ({motivoStr})]".Trim();
            string obsHijo = $"[Traspaso diferido de Sem. {cicloActualId}: {litrosDiferir} L ({motivoStr})]".Trim();

            DateTime fechaLiquidacion = fechaDestino?.Date ?? DateTime.MinValue;
            if (fechaLiquidacion == DateTime.MinValue && !string.IsNullOrWhiteSpace(motivo))
            {
                var matchFecha = System.Text.RegularExpressions.Regex.Match(motivo, @"Diferido al (\d{4}-\d{2}-\d{2})");
                if (matchFecha.Success && DateTime.TryParse(matchFecha.Groups[1].Value, out var parsedFecha))
                {
                    fechaLiquidacion = parsedFecha.Date;
                }
            }
            if (fechaLiquidacion == DateTime.MinValue)
            {
                var fechaInicioCiclo = await connection.QueryFirstOrDefaultAsync<DateTime?>(
                    @"SELECT FechaInicio FROM TB_CICLOS_OPERATIVOS WHERE Id = @destinoCiclo",
                    new { destinoCiclo }, tx);
                fechaLiquidacion = fechaInicioCiclo?.Date ?? ((DateTime)original.Fecha).Date;
            }

            if (litrosRestantes == 0)
            {
                // Diferimiento total: marcar el registro completo para el ciclo y fecha destino sin crear registro hijo en 0 L
                await connection.ExecuteAsync(@"
                    UPDATE TB_RUTAS_RECOLECCION
                    SET EsDiferido = 1,
                        Fecha = @fechaLiquidacion,
                        CicloLiquidacionId = @destinoCiclo,
                        LitrosOriginales = @litrosOrig,
                        Observacion = @obsPadre,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @rutaId",
                    new { fechaLiquidacion, destinoCiclo, litrosOrig, obsPadre, usuarioId, rutaId }, tx);
            }
            else
            {
                // Diferimiento parcial: actualizar registro original y crear registro hijo diferido con la fecha destino
                await connection.ExecuteAsync(@"
                    UPDATE TB_RUTAS_RECOLECCION 
                    SET Litros = @litrosRestantes,
                        LitrosOriginales = @litrosOrig,
                        Observacion = @obsPadre,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @rutaId",
                    new { litrosRestantes, litrosOrig, obsPadre, usuarioId, rutaId }, tx);

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
                        CicloId = cicloActualId, // Mantiene el ciclo fÃ­sico de la ruta
                        Fecha = fechaLiquidacion,
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
            }

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
                throw new InvalidOperationException("No se encontrÃ³ la recolecciÃ³n.");

            // Caso 1: diferimiento total marcado directamente en el registro (sin registro hijo)
            if (reg.RecoleccionOrigenId == null && (bool)(reg.EsDiferido ?? false))
            {
                var hijosDirectos = (await connection.QueryAsync<dynamic>(
                    @"SELECT * FROM TB_RUTAS_RECOLECCION WHERE RecoleccionOrigenId = @rutaId",
                    new { rutaId }, tx)).ToList();

                if (!hijosDirectos.Any())
                {
                    string obsLimpiaDirecto = (string)reg.Observacion ?? "";
                    int idxDif = obsLimpiaDirecto.IndexOf("[Diferido:", StringComparison.OrdinalIgnoreCase);
                    if (idxDif >= 0)
                        obsLimpiaDirecto = obsLimpiaDirecto.Substring(0, idxDif).Trim();

                    await connection.ExecuteAsync(@"
                        UPDATE TB_RUTAS_RECOLECCION
                        SET EsDiferido = 0,
                            CicloLiquidacionId = NULL,
                            LitrosOriginales = NULL,
                            Observacion = @obsLimpiaDirecto,
                            ModifiedAt = GETDATE(),
                            ModifiedBy = @usuarioId
                        WHERE Id = @rutaId",
                        new { obsLimpiaDirecto, usuarioId, rutaId }, tx);

                    tx.Commit();
                    return true;
                }
            }

            long padreId = reg.RecoleccionOrigenId != null
                ? (long)reg.RecoleccionOrigenId
                : rutaId;

            var padre = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT * FROM TB_RUTAS_RECOLECCION WHERE Id = @padreId",
                new { padreId }, tx);

            if (padre == null)
                throw new InvalidOperationException("No se encontrÃ³ la recolecciÃ³n original.");

            // Sumar los litros de los registros hijos diferidos
            var hijos = (await connection.QueryAsync<dynamic>(
                @"SELECT * FROM TB_RUTAS_RECOLECCION WHERE RecoleccionOrigenId = @padreId",
                new { padreId }, tx)).ToList();

            if (!hijos.Any())
                throw new InvalidOperationException("No hay registros diferidos asociados a esta recolecciÃ³n.");

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

}
