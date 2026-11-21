using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Data.SqlClient;
using Transporte.Core.Entities;
using Transporte.Infrastructure.Repositories;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/data")]
    [Authorize]
    public class ImportacionDataController : ControllerBase
    {
        private readonly IConfiguration _configuration;
        private readonly Transporte.Core.Interfaces.ITenantService? _tenantService;
        private readonly ICatalogosRepository _catalogosRepository;

        public ImportacionDataController(IConfiguration configuration, ICatalogosRepository catalogosRepository, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _configuration = configuration;
            _catalogosRepository = catalogosRepository;
            _tenantService = tenantService;
        }

        private IDbConnection CreateConnection()
        {
            string rawConn = _tenantService?.GetConnectionString() 
                ?? _configuration.GetConnectionString("DefaultConnection") 
                ?? "Server=127.0.0.1,1433;Database=DB_PROD_CAMPO_VERDE;User Id=user_campoverde;Password=Campo_Verde_2026!;TrustServerCertificate=True;";
            return new SqlConnection(Transporte.API.Multitenancy.TenantService.AdjustConnectionStringForEnvironment(rawConn));
        }

        private int GetUserId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(claim, out int id) ? id : 1;
        }

        private static List<T> ExtraerItems<T>(JsonElement payload)
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            if (payload.ValueKind == JsonValueKind.Array)
            {
                return JsonSerializer.Deserialize<List<T>>(payload.GetRawText(), options) ?? new();
            }
            if (payload.ValueKind == JsonValueKind.Object)
            {
                if (payload.TryGetProperty("items", out var itemsElem) || payload.TryGetProperty("Items", out itemsElem))
                {
                    if (itemsElem.ValueKind == JsonValueKind.Array)
                    {
                        return JsonSerializer.Deserialize<List<T>>(itemsElem.GetRawText(), options) ?? new();
                    }
                }
            }
            return new();
        }

        /// <summary>
        /// Valida si existen registros previos necesarios para importar una entidad
        /// (ej: Propietarios antes de Fincas).
        /// </summary>
        [HttpGet("validar-prerequisitos/{entidad}")]
        public async Task<IActionResult> ValidarPrerequisitos(string entidad)
        {
            try
            {
                using var conn = CreateConnection();
                var ent = (entidad ?? "").Trim().ToUpperInvariant().Replace("TB_", "");

                if (ent == "FINCAS")
                {
                    int totalPropietarios = await conn.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM TB_PROPIETARIOS WHERE Estado = 'ACTIVO'");
                    int totalCompanias = await conn.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM TB_COMPANIAS WHERE Activo = 1 AND IsDeleted = 0");
                    int totalBancos = await conn.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM TB_BANCOS WHERE Activo = 1");

                    bool tienePropietarios = totalPropietarios > 0;
                    return Ok(new
                    {
                        entidad = "FINCAS",
                        requierePrevio = true,
                        prerequisitos = new[]
                        {
                            new { nombre = "Propietarios", cantidad = totalPropietarios, cumplido = tienePropietarios, mensaje = tienePropietarios ? $"{totalPropietarios} propietarios registrados." : "No hay propietarios registrados. Se recomienda cargar propietarios antes para asociar fincas." },
                            new { nombre = "Compañías", cantidad = totalCompanias, cumplido = totalCompanias > 0, mensaje = $"{totalCompanias} compañías registradas." },
                            new { nombre = "Bancos", cantidad = totalBancos, cumplido = totalBancos > 0, mensaje = $"{totalBancos} bancos registrados." }
                        },
                        listo = tienePropietarios
                    });
                }
                else if (ent == "PROPIETARIOS")
                {
                    int totalBancos = await conn.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM TB_BANCOS WHERE Activo = 1");
                    return Ok(new
                    {
                        entidad = "PROPIETARIOS",
                        requierePrevio = false,
                        prerequisitos = new[]
                        {
                            new { nombre = "Bancos", cantidad = totalBancos, cumplido = totalBancos > 0, mensaje = $"{totalBancos} bancos registrados para cuentas bancarias." }
                        },
                        listo = true
                    });
                }
                else
                {
                    return Ok(new
                    {
                        entidad = ent,
                        requierePrevio = false,
                        prerequisitos = Array.Empty<object>(),
                        listo = true
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al validar prerrequisitos: " + ex.Message });
            }
        }

        /// <summary>
        /// Importación masiva de Propietarios
        /// Acepta payload en formato Array directo o { items: [...] }
        /// </summary>
        [HttpPost("importar/propietarios")]
        [HttpPost("importar/TB_PROPIETARIOS")]
        public async Task<IActionResult> ImportarPropietarios([FromBody] JsonElement payload)
        {
            var items = ExtraerItems<ImportarPropietarioItemDto>(payload);
            if (items == null || items.Count == 0)
                return BadRequest(new { message = "No se recibieron datos de propietarios para importar." });

            int insertados = 0;
            int actualizados = 0;
            var errores = new List<string>();
            int userId = GetUserId();

            try
            {
                using var conn = CreateConnection();
                var listaBancos = (await conn.QueryAsync<Banco>("SELECT * FROM TB_BANCOS WHERE Activo = 1")).ToList();

                foreach (var item in items)
                {
                    try
                    {
                        if (string.IsNullOrWhiteSpace(item.Nombre))
                        {
                            errores.Add("Fila omitida: Nombre de propietario requerido.");
                            continue;
                        }

                        string nom = item.Nombre.Trim();
                        string? ced = string.IsNullOrWhiteSpace(item.CedulaRIF) ? null : item.CedulaRIF.Trim();
                        string? tel = string.IsNullOrWhiteSpace(item.Telefono) ? null : item.Telefono.Trim();
                        string? email = string.IsNullOrWhiteSpace(item.Email) ? null : item.Email.Trim();
                        string? numCuenta = string.IsNullOrWhiteSpace(item.NumeroCuenta) ? null : item.NumeroCuenta.Trim();
                        string? obs = string.IsNullOrWhiteSpace(item.Observacion) ? null : item.Observacion.Trim();

                        int? bancoId = item.BancoId;
                        if (!bancoId.HasValue && !string.IsNullOrWhiteSpace(item.BancoNombre))
                        {
                            var bEncontrado = listaBancos.FirstOrDefault(b => 
                                b.Nombre.Equals(item.BancoNombre.Trim(), StringComparison.OrdinalIgnoreCase) ||
                                b.Codigo.Equals(item.BancoNombre.Trim(), StringComparison.OrdinalIgnoreCase));
                            if (bEncontrado != null) bancoId = bEncontrado.Id;
                        }

                        var existente = await conn.QueryFirstOrDefaultAsync<Propietario>(
                            @"SELECT TOP 1 * FROM TB_PROPIETARIOS 
                              WHERE (@ced IS NOT NULL AND CedulaRIF = @ced) 
                                 OR LOWER(RTRIM(LTRIM(Nombre))) = LOWER(RTRIM(LTRIM(@nom)))",
                            new { ced, nom });

                        if (existente != null)
                        {
                            await conn.ExecuteAsync(@"
                                UPDATE TB_PROPIETARIOS 
                                SET Nombre = @nom,
                                    CedulaRIF = COALESCE(@ced, CedulaRIF),
                                    Telefono = COALESCE(@tel, Telefono),
                                    Email = COALESCE(@email, Email),
                                    BancoId = COALESCE(@bancoId, BancoId),
                                    NumeroCuenta = COALESCE(@numCuenta, NumeroCuenta),
                                    Observacion = COALESCE(@obs, Observacion),
                                    Estado = 'ACTIVO',
                                    ModifiedAt = GETDATE(),
                                    ModifiedBy = @userId
                                WHERE Id = @id",
                                new { nom, ced, tel, email, bancoId, numCuenta, obs, userId, id = existente.Id });
                            actualizados++;
                        }
                        else
                        {
                            await conn.ExecuteAsync(@"
                                INSERT INTO TB_PROPIETARIOS (Nombre, CedulaRIF, Telefono, Email, BancoId, NumeroCuenta, Observacion, Estado, CreatedAt, CreatedBy)
                                VALUES (@nom, @ced, @tel, @email, @bancoId, @numCuenta, @obs, 'ACTIVO', GETDATE(), @userId)",
                                new { nom, ced, tel, email, bancoId, numCuenta, obs, userId });
                            insertados++;
                        }
                    }
                    catch (Exception exItem)
                    {
                        errores.Add($"Error en propietario '{item.Nombre}': {exItem.Message}");
                    }
                }

                return Ok(new
                {
                    totalRecibidos = items.Count,
                    insertados,
                    actualizados,
                    errores
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error durante la importación de propietarios: " + ex.Message });
            }
        }

        /// <summary>
        /// Importación masiva de Fincas (con vinculación y auto-creación opcional de Propietarios)
        /// Acepta payload en formato Array directo o { items: [...], autoCrearPropietarios: true }
        /// </summary>
        [HttpPost("importar/fincas")]
        [HttpPost("importar/TB_FINCAS")]
        public async Task<IActionResult> ImportarFincas([FromBody] JsonElement payload)
        {
            var items = ExtraerItems<ImportarFincaItemDto>(payload);
            if (items == null || items.Count == 0)
                return BadRequest(new { message = "No se recibieron fincas para importar." });

            bool autoCrearPropietarios = true;
            if (payload.ValueKind == JsonValueKind.Object)
            {
                if (payload.TryGetProperty("autoCrearPropietarios", out var ac) || payload.TryGetProperty("AutoCrearPropietarios", out ac))
                {
                    if (ac.ValueKind == JsonValueKind.False) autoCrearPropietarios = false;
                }
            }

            int insertados = 0;
            int actualizados = 0;
            int propietariosAutoCreados = 0;
            var errores = new List<string>();
            int userId = GetUserId();

            try
            {
                using var conn = CreateConnection();
                var listaBancos = (await conn.QueryAsync<Banco>("SELECT * FROM TB_BANCOS WHERE Activo = 1")).ToList();
                var listaCompanias = (await conn.QueryAsync<Compania>("SELECT * FROM TB_COMPANIAS WHERE Activo = 1 AND IsDeleted = 0")).ToList();
                var listaPropietarios = (await conn.QueryAsync<Propietario>("SELECT * FROM TB_PROPIETARIOS WHERE Estado = 'ACTIVO'")).ToList();

                foreach (var item in items)
                {
                    try
                    {
                        if (string.IsNullOrWhiteSpace(item.Nombre))
                        {
                            errores.Add("Fila omitida: Nombre de finca requerido.");
                            continue;
                        }

                        string nom = item.Nombre.Trim();
                        string? cod = string.IsNullOrWhiteSpace(item.Codigo) ? null : item.Codigo.Trim();
                        string propNombre = (item.Propietario ?? item.PropietarioNombre ?? string.Empty).Trim();
                        string? ced = string.IsNullOrWhiteSpace(item.CedulaRIF) ? null : item.CedulaRIF.Trim();
                        string? tel = string.IsNullOrWhiteSpace(item.Telefono) ? null : item.Telefono.Trim();
                        string? numCuenta = string.IsNullOrWhiteSpace(item.NumeroCuenta) ? null : item.NumeroCuenta.Trim();
                        decimal pUSD = item.PrecioLitroUSD > 0 ? item.PrecioLitroUSD : 0.4000m;
                        decimal pAcida = item.PrecioLitroAcidaUSD >= 0 ? item.PrecioLitroAcidaUSD : 0.0000m;
                        
                        bool tiene2Tipos = item.TieneDosTiposLeche || (item.TipoLeche != null && item.TipoLeche.ToUpperInvariant().Contains("BUFAL"));
                        decimal pBufala = item.PrecioBufalaLitroUSD ?? (tiene2Tipos ? pUSD : 0.0000m);
                        int tipoServicioId = item.TipoServicioId ?? 1;

                        // Vinculación o creación de propietario
                        int? propId = item.PropietarioId;
                        if (!propId.HasValue && !string.IsNullOrWhiteSpace(propNombre))
                        {
                            var pEncontrado = listaPropietarios.FirstOrDefault(p => 
                                (!string.IsNullOrEmpty(ced) && p.CedulaRIF == ced) ||
                                p.Nombre.Equals(propNombre, StringComparison.OrdinalIgnoreCase));

                            if (pEncontrado != null)
                            {
                                propId = pEncontrado.Id;
                                propNombre = pEncontrado.Nombre;
                            }
                            else if (autoCrearPropietarios)
                            {
                                int nuevoPropId = await conn.QuerySingleAsync<int>(@"
                                    INSERT INTO TB_PROPIETARIOS (Nombre, CedulaRIF, Telefono, Estado, CreatedAt, CreatedBy)
                                    VALUES (@propNombre, @ced, @tel, 'ACTIVO', GETDATE(), @userId);
                                    SELECT CAST(SCOPE_IDENTITY() as int);",
                                    new { propNombre, ced, tel, userId });

                                propId = nuevoPropId;
                                listaPropietarios.Add(new Propietario { Id = nuevoPropId, Nombre = propNombre, CedulaRIF = ced, Telefono = tel });
                                propietariosAutoCreados++;
                            }
                        }

                        // Asegurar que la columna Propietario (NOT NULL en TB_FINCAS) nunca sea nula
                        if (string.IsNullOrWhiteSpace(propNombre))
                        {
                            propNombre = "SIN PROPIETARIO";
                        }

                        // Banco
                        int? bancoId = item.BancoId;
                        if (!bancoId.HasValue && !string.IsNullOrWhiteSpace(item.BancoNombre))
                        {
                            var bEncontrado = listaBancos.FirstOrDefault(b => 
                                b.Nombre.Equals(item.BancoNombre.Trim(), StringComparison.OrdinalIgnoreCase) ||
                                b.Codigo.Equals(item.BancoNombre.Trim(), StringComparison.OrdinalIgnoreCase));
                            if (bEncontrado != null) bancoId = bEncontrado.Id;
                        }

                        // Compañía
                        int? compId = item.CompaniaId;
                        if (!compId.HasValue && !string.IsNullOrWhiteSpace(item.CompaniaNombre))
                        {
                            var cEncontrada = listaCompanias.FirstOrDefault(c => 
                                c.Nombre.Equals(item.CompaniaNombre.Trim(), StringComparison.OrdinalIgnoreCase));
                            if (cEncontrada != null) compId = cEncontrada.Id;
                        }

                        // Buscar existencia por Código o Nombre
                        var fincaExistente = await conn.QueryFirstOrDefaultAsync<Finca>(
                            @"SELECT TOP 1 * FROM TB_FINCAS 
                              WHERE (@cod IS NOT NULL AND @cod <> '' AND Codigo = @cod) 
                                 OR LOWER(RTRIM(LTRIM(Nombre))) = LOWER(RTRIM(LTRIM(@nom)))",
                            new { cod, nom });

                        if (fincaExistente != null)
                        {
                            await conn.ExecuteAsync(@"
                                UPDATE TB_FINCAS 
                                SET Nombre = @nom,
                                    Codigo = COALESCE(@cod, Codigo),
                                    Propietario = @propNombre,
                                    PropietarioId = COALESCE(@propId, PropietarioId),
                                    CedulaRIF = COALESCE(@ced, CedulaRIF),
                                    Telefono = COALESCE(@tel, Telefono),
                                    BancoId = COALESCE(@bancoId, BancoId),
                                    NumeroCuenta = COALESCE(@numCuenta, NumeroCuenta),
                                    CompaniaId = COALESCE(@compId, CompaniaId),
                                    PrecioLitroUSD = CASE WHEN @pUSD > 0 THEN @pUSD ELSE PrecioLitroUSD END,
                                    PrecioLitroAcidaUSD = CASE WHEN @pAcida > 0 THEN @pAcida ELSE PrecioLitroAcidaUSD END,
                                    PrecioBufalaLitroUSD = CASE WHEN @pBufala > 0 THEN @pBufala ELSE PrecioBufalaLitroUSD END,
                                    TieneDosTiposLeche = @tiene2Tipos,
                                    TipoServicioId = COALESCE(@tipoServicioId, TipoServicioId),
                                    Activo = 1,
                                    IsDeleted = 0
                                WHERE Id = @id",
                                new { nom, cod, propNombre, propId, ced, tel, bancoId, numCuenta, compId, pUSD, pAcida, pBufala, tiene2Tipos, tipoServicioId, id = fincaExistente.Id });
                            actualizados++;
                        }
                        else
                        {
                            await conn.ExecuteAsync(@"
                                INSERT INTO TB_FINCAS (Codigo, Nombre, Propietario, PropietarioId, CedulaRIF, Telefono, BancoId, NumeroCuenta, CompaniaId, PrecioLitroUSD, PrecioLitroAcidaUSD, PrecioBufalaLitroUSD, TieneDosTiposLeche, TipoServicioId, Activo, IsDeleted, CreatedAt)
                                VALUES (@cod, @nom, @propNombre, @propId, @ced, @tel, @bancoId, @numCuenta, @compId, @pUSD, @pAcida, @pBufala, @tiene2Tipos, @tipoServicioId, 1, 0, GETDATE())",
                                new { cod, nom, propNombre, propId, ced, tel, bancoId, numCuenta, compId, pUSD, pAcida, pBufala, tiene2Tipos, tipoServicioId });
                            insertados++;
                        }
                    }
                    catch (Exception exFinca)
                    {
                        errores.Add($"Error en finca '{item.Nombre}': {exFinca.Message}");
                    }
                }

                return Ok(new
                {
                    totalRecibidos = items.Count,
                    insertados,
                    actualizados,
                    propietariosAutoCreados,
                    errores
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error durante la importación de fincas: " + ex.Message });
            }
        }

        /// <summary>
        /// Importación masiva de Compañías / Receptorías
        /// Acepta payload en formato Array directo o { items: [...] }
        /// </summary>
        [HttpPost("importar/companias")]
        [HttpPost("importar/TB_COMPANIAS")]
        public async Task<IActionResult> ImportarCompanias([FromBody] JsonElement payload)
        {
            var items = ExtraerItems<ImportarCompaniaItemDto>(payload);
            if (items == null || items.Count == 0)
                return BadRequest(new { message = "No se recibieron compañías para importar." });

            int insertados = 0;
            int actualizados = 0;
            var errores = new List<string>();

            try
            {
                using var conn = CreateConnection();

                foreach (var item in items)
                {
                    try
                    {
                        if (string.IsNullOrWhiteSpace(item.Nombre))
                        {
                            errores.Add("Fila omitida: Nombre de compañía requerido.");
                            continue;
                        }

                        string nom = item.Nombre.Trim();
                        string? enc = string.IsNullOrWhiteSpace(item.Encargado) ? null : item.Encargado.Trim();
                        string? tel = string.IsNullOrWhiteSpace(item.Telefono) ? null : item.Telefono.Trim();
                        string? dir = string.IsNullOrWhiteSpace(item.Direccion) ? null : item.Direccion.Trim();
                        decimal pCompra = item.PrecioCompraLitroUSD > 0 ? item.PrecioCompraLitroUSD : 0.5000m;
                        decimal? pBufala = item.PrecioBufalaLitroUSD;
                        decimal? pAcida = item.PrecioAcidaLitroUSD;

                        var existente = await conn.QueryFirstOrDefaultAsync<Compania>(
                            "SELECT TOP 1 * FROM TB_COMPANIAS WHERE LOWER(RTRIM(LTRIM(Nombre))) = LOWER(RTRIM(LTRIM(@nom)))",
                            new { nom });

                        if (existente != null)
                        {
                            await conn.ExecuteAsync(@"
                                UPDATE TB_COMPANIAS 
                                SET Nombre = @nom,
                                    Encargado = COALESCE(@enc, Encargado),
                                    Telefono = COALESCE(@tel, Telefono),
                                    Direccion = COALESCE(@dir, Direccion),
                                    PrecioCompraLitroUSD = CASE WHEN @pCompra > 0 THEN @pCompra ELSE PrecioCompraLitroUSD END,
                                    PrecioBufalaLitroUSD = COALESCE(@pBufala, PrecioBufalaLitroUSD),
                                    PrecioAcidaLitroUSD = COALESCE(@pAcida, PrecioAcidaLitroUSD),
                                    Activo = 1,
                                    IsDeleted = 0
                                WHERE Id = @id",
                                new { nom, enc, tel, dir, pCompra, pBufala, pAcida, id = existente.Id });
                            actualizados++;
                        }
                        else
                        {
                            await conn.ExecuteAsync(@"
                                INSERT INTO TB_COMPANIAS (Nombre, Encargado, Telefono, Direccion, PrecioCompraLitroUSD, PrecioBufalaLitroUSD, PrecioAcidaLitroUSD, Activo, IsDeleted, CreatedAt)
                                VALUES (@nom, @enc, @tel, @dir, @pCompra, @pBufala, @pAcida, 1, 0, GETDATE())",
                                new { nom, enc, tel, dir, pCompra, pBufala, pAcida });
                            insertados++;
                        }
                    }
                    catch (Exception exItem)
                    {
                        errores.Add($"Error en compañía '{item.Nombre}': {exItem.Message}");
                    }
                }

                return Ok(new
                {
                    totalRecibidos = items.Count,
                    insertados,
                    actualizados,
                    errores
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error durante la importación de compañías: " + ex.Message });
            }
        }

        /// <summary>
        /// Importación masiva de Bancos
        /// Acepta payload en formato Array directo o { items: [...] }
        /// </summary>
        [HttpPost("importar/bancos")]
        [HttpPost("importar/TB_BANCOS")]
        public async Task<IActionResult> ImportarBancos([FromBody] JsonElement payload)
        {
            var items = ExtraerItems<ImportarBancoItemDto>(payload);
            if (items == null || items.Count == 0)
                return BadRequest(new { message = "No se recibieron bancos para importar." });

            int insertados = 0;
            int actualizados = 0;
            var errores = new List<string>();

            try
            {
                using var conn = CreateConnection();

                foreach (var item in items)
                {
                    try
                    {
                        if (string.IsNullOrWhiteSpace(item.Nombre) && string.IsNullOrWhiteSpace(item.Codigo))
                        {
                            errores.Add("Fila omitida: Nombre o Código de banco requerido.");
                            continue;
                        }

                        string nom = (item.Nombre ?? string.Empty).Trim();
                        string cod = (item.Codigo ?? string.Empty).Trim();

                        var existente = await conn.QueryFirstOrDefaultAsync<Banco>(
                            @"SELECT TOP 1 * FROM TB_BANCOS 
                              WHERE (@cod <> '' AND Codigo = @cod) 
                                 OR LOWER(RTRIM(LTRIM(Nombre))) = LOWER(RTRIM(LTRIM(@nom)))",
                            new { cod, nom });

                        if (existente != null)
                        {
                            await conn.ExecuteAsync(@"
                                UPDATE TB_BANCOS 
                                SET Nombre = CASE WHEN @nom <> '' THEN @nom ELSE Nombre END,
                                    Codigo = CASE WHEN @cod <> '' THEN @cod ELSE Codigo END,
                                    Activo = 1
                                WHERE Id = @id",
                                new { nom, cod, id = existente.Id });
                            actualizados++;
                        }
                        else
                        {
                            await conn.ExecuteAsync(@"
                                INSERT INTO TB_BANCOS (Codigo, Nombre, Activo)
                                VALUES (@cod, @nom, 1)",
                                new { cod, nom });
                            insertados++;
                        }
                    }
                    catch (Exception exItem)
                    {
                        errores.Add($"Error en banco '{item.Nombre}': {exItem.Message}");
                    }
                }

                return Ok(new
                {
                    totalRecibidos = items.Count,
                    insertados,
                    actualizados,
                    errores
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error durante la importación de bancos: " + ex.Message });
            }
        }

        /// <summary>
        /// Exportación de data completa de una entidad para respaldo o sincronización en Excel
        /// </summary>
        [HttpGet("exportar/{entidad}")]
        public async Task<IActionResult> ExportarData(string entidad)
        {
            try
            {
                using var conn = CreateConnection();
                var ent = (entidad ?? "").Trim().ToUpperInvariant().Replace("TB_", "");

                switch (ent)
                {
                    case "FINCAS":
                        var fincas = await conn.QueryAsync(@"
                            SELECT f.Id, f.Codigo, f.Nombre, f.Propietario, f.PropietarioId,
                                   p.Nombre AS PropietarioNombre, f.CedulaRIF, f.Telefono,
                                   b.Nombre AS BancoNombre, f.NumeroCuenta,
                                   c.Nombre AS CompaniaNombre,
                                   f.PrecioLitroUSD, f.PrecioLitroAcidaUSD, f.PrecioBufalaLitroUSD, f.TieneDosTiposLeche,
                                   f.Activo
                            FROM TB_FINCAS f
                            LEFT JOIN TB_PROPIETARIOS p ON f.PropietarioId = p.Id
                            LEFT JOIN TB_BANCOS b ON f.BancoId = b.Id
                            LEFT JOIN TB_COMPANIAS c ON f.CompaniaId = c.Id
                            WHERE f.IsDeleted = 0
                            ORDER BY f.Nombre ASC");
                        return Ok(fincas);

                    case "PROPIETARIOS":
                        var props = await conn.QueryAsync(@"
                            SELECT p.Id, p.Nombre, p.CedulaRIF, p.Telefono, p.Email,
                                   b.Nombre AS BancoNombre, p.NumeroCuenta, p.Observacion, p.Estado,
                                   (SELECT COUNT(1) FROM TB_FINCAS f WHERE f.PropietarioId = p.Id AND f.IsDeleted = 0) AS TotalFincasAsociadas
                            FROM TB_PROPIETARIOS p
                            LEFT JOIN TB_BANCOS b ON p.BancoId = b.Id
                            ORDER BY p.Nombre ASC");
                        return Ok(props);

                    case "COMPANIAS":
                        var comps = await conn.QueryAsync(@"
                            SELECT Id, Nombre, Encargado, Telefono, Direccion,
                                   PrecioCompraLitroUSD, PrecioBufalaLitroUSD, PrecioAcidaLitroUSD,
                                   DiaAperturaSemana, DiaCierreSemana, Activo
                            FROM TB_COMPANIAS
                            WHERE IsDeleted = 0
                            ORDER BY Nombre ASC");
                        return Ok(comps);

                    case "BANCOS":
                        var bancos = await conn.QueryAsync(@"
                            SELECT Id, Codigo, Nombre, Activo
                            FROM TB_BANCOS
                            ORDER BY Codigo ASC");
                        return Ok(bancos);

                    default:
                        return BadRequest(new { message = $"Entidad '{entidad}' no soportada para exportación." });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al exportar entidad: " + ex.Message });
            }
        }

        private static readonly HashSet<string> _entidadesPermitidas = new(StringComparer.OrdinalIgnoreCase)
        {
            "PROPIETARIOS", "FINCAS", "COMPANIAS", "BANCOS", "CHOFERES", "CAMIONES"
        };

        private static readonly HashSet<string> _mimePermitidos = new(StringComparer.OrdinalIgnoreCase)
        {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "text/csv",
            "text/csv; charset=utf-8",
            "application/pdf",
            "application/json",
            "text/plain"
        };

        /// <summary>
        /// Descarga la plantilla oficial en Excel (.xlsx) o CSV (.csv) con encabezado Content-Disposition explícito
        /// </summary>
        [HttpGet("descargar-plantilla/{entidad}")]
        [Authorize]
        public IActionResult DescargarPlantilla(string entidad, [FromQuery] string formato = "xlsx")
        {
            var ent = (entidad ?? "").Trim().ToUpperInvariant().Replace("TB_", "");
            if (!_entidadesPermitidas.Contains(ent))
            {
                return BadRequest(new { message = "Entidad de plantilla no permitida." });
            }
            var ext = formato.Trim().ToLowerInvariant() == "csv" ? "csv" : "xlsx";
            var filename = $"Plantilla_Importacion_{ent}.{ext}";

            var baseDir = AppContext.BaseDirectory;
            var currentDir = Directory.GetCurrentDirectory();

            string? targetPath = null;
            string[] possiblePaths = new[]
            {
                Path.Combine(currentDir, "wwwroot", "plantillas", filename),
                Path.Combine(baseDir, "wwwroot", "plantillas", filename),
                Path.Combine(currentDir, "Backend", "src", "Transporte.API", "wwwroot", "plantillas", filename),
                Path.Combine(currentDir, "Frontend", "plantillas", filename),
                Path.Combine(currentDir, "Frontend-React", "public", "plantillas", filename)
            };

            foreach (var p in possiblePaths)
            {
                if (System.IO.File.Exists(p))
                {
                    targetPath = p;
                    break;
                }
            }

            if (targetPath == null)
            {
                return NotFound(new { message = $"Plantilla no encontrada: {filename}" });
            }

            var contentType = ext == "xlsx"
                ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : "text/csv; charset=utf-8";

            var fileBytes = System.IO.File.ReadAllBytes(targetPath);
            return File(fileBytes, contentType, filename);
        }

        /// <summary>
        /// Recibe contenido en Base64 y lo devuelve como archivo adjunto nativo con Content-Disposition.
        /// </summary>
        [HttpPost("descargar-archivo")]
        [Authorize]
        public IActionResult DescargarArchivo([FromForm] string base64Content, [FromForm] string nombreArchivo, [FromForm] string? contentType)
        {
            if (string.IsNullOrWhiteSpace(base64Content) || string.IsNullOrWhiteSpace(nombreArchivo))
            {
                return BadRequest(new { message = "Contenido o nombre de archivo inválido." });
            }

            if (base64Content.Length > 20 * 1024 * 1024)
            {
                return BadRequest(new { message = "El archivo excede el tamaño máximo permitido (15 MB)." });
            }

            var type = string.IsNullOrWhiteSpace(contentType)
                ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : contentType.Trim();

            if (!_mimePermitidos.Contains(type))
            {
                return BadRequest(new { message = "Tipo de contenido no permitido." });
            }

            var safeFileName = Path.GetFileName(nombreArchivo.Trim());
            if (string.IsNullOrWhiteSpace(safeFileName))
            {
                return BadRequest(new { message = "Nombre de archivo inválido." });
            }

            try
            {
                var bytes = Convert.FromBase64String(base64Content);
                return File(bytes, type, safeFileName);
            }
            catch (FormatException)
            {
                return BadRequest(new { message = "Contenido Base64 inválido." });
            }
        }
    }

    // DTOs auxiliares para importación
    public class ImportarFincaItemDto
    {
        public string? Codigo { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string? Propietario { get; set; }
        public string? PropietarioNombre { get; set; }
        public int? PropietarioId { get; set; }
        public string? CedulaRIF { get; set; }
        public string? Telefono { get; set; }
        public int? BancoId { get; set; }
        public string? BancoNombre { get; set; }
        public string? NumeroCuenta { get; set; }
        public int? CompaniaId { get; set; }
        public string? CompaniaNombre { get; set; }
        public decimal PrecioLitroUSD { get; set; } = 0.4000m;
        public decimal PrecioLitroAcidaUSD { get; set; } = 0.0000m;
        public decimal? PrecioBufalaLitroUSD { get; set; }
        public bool TieneDosTiposLeche { get; set; } = false;
        public string? TipoLeche { get; set; } = "VACA";
        public int? TipoServicioId { get; set; } = 1;
    }

    public class ImportarPropietarioItemDto
    {
        public string Nombre { get; set; } = string.Empty;
        public string? CedulaRIF { get; set; }
        public string? Telefono { get; set; }
        public string? Email { get; set; }
        public int? BancoId { get; set; }
        public string? BancoNombre { get; set; }
        public string? NumeroCuenta { get; set; }
        public string? Observacion { get; set; }
    }

    public class ImportarCompaniaItemDto
    {
        public string Nombre { get; set; } = string.Empty;
        public string? Encargado { get; set; }
        public string? Telefono { get; set; }
        public string? Direccion { get; set; }
        public decimal PrecioCompraLitroUSD { get; set; } = 0.5000m;
        public decimal? PrecioBufalaLitroUSD { get; set; }
        public decimal? PrecioAcidaLitroUSD { get; set; }
    }

    public class ImportarBancoItemDto
    {
        public string? Codigo { get; set; }
        public string Nombre { get; set; } = string.Empty;
    }
}
