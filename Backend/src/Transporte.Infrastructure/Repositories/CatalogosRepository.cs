using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

namespace Transporte.Infrastructure.Repositories
{
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
        Task<bool> EliminarAbonoCompaniaAsync(int id);
        Task<IEnumerable<dynamic>> ObtenerResumenCobranzasCompaniasAsync();
        Task<IEnumerable<dynamic>> ObtenerResumenCobranzasPorSemanaAsync(int? companiaId = null, int? cicloId = null);
        Task<IEnumerable<dynamic>> ObtenerDespachosSemanaCompaniaAsync(int companiaId, int cicloId);
        Task<bool> ActualizarPreciosDespachosSemanaAsync(ActualizarPreciosDespachosSemanaDto dto);

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
                    COALESCE(f.RutaId, (SELECT TOP 1 rlf.RutaLogisticaId FROM TB_RUTAS_LOGISTICA_FINCAS rlf WHERE rlf.FincaId = f.Id ORDER BY rlf.EsPrincipal DESC, rlf.RutaLogisticaId DESC)) AS RutaId,
                    COALESCE(rl.Nombre, (SELECT TOP 1 rl2.Nombre FROM TB_RUTAS_LOGISTICA_FINCAS rlf2 INNER JOIN TB_RUTAS_LOGISTICA rl2 ON rlf2.RutaLogisticaId = rl2.Id WHERE rlf2.FincaId = f.Id ORDER BY rlf2.EsPrincipal DESC, rlf2.RutaLogisticaId DESC)) AS RutaNombre,
                    f.PrecioLitroUSD, f.PrecioLitroAcidaUSD, 
                    ISNULL(f.TieneDosTiposLeche, 0) AS TieneDosTiposLeche,
                    ISNULL(f.PrecioBufalaLitroUSD, 0) AS PrecioBufalaLitroUSD,
                    f.Latitud, f.Longitud,
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
                    f.Latitud, f.Longitud,
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
                (Codigo, Nombre, PropietarioId, Propietario, CedulaRIF, Telefono, BancoId, NumeroCuenta, TipoServicioId, CompaniaId, RutaId, PrecioLitroUSD, PrecioLitroAcidaUSD, TieneDosTiposLeche, PrecioBufalaLitroUSD, Latitud, Longitud, Activo, IsDeleted, CreatedAt)
                VALUES 
                ('', @Nombre, @PropietarioId, @Propietario, @CedulaRIF, @Telefono, @BancoId, @NumeroCuenta, @TipoServicioId, @CompaniaId, @RutaId, @PrecioLitroUSD, @PrecioLitroAcidaUSD, @TieneDosTiposLeche, @PrecioBufalaLitroUSD, @Latitud, @Longitud, @Activo, 0, GETDATE());
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

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, bool> _ensuredHistorialPrecios = new();

        private async Task EnsureTableHistorialPreciosExistsAsync(IDbConnection connection)
        {
            var dbKey = connection.Database ?? "default";
            if (_ensuredHistorialPrecios.ContainsKey(dbKey)) return;
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
            _ensuredHistorialPrecios[dbKey] = true;
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
                    Latitud = COALESCE(@Latitud, Latitud),
                    Longitud = COALESCE(@Longitud, Longitud),
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
                dto.Latitud,
                dto.Longitud,
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
                        observacion = "Cambio individual de precio Leche BÃºfala ($/LT)"
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
                        observacion = "Cambio individual de precio Leche Ãcida ($/LT)"
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
                    Observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? "ActualizaciÃ³n masiva de precio por litro ($/LT)" : dto.Observacion
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

                    -- Si ninguna compaÃ±Ã­a estÃ¡ marcada como Principal, auto-marcar la ReceptorÃ­a / Planta Matriz del tenant
                    EXEC sp_executesql N'
                        IF NOT EXISTS (SELECT 1 FROM TB_COMPANIAS WHERE EsPrincipal = 1 AND IsDeleted = 0)
                        BEGIN
                            UPDATE TB_COMPANIAS
                            SET EsPrincipal = 1
                            WHERE Id = (
                                SELECT TOP 1 Id FROM TB_COMPANIAS
                                WHERE IsDeleted = 0
                                ORDER BY CASE 
                                    WHEN UPPER(Nombre) LIKE ''%RECEPTOR%'' THEN 1
                                    WHEN UPPER(Nombre) LIKE ''%CAMPO%VERDE%'' THEN 2
                                    WHEN UPPER(Nombre) LIKE ''%VERGEL%'' THEN 3
                                    WHEN UPPER(Nombre) LIKE ''%PLANTA%'' THEN 4
                                    WHEN UPPER(Nombre) LIKE ''%MATRIZ%'' THEN 5
                                    ELSE 6 END, Id ASC
                            );
                        END
                    ';";
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
                        observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? "Cambio de precio Leche Vaca de compaÃ±Ã­a ($/L)" : $"{dto.Observacion.Trim()} (Vaca)"
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
                        observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? "Cambio de precio Leche BÃºfala de compaÃ±Ã­a ($/L)" : $"{dto.Observacion.Trim()} (BÃºfala)"
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
                        observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? "Cambio de precio Leche Ãcida/Mala de compaÃ±Ã­a ($/L)" : $"{dto.Observacion.Trim()} (Ãcida/Mala)"
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
                    observacion = string.IsNullOrWhiteSpace(observacion) ? "Ajuste de precio Leche Vaca de compaÃ±Ã­a ($/L)" : observacion.Trim()
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
                        observacion = "Ajuste de precio Leche BÃºfala de compaÃ±Ã­a ($/L)"
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
                        observacion = "Ajuste de precio Leche Ãcida/Mala de compaÃ±Ã­a ($/L)"
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

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, bool> _ensuredAbonosSchema = new();

        private static async Task EnsureAbonosCompaniasSchemaAsync(SqlConnection connection)
        {
            var dbKey = connection.Database ?? "default";
            if (_ensuredAbonosSchema.ContainsKey(dbKey)) return;
            const string ddl = @"
                IF OBJECT_ID('dbo.TB_ABONOS_COMPANIAS', 'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.TB_ABONOS_COMPANIAS (
                        Id INT IDENTITY(1,1) PRIMARY KEY,
                        CompaniaId INT NOT NULL,
                        CicloId INT NULL,
                        Fecha DATETIME NOT NULL DEFAULT GETDATE(),
                        MontoUSD DECIMAL(18,2) NOT NULL,
                        MontoBs DECIMAL(18,2) NULL DEFAULT 0,
                        TasaBcv DECIMAL(18,4) NULL DEFAULT 1,
                        ReferenciaBancaria NVARCHAR(120) NULL,
                        BancoId INT NULL,
                        ControlCompaniaId BIGINT NULL,
                        FechaLecheAbonada DATE NULL,
                        LitrosAbonados INT NULL DEFAULT 0,
                        Observaciones NVARCHAR(500) NULL,
                        TipoPago NVARCHAR(50) NULL DEFAULT 'TRANSFERENCIA',
                        CreatedBy INT NULL,
                        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
                    );
                END
                ELSE IF COL_LENGTH('dbo.TB_ABONOS_COMPANIAS', 'CicloId') IS NULL
                BEGIN
                    ALTER TABLE dbo.TB_ABONOS_COMPANIAS ADD CicloId INT NULL;
                END
                IF COL_LENGTH('dbo.TB_CONTROL_COMPANIAS', 'PrecioLitroUSD') IS NULL
                BEGIN
                    ALTER TABLE dbo.TB_CONTROL_COMPANIAS ADD PrecioLitroUSD DECIMAL(18,4) NULL;
                END";
            await connection.ExecuteAsync(ddl);
            _ensuredAbonosSchema[dbKey] = true;
        }

        public async Task<IEnumerable<dynamic>> ObtenerAbonosCompaniasAsync(int? companiaId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureAbonosCompaniasSchemaAsync(connection);
            var sql = @"
                SELECT 
                    a.Id,
                    a.CompaniaId,
                    c.Nombre AS CompaniaNombre,
                    a.CicloId,
                    cic.Codigo AS SemanaCodigo,
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
                LEFT JOIN TB_CICLOS_OPERATIVOS cic ON a.CicloId = cic.Id
                LEFT JOIN TB_BANCOS b ON a.BancoId = b.Id
                WHERE (@companiaId IS NULL OR a.CompaniaId = @companiaId)
                ORDER BY a.Fecha DESC, a.Id DESC";
            return await connection.QueryAsync(sql, new { companiaId });
        }

        public async Task<int> CrearAbonoCompaniaAsync(GuardarAbonoCompaniaDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureAbonosCompaniasSchemaAsync(connection);

            var items = (dto.DistribucionSemanas != null && dto.DistribucionSemanas.Any(x => x.MontoUSD > 0))
                ? dto.DistribucionSemanas.Where(x => x.MontoUSD > 0).ToList()
                : new List<AbonoSemanaItemDto> { new AbonoSemanaItemDto { CicloId = dto.CicloId ?? 0, MontoUSD = dto.MontoUSD } };

            decimal totalUsdItems = items.Sum(x => x.MontoUSD);
            decimal tasa = dto.TasaBcv.HasValue && dto.TasaBcv.Value > 0 ? dto.TasaBcv.Value : 1m;
            decimal totalBs = dto.MontoBs.HasValue && dto.MontoBs.Value > 0 ? dto.MontoBs.Value : Math.Round(totalUsdItems * tasa, 2);

            const string sql = @"
                INSERT INTO TB_ABONOS_COMPANIAS (
                    CompaniaId, CicloId, Fecha, MontoUSD, MontoBs, TasaBcv, 
                    ReferenciaBancaria, BancoId, ControlCompaniaId, 
                    FechaLecheAbonada, LitrosAbonados, Observaciones, 
                    TipoPago, CreatedBy, CreatedAt
                )
                VALUES (
                    @CompaniaId, @CicloId, @Fecha, @MontoUSD, @MontoBs, @TasaBcv,
                    @ReferenciaBancaria, @BancoId, @ControlCompaniaId,
                    @FechaLecheAbonada, @LitrosAbonados, @Observaciones,
                    @TipoPago, @CreatedBy, GETDATE()
                );
                SELECT CAST(SCOPE_IDENTITY() AS INT);";

            int primerId = 0;
            foreach (var it in items)
            {
                decimal proporcion = totalUsdItems > 0 ? (it.MontoUSD / totalUsdItems) : 1m;
                decimal montoBsItem = Math.Round(totalBs * proporcion, 2);
                int? cId = it.CicloId > 0 ? it.CicloId : (dto.CicloId.HasValue && dto.CicloId.Value > 0 ? dto.CicloId.Value : (int?)null);

                int newId = await connection.ExecuteScalarAsync<int>(sql, new
                {
                    CompaniaId = dto.CompaniaId,
                    CicloId = cId,
                    Fecha = dto.Fecha ?? DateTime.UtcNow,
                    MontoUSD = it.MontoUSD,
                    MontoBs = montoBsItem,
                    TasaBcv = tasa,
                    ReferenciaBancaria = dto.ReferenciaBancaria,
                    BancoId = dto.BancoId,
                    ControlCompaniaId = dto.ControlCompaniaId,
                    FechaLecheAbonada = dto.FechaLecheAbonada,
                    LitrosAbonados = dto.LitrosAbonados ?? 0,
                    Observaciones = dto.Observaciones,
                    TipoPago = dto.TipoPago ?? "TRANSFERENCIA",
                    CreatedBy = usuarioId
                });
                if (primerId == 0) primerId = newId;
            }
            return primerId;
        }

        public async Task<bool> EliminarAbonoCompaniaAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureAbonosCompaniasSchemaAsync(connection);
            var rows = await connection.ExecuteAsync("DELETE FROM TB_ABONOS_COMPANIAS WHERE Id = @id", new { id });
            return rows > 0;
        }

        public async Task<IEnumerable<dynamic>> ObtenerResumenCobranzasCompaniasAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureAbonosCompaniasSchemaAsync(connection);
            var sql = @"
                SELECT 
                    c.Id AS CompaniaId,
                    c.Nombre AS CompaniaNombre,
                    ISNULL(c.PrecioCompraLitroUSD, 0) AS PrecioLitroUSD,
                    ISNULL(desp.TotalLitrosDespachados, 0) AS TotalLitrosDespachados,
                    ISNULL(desp.TotalFacturadoUSD, 0) AS TotalFacturadoUSD,
                    ISNULL(abo.TotalAbonadoUSD, 0) AS TotalAbonadoUSD,
                    (ISNULL(desp.TotalFacturadoUSD, 0) - ISNULL(abo.TotalAbonadoUSD, 0)) AS SaldoPendienteUSD,
                    abo.UltimoAbonoFecha,
                    desp.UltimoDespachoFecha
                FROM TB_COMPANIAS c
                LEFT JOIN (
                    SELECT 
                        cc.CompaniaId,
                        SUM(ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados)) AS TotalLitrosDespachados,
                        SUM(
                            ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados) * 
                            CASE 
                                WHEN UPPER(ISNULL(cc.TipoLeche, 'VACA')) = 'BUFALA' AND ISNULL(c2.PrecioBufalaLitroUSD, 0) > 0 
                                    THEN c2.PrecioBufalaLitroUSD
                                ELSE ISNULL(c2.PrecioCompraLitroUSD, 0)
                            END
                        ) AS TotalFacturadoUSD,
                        MAX(cc.Fecha) AS UltimoDespachoFecha
                    FROM TB_CONTROL_COMPANIAS cc
                    INNER JOIN TB_COMPANIAS c2 ON cc.CompaniaId = c2.Id
                    GROUP BY cc.CompaniaId
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
                  AND ISNULL(c.EsPrincipal, 0) = 0
                ORDER BY c.Nombre ASC";
            return await connection.QueryAsync(sql);
        }

        public async Task<IEnumerable<dynamic>> ObtenerResumenCobranzasPorSemanaAsync(int? companiaId = null, int? cicloId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureAbonosCompaniasSchemaAsync(connection);
            var sql = @"
                WITH DespachosSem AS (
                    SELECT 
                        cc.CompaniaId,
                        COALESCE(NULLIF(cc.CicloId, 0), cicFecha.Id, 0) AS CicloId,
                        SUM(cc.LitrosDespachados) AS LitrosDespachados,
                        SUM(ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados)) AS LitrosRecibidos,
                        SUM(CASE WHEN UPPER(ISNULL(cc.TipoLeche, 'VACA')) NOT IN ('BUFALA', 'ACIDA') THEN ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados) ELSE 0 END) AS LitrosVaca,
                        SUM(CASE WHEN UPPER(ISNULL(cc.TipoLeche, 'VACA')) = 'BUFALA' THEN ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados) ELSE 0 END) AS LitrosBufala,
                        SUM(CASE WHEN UPPER(ISNULL(cc.TipoLeche, 'VACA')) = 'ACIDA' THEN ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados) ELSE 0 END) AS LitrosAcida,
                        SUM(
                            ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados) *
                            COALESCE(
                                NULLIF(cc.PrecioLitroUSD, 0),
                                CASE 
                                    WHEN UPPER(ISNULL(cc.TipoLeche, 'VACA')) = 'BUFALA' AND ISNULL(c.PrecioBufalaLitroUSD, 0) > 0 
                                        THEN c.PrecioBufalaLitroUSD
                                    WHEN UPPER(ISNULL(cc.TipoLeche, 'VACA')) = 'ACIDA' AND ISNULL(c.PrecioAcidaLitroUSD, 0) > 0 
                                        THEN c.PrecioAcidaLitroUSD
                                    ELSE ISNULL(c.PrecioCompraLitroUSD, 0)
                                END
                            )
                        ) AS TotalFacturadoUSD,
                        COUNT(*) AS CantidadDespachos
                    FROM TB_CONTROL_COMPANIAS cc
                    INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                    OUTER APPLY (
                        SELECT TOP 1 cicF.Id
                        FROM TB_CICLOS_OPERATIVOS cicF
                        WHERE CAST(cc.Fecha AS DATE) BETWEEN cicF.FechaInicio AND cicF.FechaFin
                        ORDER BY cicF.Id DESC
                    ) cicFecha
                    WHERE c.IsDeleted = 0
                      AND ISNULL(c.EsPrincipal, 0) = 0
                      AND (@companiaId IS NULL OR cc.CompaniaId = @companiaId)
                      AND (@cicloId IS NULL OR COALESCE(NULLIF(cc.CicloId, 0), cicFecha.Id, 0) = @cicloId)
                    GROUP BY cc.CompaniaId, COALESCE(NULLIF(cc.CicloId, 0), cicFecha.Id, 0)
                ),
                AbonosSem AS (
                    SELECT 
                        a.CompaniaId,
                        ISNULL(a.CicloId, 0) AS CicloId,
                        SUM(a.MontoUSD) AS TotalAbonadoUSD,
                        MAX(a.Fecha) AS UltimoAbonoFecha
                    FROM TB_ABONOS_COMPANIAS a
                    WHERE (@companiaId IS NULL OR a.CompaniaId = @companiaId)
                      AND (@cicloId IS NULL OR a.CicloId = @cicloId)
                    GROUP BY a.CompaniaId, ISNULL(a.CicloId, 0)
                ),
                Pares AS (
                    SELECT CompaniaId, CicloId FROM DespachosSem
                    UNION
                    SELECT CompaniaId, CicloId FROM AbonosSem
                )
                SELECT 
                    p.CompaniaId,
                    c.Nombre AS CompaniaNombre,
                    ISNULL(c.PrecioCompraLitroUSD, 0) AS PrecioLitroUSD,
                    ISNULL(c.PrecioBufalaLitroUSD, 0) AS PrecioBufalaLitroUSD,
                    ISNULL(c.PrecioAcidaLitroUSD, 0) AS PrecioAcidaLitroUSD,
                    p.CicloId,
                    ISNULL(cic.Codigo, 'Sin Semana') AS SemanaCodigo,
                    cic.FechaInicio,
                    cic.FechaFin,
                    ISNULL(d.LitrosDespachados, 0) AS LitrosDespachados,
                    ISNULL(d.LitrosRecibidos, 0) AS LitrosRecibidos,
                    ISNULL(d.LitrosVaca, 0) AS LitrosVaca,
                    ISNULL(d.LitrosBufala, 0) AS LitrosBufala,
                    ISNULL(d.LitrosAcida, 0) AS LitrosAcida,
                    ISNULL(d.CantidadDespachos, 0) AS CantidadDespachos,
                    ISNULL(d.TotalFacturadoUSD, 0) AS TotalFacturadoUSD,
                    ISNULL(a.TotalAbonadoUSD, 0) AS TotalAbonadoUSD,
                    (ISNULL(d.TotalFacturadoUSD, 0) - ISNULL(a.TotalAbonadoUSD, 0)) AS SaldoPendienteUSD,
                    a.UltimoAbonoFecha
                FROM Pares p
                INNER JOIN TB_COMPANIAS c ON p.CompaniaId = c.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS cic ON p.CicloId = cic.Id
                LEFT JOIN DespachosSem d ON p.CompaniaId = d.CompaniaId AND p.CicloId = d.CicloId
                LEFT JOIN AbonosSem a ON p.CompaniaId = a.CompaniaId AND p.CicloId = a.CicloId
                WHERE ISNULL(c.EsPrincipal, 0) = 0
                ORDER BY p.CicloId DESC, c.Nombre ASC";
            return await connection.QueryAsync(sql, new { companiaId, cicloId });
        }

        public async Task<IEnumerable<dynamic>> ObtenerDespachosSemanaCompaniaAsync(int companiaId, int cicloId)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureAbonosCompaniasSchemaAsync(connection);
            var sql = @"
                SELECT 
                    cc.Id,
                    cc.Fecha,
                    UPPER(ISNULL(cc.TipoLeche, 'VACA')) AS TipoLeche,
                    cc.LitrosDespachados,
                    ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados) AS LitrosRecibidos,
                    COALESCE(
                        NULLIF(cc.PrecioLitroUSD, 0),
                        CASE 
                            WHEN UPPER(ISNULL(cc.TipoLeche, 'VACA')) = 'BUFALA' AND ISNULL(c.PrecioBufalaLitroUSD, 0) > 0 
                                THEN c.PrecioBufalaLitroUSD
                            WHEN UPPER(ISNULL(cc.TipoLeche, 'VACA')) = 'ACIDA' AND ISNULL(c.PrecioAcidaLitroUSD, 0) > 0 
                                THEN c.PrecioAcidaLitroUSD
                            ELSE ISNULL(c.PrecioCompraLitroUSD, 0)
                        END
                    ) AS PrecioLitroUSD,
                    (
                        ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados) *
                        COALESCE(
                            NULLIF(cc.PrecioLitroUSD, 0),
                            CASE 
                                WHEN UPPER(ISNULL(cc.TipoLeche, 'VACA')) = 'BUFALA' AND ISNULL(c.PrecioBufalaLitroUSD, 0) > 0 
                                    THEN c.PrecioBufalaLitroUSD
                                WHEN UPPER(ISNULL(cc.TipoLeche, 'VACA')) = 'ACIDA' AND ISNULL(c.PrecioAcidaLitroUSD, 0) > 0 
                                    THEN c.PrecioAcidaLitroUSD
                                ELSE ISNULL(c.PrecioCompraLitroUSD, 0)
                            END
                        )
                    ) AS MontoUSD,
                    cc.Observacion
                FROM TB_CONTROL_COMPANIAS cc
                INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                OUTER APPLY (
                    SELECT TOP 1 cicF.Id
                    FROM TB_CICLOS_OPERATIVOS cicF
                    WHERE CAST(cc.Fecha AS DATE) BETWEEN cicF.FechaInicio AND cicF.FechaFin
                    ORDER BY cicF.Id DESC
                ) cicFecha
                WHERE cc.CompaniaId = @companiaId
                  AND COALESCE(NULLIF(cc.CicloId, 0), cicFecha.Id, 0) = @cicloId
                ORDER BY cc.Fecha ASC, cc.Id ASC";
            return await connection.QueryAsync(sql, new { companiaId, cicloId });
        }

        public async Task<bool> ActualizarPreciosDespachosSemanaAsync(ActualizarPreciosDespachosSemanaDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            await EnsureAbonosCompaniasSchemaAsync(connection);
            await connection.OpenAsync();
            using var tx = connection.BeginTransaction();
            try
            {
                foreach (var item in dto.Items)
                {
                    if (item.DespachoId <= 0 || item.PrecioLitroUSD < 0) continue;
                    await connection.ExecuteAsync(@"
                        UPDATE TB_CONTROL_COMPANIAS
                        SET PrecioLitroUSD = @PrecioLitroUSD,
                            TipoLeche = COALESCE(NULLIF(@TipoLeche, ''), TipoLeche),
                            ModifiedAt = GETDATE()
                        WHERE Id = @DespachoId
                          AND CompaniaId = @CompaniaId",
                        new
                        {
                            item.PrecioLitroUSD,
                            TipoLeche = item.TipoLeche?.Trim().ToUpperInvariant(),
                            item.DespachoId,
                            dto.CompaniaId,
                            dto.CicloId
                        }, tx);
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

        // --- PROPIETARIOS Y CONSOLIDACIÃ“N ---
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
                    // Si se pasÃ³ solo BancoId y NumeroCuenta pero sin lista de Cuentas, insertar 1 cuenta principal
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

                // Si no existÃ­a por id (ej: ID temporal del frontend), buscar por nombre o insertar
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
                        // Sincronizar automÃ¡ticamente datos bancarios y nombre a todas las fincas vinculadas a este propietario
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
                // Desvincular fincas de forma segura (Â¡SIN ELIMINAR NINGUNA FINCA!)
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
                    // Fallback resiliente: Si el Id no existe directamente en TB_PROPIETARIOS (ej. id sintÃ©tico del frontend)
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

                // Sincronizar automÃ¡ticamente precios de recolecciÃ³n de rutas de los ciclos seleccionados
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
                // No inyectar la semana actual si no estÃ¡ cerrada o es la semana en curso.
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
                    // En caso de fincas pendientes (y especialmente en unificaciÃ³n de semanas),
                    // el monto total a pagar unificado se calcula SIEMPRE con el valor del dÃ³lar actual (tasaActual).
                    row.TasaBcv = tasaActual;
                    row.TotalBrutoBs = Math.Round(row.TotalUSD * tasaActual, 2);
                    if (row.TotalAdelantosUSD > 0)
                    {
                        row.TotalAdelantosBs = Math.Round(row.TotalAdelantosUSD * tasaActual, 2);
                    }
                    row.TotalNetoBs = Math.Max(0, row.TotalBrutoBs - row.TotalAdelantosBs - row.OtrasDeduccionesBs);
                }

                // CÃ¡lculo explÃ­cito de saldo deudor restante para visualizaciÃ³n clara
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

                // 2. Obtener cicloId si no estÃ¡ provisto
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

                    // 2.1 Actualizar Tasa DÃ³lar / BCV para esta finca en este ciclo
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

                    // 4. DeducciÃ³n especÃ­fica de este ciclo (TB_DEDUCCIONES_FINCA_CICLO)
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
                    throw new Exception("No se especificÃ³ ni se encontrÃ³ ningÃºn ciclo operativo.");

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

                // 2. Actualizar automÃ¡ticamente cuotas pendientes de adelantos activos al nuevo valor del dÃ³lar
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
                    USING (SELECT CAST(DATEADD(hour, -4, GETUTCDATE()) AS DATE) AS Fecha) AS source
                    ON (CAST(target.Fecha AS DATE) = source.Fecha)
                    WHEN MATCHED THEN
                        UPDATE SET TasaDolarBs = @TasaBcv, Observacion = 'ActualizaciÃ³n desde Pre-LiquidaciÃ³n (Pendientes)', CreatedAt = DATEADD(hour, -4, GETUTCDATE())
                    WHEN NOT MATCHED THEN
                        INSERT (Fecha, TasaDolarBs, Fuente, Observacion, CreatedAt)
                        VALUES (CAST(DATEADD(hour, -4, GETUTCDATE()) AS DATE), @TasaBcv, 'BANCO CENTRAL DE VENEZUELA (BCV)', 'ActualizaciÃ³n desde Pre-LiquidaciÃ³n (Pendientes)', DATEADD(hour, -4, GETUTCDATE()));";
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

                // 3. Contar cuÃ¡ntas fincas pendientes fueron actualizadas
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
                    throw new Exception("No se encontrÃ³ ningÃºn ciclo operativo vÃ¡lido para procesar el pago.");

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

                    // Si se generaron adelantos automÃ¡ticos de saldo deudor para ciclos siguientes que no se hayan cobrado aÃºn, anularlos
                    int maxCicloIdRev = listaCiclos.Max();
                    var nextCiclosRev = (await connection.QueryAsync<int>(@"
                        SELECT Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @maxCicloIdRev", new { maxCicloIdRev }, transaction)).ToList();

                    if (nextCiclosRev.Any())
                    {
                        var adelantosAutoIds = (await connection.QueryAsync<int>(@"
                            SELECT Id FROM TB_ADELANTOS
                            WHERE TipoEntidad = 'FINCA' AND EntidadId = @FincaId
                              AND SemanaInicioId IN @nextCiclosRev
                              AND Observacion LIKE '%Saldo deudor / Remanente automÃ¡tico%'
                              AND (MontoPagadoUSD = 0 OR MontoPagadoUSD IS NULL)",
                            new { dto.FincaId, nextCiclosRev }, transaction)).ToList();

                        if (adelantosAutoIds.Any())
                        {
                            await connection.ExecuteAsync(@"
                                UPDATE TB_ADELANTOS_CUOTAS SET Estado = 'ANULADA', Observacion = 'Anulada por reversiÃ³n de liquidaciÃ³n anterior'
                                WHERE AdelantoId IN @adelantosAutoIds;
                                UPDATE TB_ADELANTOS SET Estado = 'ANULADA', Observacion = 'Anulado por reversiÃ³n de liquidaciÃ³n anterior'
                                WHERE Id IN @adelantosAutoIds;", new { adelantosAutoIds }, transaction);
                        }
                    }

                    // Revertir Ãºnicamente cuotas correspondientes a los ciclos cancelados
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

                        // Recalcular saldo y estado de cada adelanto afectado tras la reversiÃ³n
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

                    // Registrar en TB_LOGS_PAGOS_LIQUIDACION la reversiÃ³n
                    foreach (var cId in listaCiclos)
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_LOGS_PAGOS_LIQUIDACION (
                                Accion, FincaId, CicloId, Detalle, UsuarioId, Fecha
                            ) VALUES (
                                'REVERSION_PAGO', @FincaId, @cId, 'Pago de liquidaciÃ³n revertido por usuario', @usuarioId, GETDATE()
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

                // Filtrar los ciclos que realmente estÃ¡n pendientes para esta finca
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

                // Cuotas de adelanto acumuladas: ÃšNICAMENTE cuotas asignadas a los ciclos en pago o cuotas pasadas pendientes (< minCicloId).
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
                            // La leche NO cubriÃ³ el total de la cuota: cobro parcial y traslado automÃ¡tico de saldo deudor a la siguiente semana
                            await connection.ExecuteAsync(@"
                                UPDATE TB_ADELANTOS_CUOTAS
                                SET MontoCuotaUSD = @montoACobrarUsd,
                                    MontoCobradoUSD = @montoACobrarUsd,
                                    TasaBcvAplicada = @tasaActual,
                                    MontoCobradoBs = @cuotaMontoBs,
                                    Estado = 'COBRADO',
                                    Observacion = 'DeducciÃ³n parcial en LiquidaciÃ³n Bancaria por cobertura de leche',
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

                                string obsSaldoDeudor = $"Saldo deudor / Remanente automÃ¡tico de LiquidaciÃ³n Semana {maxCicloId} (Adelanto #{aId}: ${cuotaMontoUsd:N2} - Leche: ${montoACobrarUsd:N2} = ${remanenteCuotaUsd:N2})";

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
                                    Observacion = 'Descontado y cancelado en LiquidaciÃ³n Bancaria',
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
                                detalleCuota = $"Cobro de Cuota {numCuota}/{totCuotas} de Adelanto #{aId} en LiquidaciÃ³n",
                                usuarioId
                            }, transaction);

                        totalAdelantosUSD += montoACobrarUsd;
                        totalAdelantosBs += cuotaMontoBs;
                        if (string.IsNullOrEmpty(cuotasDetalle)) cuotasDetalle = $"Cuota {cuota.NumeroCuota} de {cuota.NumeroCuotas}";
                        else cuotasDetalle += $", Cuota {cuota.NumeroCuota} de {cuota.NumeroCuotas}";
                    }

                    canceladoTotalAdelanto = true;
                }

                // Registrar liquidaciÃ³n para cada ciclo pendiente
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
                    string observacion = dto.Observacion ?? (listaCiclos.Count > 1 ? $"Pago Unificado Multi-Semana ({string.Join("+", listaCiclos)})" : "Pago registrado desde Pre-LiquidaciÃ³n");

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

                    // Registrar log general de pago de liquidaciÃ³n para el ciclo
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
                string? masterConn = Environment.GetEnvironmentVariable("SAAS_MASTER_CONNECTION");
                if (!string.IsNullOrWhiteSpace(tenantCode) && !string.IsNullOrWhiteSpace(masterConn))
                {
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
                string? masterConn = Environment.GetEnvironmentVariable("SAAS_MASTER_CONNECTION");
                if (!string.IsNullOrWhiteSpace(tenantCode) && !string.IsNullOrWhiteSpace(dto.Nombre) && !string.IsNullOrWhiteSpace(masterConn))
                {
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

}
