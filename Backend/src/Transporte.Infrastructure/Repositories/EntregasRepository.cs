using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

namespace Transporte.Infrastructure.Repositories
{
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
        Task<long> CrearEntradaTerceroAsync(CrearEntradaTerceroDto dto, int receptorUserId);
        Task<bool> EditarEntradaTerceroAsync(long controlRutaId, CrearEntradaTerceroDto dto, int receptorUserId);
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
                        WHEN e.ControlCompaniaId IS NOT NULL OR e.Observacion LIKE '%Control CompaÃ±Ã­as #%' THEN 0
                        WHEN e.UsuarioId = @usuarioId AND CAST(e.Fecha AS DATE) = CAST(DATEADD(hour, -4, GETUTCDATE()) AS DATE)
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
                           e.Observacion LIKE '%Control CompaÃ±Ã­as #' + CAST(cc2.Id AS VARCHAR) + '.%'
                           OR e.Observacion LIKE '%Control Companias #' + CAST(cc2.Id AS VARCHAR) + '.%'
                           OR e.Observacion LIKE '%Control CompaÃ±Ã­as #' + CAST(cc2.Id AS VARCHAR) + '%'
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
                    throw new InvalidOperationException("El ticket del dÃ­a ya fue recibido o finalizado. El chofer no puede registrar entregas.");
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

            // ValidaciÃ³n anti-duplicados (mismo chofer, misma compaÃ±Ã­a, misma fecha y mismos litros)
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
                throw new InvalidOperationException($"Ya existe una entrega registrada el {fechaEntrega:dd/MM/yyyy} para la compaÃ±Ã­a seleccionada por un monto de {dto.Litros:N0} Lts.");
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
                    throw new UnauthorizedAccessException("Solo puedes editar entregas registradas el dÃ­a de hoy.");
            }

            DateTime fechaFinal = dto.Fecha?.Date ?? fechaActual;
            int litrosFinal = dto.Litros ?? (int)entrega.Litros;
            int companiaFinal = dto.CompaniaId ?? (int)entrega.CompaniaId;
            var rUp = (rol ?? string.Empty).Trim().ToUpperInvariant();
            bool esAdminEnt = rUp == "ADMIN" || rUp == "SUPERADMIN" || rUp == "SUPER_ADMIN" || rUp == "ADMINISTRADOR";
            int conductorFinal = (esAdminEnt && dto.ConductorId.HasValue && dto.ConductorId.Value > 0)
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
                    SET cr.LitrosRecibidosReceptoria = (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÃA%')),
                        cr.TotalLitrosReceptoria = (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÃA%')),
                        cr.DiferenciaReceptoria = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÃA%')),
                        cr.DiferenciaLitros = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÃA%')),
                        cr.MermaTotalLitros = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÃA%')),
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
                    throw new UnauthorizedAccessException("Solo puedes eliminar entregas registradas el dÃ­a de hoy.");
            }

            var rows = await connection.ExecuteAsync("DELETE FROM TB_ENTREGAS_COMPANIA WHERE Id = @entregaId", new { entregaId });

            if (rows > 0 && entrega.ControlRutaId != null)
            {
                long tId = (long)entrega.ControlRutaId;
                await connection.ExecuteAsync(@"
                    UPDATE cr
                    SET cr.LitrosRecibidosReceptoria = (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÃA%')),
                        cr.TotalLitrosReceptoria = (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÃA%')),
                        cr.DiferenciaReceptoria = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÃA%')),
                        cr.DiferenciaLitros = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÃA%')),
                        cr.MermaTotalLitros = cr.TotalLitrosFinca - (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id WHERE e.ControlRutaId = cr.Id AND (c.Nombre LIKE '%RECEPTORIA%' OR c.Nombre LIKE '%RECEPTORÃA%')),
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

            // 2. Consulta de RecolecciÃ³n en Fincas
            string whereFincas = cId > 0 ? "r.CicloId = @cId" : "r.Fecha >= @fInicio AND r.Fecha <= @fFin";
            result.TotalRecolectadoFincas = await connection.ExecuteScalarAsync<decimal>(
                $"SELECT ISNULL(SUM(r.Litros), 0) FROM TB_RUTAS_RECOLECCION r WHERE {whereFincas}",
                new { cId, fInicio, fFin });

            // 3. Consulta de Merma en Rutas (solo viajes recibidos/finalizados con descarga en receptorÃ­a)
            string whereRutas = cId > 0 ? "cr.CicloId = @cId" : "cr.Fecha >= @fInicio AND cr.Fecha <= @fFin";
            result.TotalMermaRuta = await connection.ExecuteScalarAsync<decimal>(
                $@"SELECT ISNULL(SUM(
                    CASE 
                        WHEN cr.ProcesoActualId >= 3 AND ISNULL(cr.TotalLitrosReceptoria, 0) > 0 
                            THEN cr.TotalLitrosFinca - cr.TotalLitrosReceptoria
                        ELSE 0 
                    END
                ), 0) FROM TB_CONTROL_RUTAS cr WHERE {whereRutas}",
                new { cId, fInicio, fFin });

            // 4. Consultar todas las entregas/movimientos unificados en el ciclo o periodo
            string whereEntregas = cId > 0 ? "e.CicloId = @cId" : "e.Fecha >= @fInicio AND e.Fecha <= @fFin";
            var rawEntregasSql = $@"
                SELECT 
                    e.Id,
                    e.Fecha,
                    e.CompaniaId,
                    c.Nombre AS CompaniaNombre,
                    ISNULL(c.EsPrincipal, 0) AS CompaniaEsPrincipal,
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
                    Conductor = "Inventario FÃ­sico",
                    CamionPlaca = "Tanques ReceptorÃ­a",
                    Origen = "Cierre Ciclo Anterior / MediciÃ³n",
                    Destino = "Tanques ReceptorÃ­a",
                    LitrosEntradaTanque = stockInicial,
                    LitrosSalidaTanque = 0m,
                    LitrosEntregaDirecta = 0m,
                    SaldoTanque = stockInicial,
                    Estado = "APERTURA",
                    Observacion = "Stock fÃ­sico de apertura presente en tanques al iniciar el ciclo operativo"
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

                bool compEsPrincipal = item.CompaniaEsPrincipal != null && Convert.ToBoolean(item.CompaniaEsPrincipal);
                bool esReceptoria = compEsPrincipal || compNombre.IndexOf("RECEPTORIA", StringComparison.OrdinalIgnoreCase) >= 0 || compNombre.IndexOf("RECEPTORÃA", StringComparison.OrdinalIgnoreCase) >= 0 || compNombre.IndexOf("PLANTA PRINCIPAL", StringComparison.OrdinalIgnoreCase) >= 0;

                int tipoProceso = 1;
                string tipoProcesoNombre = "Finca âž” ReceptorÃ­a";
                string origen = "Fincas de Ruta";
                string destino = "Tanques ReceptorÃ­a";
                decimal entradaTanque = 0m;
                decimal salidaTanque = 0m;
                decimal entregaDirecta = 0m;
                string ticketRef = "";
                decimal? litrosVerificados = null;
                decimal? difVerificacion = null;
                string? infoVerif = null;

                if (esReceptoria)
                {
                    // Ingreso a ReceptorÃ­a
                    bool tieneEntregaCompMismaRuta = cRutaId.HasValue && entregasRaw.Any(x => (long?)x.ControlRutaId == cRutaId && (int)x.CompaniaId != compId && !(x.CompaniaEsPrincipal != null && Convert.ToBoolean(x.CompaniaEsPrincipal)));

                    if (tieneEntregaCompMismaRuta)
                    {
                        tipoProceso = 2;
                        tipoProcesoNombre = "Finca âž” ReceptorÃ­a âž” CompaÃ±Ã­a";
                        ticketRef = $"Ruta/Paso #{cRutaId}";
                        destino = "ReceptorÃ­a (TrÃ¡nsito a CÃ­a)";
                        p2Count++;
                        p2Litros += litros;
                    }
                    else
                    {
                        tipoProceso = 1;
                        tipoProcesoNombre = "Finca âž” ReceptorÃ­a";
                        ticketRef = cRutaId.HasValue ? $"Ruta RecolecciÃ³n #{cRutaId}" : $"Descarga #{id}";
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
                    // Entrega a CompaÃ±Ã­a
                    destino = compNombre;

                    if (cRutaId.HasValue)
                    {
                        bool pasoPorReceptoria = entregasRaw.Any(x => (long?)x.ControlRutaId == cRutaId && ((x.CompaniaEsPrincipal != null && Convert.ToBoolean(x.CompaniaEsPrincipal)) || ((string)x.CompaniaNombre).IndexOf("RECEPTORIA", StringComparison.OrdinalIgnoreCase) >= 0));

                        if (pasoPorReceptoria)
                        {
                            tipoProceso = 2;
                            tipoProcesoNombre = "Finca âž” ReceptorÃ­a âž” CompaÃ±Ã­a";
                            ticketRef = $"Entrega en Ruta (VÃ­a ReceptorÃ­a) #{cRutaId}";
                            origen = "Ruta de CamiÃ³n (Paso ReceptorÃ­a)";
                            entregaDirecta = litros;
                            result.TotalEntregasDirectas += litros;
                            result.TotalComercializadoCompanias += litros;
                            p2Count++;
                            p2Litros += litros;
                        }
                        else
                        {
                            tipoProceso = 3;
                            tipoProcesoNombre = "Finca âž” CompaÃ±Ã­a";
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
                        tipoProcesoNombre = "ReceptorÃ­a âž” CompaÃ±Ã­a";
                        ticketRef = cCompId.HasValue ? $"Despacho Tanque #{cCompId}" : $"Despacho #{id}";
                        origen = "Tanques ReceptorÃ­a";

                        // Para salidas de tanque, la salida fÃ­sica de leche del tanque es siempre LitrosDespachados
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

                        // Datos de verificaciÃ³n en la planta compradora
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
                Nombre = "Finca âž” ReceptorÃ­a",
                Descripcion = "Leche recolectada descargada y almacenada fÃ­sicamente en tanques",
                TotalLitros = p1Litros,
                CantidadMovimientos = p1Count,
                PorcentajeDelTotal = Math.Round((p1Litros / totalOperado) * 100m, 2),
                ImpactoTanque = "SUMA (+)"
            };

            result.Proceso2_FincaReceptoriaCompania = new ResumenProcesoDto
            {
                TipoProceso = 2,
                Nombre = "Finca âž” ReceptorÃ­a âž” CompaÃ±Ã­a",
                Descripcion = "Leche en trÃ¡nsito que pasa por receptorÃ­a y se despacha a la compaÃ±Ã­a",
                TotalLitros = p2Litros,
                CantidadMovimientos = p2Count,
                PorcentajeDelTotal = Math.Round((p2Litros / totalOperado) * 100m, 2),
                ImpactoTanque = "TRÃNSITO (Entra/Sale)"
            };

            result.Proceso3_FincaCompania = new ResumenProcesoDto
            {
                TipoProceso = 3,
                Nombre = "Finca âž” CompaÃ±Ã­a",
                Descripcion = "Entregas directas en ruta desde fincas a plantas/queseras",
                TotalLitros = p3Litros,
                CantidadMovimientos = p3Count,
                PorcentajeDelTotal = Math.Round((p3Litros / totalOperado) * 100m, 2),
                ImpactoTanque = "NEUTRO (0 Lts en Tanque)"
            };

            result.Proceso4_ReceptoriaCompania = new ResumenProcesoDto
            {
                TipoProceso = 4,
                Nombre = "ReceptorÃ­a âž” CompaÃ±Ã­a",
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

        public async Task<long> CrearEntradaTerceroAsync(CrearEntradaTerceroDto dto, int receptorUserId)
        {
            if (dto.Litros <= 0)
                throw new ArgumentException("Los litros recibidos deben ser mayores a cero.");

            if ((!dto.FincaId.HasValue || dto.FincaId.Value <= 0) && string.IsNullOrWhiteSpace(dto.NuevaFincaNombre))
                throw new ArgumentException("Debe seleccionar una finca existente o ingresar el nombre de la nueva finca.");

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                DateTime fechaOp = dto.Fecha == default ? DateTime.Today : dto.Fecha.Date;
                string tipoLeche = string.IsNullOrWhiteSpace(dto.TipoLeche) ? "VACA" : dto.TipoLeche.Trim().ToUpper();

                // 1. Conductor fijo OTROS
                int? choferOtrosId = await connection.ExecuteScalarAsync<int?>(@"
                    SELECT TOP 1 Id FROM TB_USUARIOS
                    WHERE IsDeleted = 0 AND Activo = 1
                      AND (UPPER(Username) = 'OTROS.OTROS' OR UPPER(NombreCompleto) = 'OTROS')
                    ORDER BY Id ASC", transaction: transaction);
                int usuarioIdOtros = choferOtrosId ?? receptorUserId;

                // 2. ReceptorÃ­a Principal (EsPrincipal = 1)
                int? receptoriaId = await connection.ExecuteScalarAsync<int?>(@"
                    SELECT TOP 1 Id FROM TB_COMPANIAS
                    WHERE IsDeleted = 0 AND Activo = 1
                      AND (ISNULL(EsPrincipal, 0) = 1 OR UPPER(Nombre) LIKE '%RECEPTORIA%' OR UPPER(Nombre) LIKE '%RECEPTORÃA%' OR UPPER(Nombre) LIKE '%PLANTA PRINCIPAL%')
                    ORDER BY ISNULL(EsPrincipal, 0) DESC, Id ASC", transaction: transaction);
                if (!receptoriaId.HasValue)
                    throw new InvalidOperationException("No se encontrÃ³ una ReceptorÃ­a Principal configurada en TB_COMPANIAS.");

                // 3. Ciclo operativo para la fecha
                int? cicloId = await connection.ExecuteScalarAsync<int?>(@"
                    SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS
                    WHERE CAST(@fechaOp AS DATE) >= CAST(FechaInicio AS DATE)
                      AND CAST(@fechaOp AS DATE) <= CAST(FechaFin AS DATE)
                    ORDER BY Id DESC", new { fechaOp }, transaction: transaction);
                if (!cicloId.HasValue)
                {
                    cicloId = await connection.ExecuteScalarAsync<int?>(@"
                        SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS
                        WHERE Estado IN ('ABIERTO', 'ACTIVO', 'ACTIVA')
                        ORDER BY Id DESC", transaction: transaction);
                }
                int cicloFinal = cicloId ?? 1;

                // 4. Resolver o crear Finca
                int fincaId = dto.FincaId ?? 0;
                if (fincaId <= 0)
                {
                    string nombreNuevo = dto.NuevaFincaNombre!.Trim();
                    int? existenteId = await connection.ExecuteScalarAsync<int?>(@"
                        SELECT TOP 1 Id FROM TB_FINCAS
                        WHERE IsDeleted = 0 AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(@nombreNuevo)",
                        new { nombreNuevo }, transaction: transaction);

                    if (existenteId.HasValue && existenteId.Value > 0)
                    {
                        fincaId = existenteId.Value;
                    }
                    else
                    {
                        string prop = string.IsNullOrWhiteSpace(dto.NuevaFincaPropietario) ? nombreNuevo : dto.NuevaFincaPropietario.Trim();
                        decimal precioLitro = dto.NuevaFincaPrecioLitro.HasValue && dto.NuevaFincaPrecioLitro.Value >= 0
                            ? dto.NuevaFincaPrecioLitro.Value
                            : 0m;

                        fincaId = await connection.ExecuteScalarAsync<int>(@"
                            INSERT INTO TB_FINCAS
                            (Nombre, Propietario, PrecioLitroUSD, PrecioLitroAcidaUSD, TieneDosTiposLeche, TipoServicioId, Activo, IsDeleted, CreatedAt)
                            VALUES
                            (@nombreNuevo, @prop, @precioLitro, 0, 0, 1, 1, 0, GETDATE());
                            SELECT CAST(SCOPE_IDENTITY() AS INT);",
                            new { nombreNuevo, prop, precioLitro }, transaction: transaction);
                    }
                }

                string? obsUsuario = string.IsNullOrWhiteSpace(dto.Observacion)
                    ? null
                    : dto.Observacion.Replace("[ENTRADA TERCERO]", "").Trim();
                if (string.IsNullOrWhiteSpace(obsUsuario)) obsUsuario = null;

                string obsTexto = obsUsuario == null
                    ? "[ENTRADA TERCERO] Recepción directa en Receptoría"
                    : $"[ENTRADA TERCERO] {obsUsuario}";

                // 5. Crear Control de Viaje (queda EN_RECEPTORIA / Proceso 2 para poder editar o confirmar antes de pasar a FINALIZADO)
                long controlRutaId = await connection.ExecuteScalarAsync<long>(@"
                    INSERT INTO TB_CONTROL_RUTAS
                    (Fecha, UsuarioId, CicloId, TotalLitrosFinca, TotalLitrosReceptoria, LitrosRecibidosReceptoria,
                     DiferenciaLitros, DiferenciaReceptoria, MermaTotalLitros, PorcentajeMerma,
                     Estado, ProcesoActualId, TipoDestino, CompaniaDestinoId, FechaLlegadaReceptoria,
                     Observacion, CreatedAt)
                    VALUES
                    (@fechaOp, @usuarioIdOtros, @cicloFinal, @litros, 0, NULL,
                     0, 0, 0, 0,
                     'EN_RECEPTORIA', 2, 'RECEPTORIA', @receptoriaId, GETDATE(),
                     @obsTexto, GETDATE());
                    SELECT CAST(SCOPE_IDENTITY() AS BIGINT);",
                    new { fechaOp, usuarioIdOtros, cicloFinal, litros = dto.Litros, receptoriaId = receptoriaId.Value, obsTexto },
                    transaction: transaction);

                // 6. Registrar parada de finca para que entre en Liquidaciones y Reportes de Fincas
                //    (Observacion de la finca SOLO guarda texto ingresado por usuario/chofer, nunca tags de sistema)
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_RUTAS_RECOLECCION
                    (ControlRutaId, UsuarioId, FincaId, CicloId, Fecha, Litros, TipoLeche, EsAcida, EsDiferido, Observacion, CreatedAt)
                    VALUES
                    (@controlRutaId, @usuarioIdOtros, @fincaId, @cicloFinal, @fechaOp, @litros, @tipoLeche, 0, 0, @obsFinca, GETDATE());",
                    new { controlRutaId, usuarioIdOtros, fincaId, cicloFinal, fechaOp, litros = dto.Litros, tipoLeche, obsFinca = obsUsuario },
                    transaction: transaction);

                // 7. Registrar ingreso pendiente en TB_CONTROL_COMPANIAS hacia ReceptorÃ­a Principal (EN VIA hasta confirmar en silos)
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_CONTROL_COMPANIAS
                    (Fecha, UsuarioId, CompaniaId, CicloId, LitrosDespachados, LitrosRecibidosCompania,
                     DiferenciaLitros, PorcentajeMerma, Estado, TipoLeche, Observacion,
                     ControlRutaId, FechaSalida, CreatedAt, CreatedBy)
                    VALUES
                    (@fechaOp, @usuarioIdOtros, @receptoriaId, @cicloFinal, @litros, NULL,
                     0, 0, 'EN VIA', @tipoLeche, @obsTexto,
                     @controlRutaId, GETDATE(), GETDATE(), @receptorUserId);",
                    new { fechaOp, usuarioIdOtros, receptoriaId = receptoriaId.Value, cicloFinal, litros = dto.Litros, tipoLeche, obsTexto, controlRutaId, receptorUserId },
                    transaction: transaction);

                transaction.Commit();
                return controlRutaId;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> EditarEntradaTerceroAsync(long controlRutaId, CrearEntradaTerceroDto dto, int receptorUserId)
        {
            if (dto.Litros <= 0)
                throw new ArgumentException("Los litros recibidos deben ser mayores a cero.");

            if ((!dto.FincaId.HasValue || dto.FincaId.Value <= 0) && string.IsNullOrWhiteSpace(dto.NuevaFincaNombre))
                throw new ArgumentException("Debe seleccionar una finca existente o ingresar el nombre de la nueva finca.");

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var ticket = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT Id, Estado, ProcesoActualId FROM TB_CONTROL_RUTAS WHERE Id = @controlRutaId",
                    new { controlRutaId }, transaction: transaction);

                if (ticket == null)
                    throw new InvalidOperationException("El ticket de entrada no existe.");

                string estadoActual = ((string?)ticket.Estado ?? "").Trim().ToUpper();
                int procActual = (int)(ticket.ProcesoActualId ?? 1);
                if (estadoActual == "FINALIZADO" || estadoActual == "CERRADO" || procActual >= 4)
                    throw new InvalidOperationException("Este ticket ya fue confirmado/finalizado y no puede editarse.");

                DateTime fechaOp = dto.Fecha == default ? DateTime.Today : dto.Fecha.Date;
                string tipoLeche = string.IsNullOrWhiteSpace(dto.TipoLeche) ? "VACA" : dto.TipoLeche.Trim().ToUpper();

                int? cicloId = await connection.ExecuteScalarAsync<int?>(@"
                    SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS
                    WHERE CAST(@fechaOp AS DATE) >= CAST(FechaInicio AS DATE)
                      AND CAST(@fechaOp AS DATE) <= CAST(FechaFin AS DATE)
                    ORDER BY Id DESC", new { fechaOp }, transaction: transaction);
                if (!cicloId.HasValue)
                {
                    cicloId = await connection.ExecuteScalarAsync<int?>(@"
                        SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS
                        WHERE Estado IN ('ABIERTO', 'ACTIVO', 'ACTIVA')
                        ORDER BY Id DESC", transaction: transaction);
                }
                int cicloFinal = cicloId ?? 1;

                int fincaId = dto.FincaId ?? 0;
                if (fincaId <= 0)
                {
                    string nombreNuevo = dto.NuevaFincaNombre!.Trim();
                    int? existenteId = await connection.ExecuteScalarAsync<int?>(@"
                        SELECT TOP 1 Id FROM TB_FINCAS
                        WHERE IsDeleted = 0 AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(@nombreNuevo)",
                        new { nombreNuevo }, transaction: transaction);

                    if (existenteId.HasValue && existenteId.Value > 0)
                    {
                        fincaId = existenteId.Value;
                    }
                    else
                    {
                        string prop = string.IsNullOrWhiteSpace(dto.NuevaFincaPropietario) ? nombreNuevo : dto.NuevaFincaPropietario.Trim();
                        decimal precioLitro = dto.NuevaFincaPrecioLitro.HasValue && dto.NuevaFincaPrecioLitro.Value >= 0
                            ? dto.NuevaFincaPrecioLitro.Value
                            : 0m;

                        fincaId = await connection.ExecuteScalarAsync<int>(@"
                            INSERT INTO TB_FINCAS
                            (Nombre, Propietario, PrecioLitroUSD, PrecioLitroAcidaUSD, TieneDosTiposLeche, TipoServicioId, Activo, IsDeleted, CreatedAt)
                            VALUES
                            (@nombreNuevo, @prop, @precioLitro, 0, 0, 1, 1, 0, GETDATE());
                            SELECT CAST(SCOPE_IDENTITY() AS INT);",
                            new { nombreNuevo, prop, precioLitro }, transaction: transaction);
                    }
                }

                string obsLimpia = (dto.Observacion ?? "").Replace("[ENTRADA TERCERO]", "").Trim();
                string? obsFinca = string.IsNullOrWhiteSpace(obsLimpia) ? null : obsLimpia;
                string obsTexto = obsFinca == null
                    ? "[ENTRADA TERCERO] Recepción directa en Receptoría"
                    : $"[ENTRADA TERCERO] {obsFinca}";

                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_RUTAS
                    SET Fecha = @fechaOp,
                        CicloId = @cicloFinal,
                        TotalLitrosFinca = @litros,
                        Observacion = @obsTexto,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @receptorUserId
                    WHERE Id = @controlRutaId;",
                    new { fechaOp, cicloFinal, litros = dto.Litros, obsTexto, receptorUserId, controlRutaId },
                    transaction: transaction);

                await connection.ExecuteAsync(@"
                    UPDATE TB_RUTAS_RECOLECCION
                    SET FincaId = @fincaId,
                        CicloId = @cicloFinal,
                        Fecha = @fechaOp,
                        Litros = @litros,
                        TipoLeche = @tipoLeche,
                        Observacion = @obsFinca,
                        ModifiedAt = GETDATE()
                    WHERE ControlRutaId = @controlRutaId;",
                    new { fincaId, cicloFinal, fechaOp, litros = dto.Litros, tipoLeche, obsFinca, controlRutaId },
                    transaction: transaction);

                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_COMPANIAS
                    SET Fecha = @fechaOp,
                        CicloId = @cicloFinal,
                        LitrosDespachados = @litros,
                        TipoLeche = @tipoLeche,
                        Observacion = @obsTexto,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @receptorUserId
                    WHERE ControlRutaId = @controlRutaId;",
                    new { fechaOp, cicloFinal, litros = dto.Litros, tipoLeche, obsTexto, receptorUserId, controlRutaId },
                    transaction: transaction);

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }
    }

    // =========================================================================
    // REPOSITORIO DE REPORTES
    // =========================================================================

}
