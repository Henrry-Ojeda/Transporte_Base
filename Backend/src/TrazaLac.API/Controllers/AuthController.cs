using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using TrazaLac.Core.DTOs;
using TrazaLac.Core.Security;
using TrazaLac.Infrastructure.Repositories;

namespace TrazaLac.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthRepository _authRepository;
        private readonly IUsuariosRepository _usuariosRepository;
        private readonly ICatalogosRepository _catalogosRepository;
        private readonly IConfiguration _config;
        private readonly TrazaLac.Core.Interfaces.ITenantService _tenantService;

        public AuthController(
            IAuthRepository authRepository, 
            IUsuariosRepository usuariosRepository,
            ICatalogosRepository catalogosRepository,
            IConfiguration config,
            TrazaLac.Core.Interfaces.ITenantService tenantService)
        {
            _authRepository = authRepository;
            _usuariosRepository = usuariosRepository;
            _catalogosRepository = catalogosRepository;
            _config = config;
            _tenantService = tenantService;
        }

        [HttpGet("tenant")]
        [AllowAnonymous]
        public async Task<IActionResult> GetTenantInfo()
        {
            var config = await _catalogosRepository.ObtenerEmpresaConfigAsync();
            return Ok(new
            {
                codigo = _tenantService.GetTenantCode(),
                nombre = _tenantService.GetTenantName(),
                logoUrl = config?.LogoUrl,
                modulos = _tenantService.GetModulosActivos()
            });
        }

        [HttpPost("login")]
        [AllowAnonymous]
        [EnableRateLimiting("auth-strict")]
        public async Task<IActionResult> Login([FromBody] LoginDto dto)
        {
            var user = await _authRepository.ObtenerPorUsernameAsync(dto.Username);
            if (user == null)
            {
                // Verificar si el usuario existe pero está inactivo (despedido/desactivado)
                using var checkDb = new SqlConnection(_tenantService.GetConnectionString());
                var existeInactivo = await checkDb.QueryFirstOrDefaultAsync<bool?>(
                    "SELECT CASE WHEN EXISTS (SELECT 1 FROM TB_USUARIOS WHERE LOWER(Username) = LOWER(@u) AND Activo = 0) THEN 1 ELSE 0 END",
                    new { u = (dto.Username ?? "").Trim() });
                if (existeInactivo == true)
                {
                    return StatusCode(403, new { message = "No tienes permisos para ingresar. Tu usuario está inactivo.", usuarioInactivo = true });
                }
                return Unauthorized(new { message = "Usuario o contraseña inválidos." });
            }

            bool passwordValida = false;
            try
            {
                if (!string.IsNullOrEmpty(user.PasswordHash) && 
                    (user.PasswordHash.StartsWith("$2a$") || user.PasswordHash.StartsWith("$2b$") || user.PasswordHash.StartsWith("$2y$")))
                {
                    passwordValida = BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash);
                }
                else
                {
                    passwordValida = (!string.IsNullOrEmpty(dto.Password) && dto.Password == user.PasswordHash);
                    if (passwordValida)
                    {
                        // Auto-upgrade silencioso de contraseña legacy en texto plano a BCrypt
                        try
                        {
                            var upgradedHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);
                            using var upgradeDb = new SqlConnection(_tenantService.GetConnectionString());
                            await upgradeDb.ExecuteAsync(
                                "UPDATE TB_USUARIOS SET PasswordHash = @hash WHERE Id = @id",
                                new { hash = upgradedHash, id = user.Id });
                        }
                        catch { /* no bloquear login si falla actualización */ }
                    }
                }
            }
            catch
            {
                passwordValida = false;
            }

            if (!passwordValida)
            {
                return Unauthorized(new { message = "Usuario o contraseña inválidos." });
            }

            var permisos = (user.Rol == "ADMIN" || user.Rol == "SUPERADMIN")
                ? new[] { "DASHBOARD", "RUTAS_ALL", "MERMAS", "SEMANAS", "LIQUIDACION", "CATALOGOS", "BCV" }
                : (await _authRepository.ObtenerPermisosUsuarioAsync(user.Id));

            var tokenHandler = new JwtSecurityTokenHandler();
            var secretKey = _config["Jwt:SecretKey"] ?? _config["Jwt:Key"] ?? Environment.GetEnvironmentVariable("JWT_SECRET_KEY");
            if (string.IsNullOrWhiteSpace(secretKey) || secretKey.StartsWith("__INYECTAR", StringComparison.OrdinalIgnoreCase))
            {
                if (!Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")?.Equals("Development", StringComparison.OrdinalIgnoreCase) == true)
                {
                    return StatusCode(500, new { message = "Jwt:SecretKey no está configurado en el servidor." });
                }
                secretKey = "DevLocalOnly_TransporteJwtSecretKey_Minimum32Chars!";
            }
            var key = Encoding.UTF8.GetBytes(secretKey);
            
            string tenantCode = _tenantService.GetTenantCode();
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Role, user.Rol),
                new Claim("empresa_codigo", tenantCode)
            };

            foreach (var perm in permisos)
            {
                claims.Add(new Claim("permiso", perm));
            }

            var issuer = _config["Jwt:Issuer"] ?? "TransporteAPI";
            var audience = _config["Jwt:Audience"] ?? "TransporteApp";

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddDays(7),
                Issuer = issuer,
                Audience = audience,
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };

            var token = tokenHandler.CreateToken(tokenDescriptor);
            var tokenString = tokenHandler.WriteToken(token);

            bool isHijo = !string.IsNullOrEmpty(tenantCode) && !tenantCode.Equals("PRODUCTO_BASE", StringComparison.OrdinalIgnoreCase);
            bool isSuperAdminReal = user.Rol.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase);
            string rolDisplay = isHijo && isSuperAdminReal ? "ADMIN" : user.Rol;

            return Ok(new LoginResponseDto
            {
                Id = user.Id,
                Username = user.Username,
                NombreCompleto = user.NombreCompleto,
                Rol = rolDisplay,
                EsSuperAdmin = isSuperAdminReal,
                PermisoCrearViaje = user.PermisoCrearViaje,
                Token = tokenString,
                Permisos = permisos,
                ModulosHabilitados = _tenantService.GetModulosActivos(),
                EmpresaCodigo = tenantCode,
                EmpresaNombre = _tenantService.GetTenantName()
            });
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<IActionResult> GetProfile()
        {
            var username = User.Identity?.Name;
            if (string.IsNullOrEmpty(username)) return Unauthorized();

            var user = await _authRepository.ObtenerPorUsernameAsync(username);
            if (user == null)
            {
                return StatusCode(403, new { message = "No tienes permisos para acceder. Tu usuario está inactivo.", usuarioInactivo = true });
            }

            var permisos = await _authRepository.ObtenerPermisosUsuarioAsync(user.Id);

            string tenantCodeMe = _tenantService.GetTenantCode();
            bool isHijoMe = !string.IsNullOrEmpty(tenantCodeMe) && !tenantCodeMe.Equals("PRODUCTO_BASE", StringComparison.OrdinalIgnoreCase);
            bool isSuperAdminRealMe = user.Rol.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase);
            string rolDisplayMe = isHijoMe && isSuperAdminRealMe ? "ADMIN" : user.Rol;

            return Ok(new
            {
                id = user.Id,
                username = user.Username,
                nombreCompleto = user.NombreCompleto,
                rol = rolDisplayMe,
                esSuperAdmin = isSuperAdminRealMe,
                permisoCrearViaje = user.PermisoCrearViaje,
                permisos,
                modulosHabilitados = _tenantService.GetModulosActivos(),
                empresaCodigo = tenantCodeMe,
                empresaNombre = _tenantService.GetTenantName()
            });
        }

        [HttpGet("perfil")]
        [Authorize]
        public async Task<IActionResult> ObtenerMiPerfil()
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!int.TryParse(userIdStr, out int userId)) return Unauthorized();

            var perfil = await _usuariosRepository.ObtenerPerfilAsync(userId);
            if (perfil == null) return NotFound(new { message = "Perfil de usuario no encontrado." });

            string tenantCodePerfil = _tenantService.GetTenantCode();
            bool isHijoPerfil = !string.IsNullOrEmpty(tenantCodePerfil) && !tenantCodePerfil.Equals("PRODUCTO_BASE", StringComparison.OrdinalIgnoreCase);
            if (isHijoPerfil && string.Equals(perfil.Rol, "SUPERADMIN", StringComparison.OrdinalIgnoreCase))
            {
                perfil.Rol = "ADMIN";
            }
            return Ok(perfil);
        }

        [HttpPut("perfil")]
        [Authorize]
        public async Task<IActionResult> ActualizarMiPerfil([FromBody] ActualizarPerfilDto dto)
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!int.TryParse(userIdStr, out int userId)) return Unauthorized();

            var (ok, msg) = await _usuariosRepository.ActualizarPerfilAsync(userId, dto);
            if (!ok) return BadRequest(new { message = msg });

            var perfilActualizado = await _usuariosRepository.ObtenerPerfilAsync(userId);
            if (perfilActualizado != null)
            {
                string tenantCodePerfil = _tenantService.GetTenantCode();
                bool isHijoPerfil = !string.IsNullOrEmpty(tenantCodePerfil) && !tenantCodePerfil.Equals("PRODUCTO_BASE", StringComparison.OrdinalIgnoreCase);
                if (isHijoPerfil && string.Equals(perfilActualizado.Rol, "SUPERADMIN", StringComparison.OrdinalIgnoreCase))
                {
                    perfilActualizado.Rol = "ADMIN";
                }
            }
            return Ok(new { success = true, message = msg, perfil = perfilActualizado });
        }

        // =========================================================================
        // VINCULACIÓN SEGURA DE DISPOSITIVOS MÓVILES (DEVICE PAIRING CODE)
        // =========================================================================

        [HttpPost("generar-vinculacion")]
        [Authorize(Roles = "ADMIN,SUPERADMIN")]
        public async Task<IActionResult> GenerarCodigoVinculacion([FromBody] GenerarCodigoVinculacionDto dto)
        {
            var user = await _usuariosRepository.ObtenerUsuarioPorIdAsync(dto.UsuarioId);
            if (user == null) return NotFound(new { message = "Usuario no encontrado." });

            string tenantCode = _tenantService.GetTenantCode();
            string tenantName = _tenantService.GetTenantName();

            // Generar código único criptográficamente seguro de 6 dígitos numéricos (ej. 849215)
            string codigo = System.Security.Cryptography.RandomNumberGenerator.GetInt32(100000, 1000000).ToString();

            // Guardar en DB_SAAS_MASTER desde configuración / variable de entorno (sin credenciales hardcodeadas)
            string masterConn = _config.GetConnectionString("SaasMaster")
                ?? Environment.GetEnvironmentVariable("SAAS_MASTER_CONNECTION")
                ?? throw new InvalidOperationException("ConnectionStrings:SaasMaster o SAAS_MASTER_CONNECTION no está configurada.");
            using var db = new Microsoft.Data.SqlClient.SqlConnection(masterConn);
            
            // Vigencia de 48 horas
            var expira = DateTime.UtcNow.AddHours(48);

            await db.ExecuteAsync(@"
                INSERT INTO TB_DISPOSITIVOS_VINCULACION 
                (CodigoVinculacion, EmpresaCodigo, UsuarioId, Username, NombreCompleto, Rol, CamionId, PlacaCamion, CapacidadLitros, Usado, FechaExpiracion, CreatedAt)
                VALUES 
                (@codigo, @tenantCode, @UsuarioId, @Username, @NombreCompleto, @Rol, @CamionId, @Placa, @CapacidadLitros, 0, @expira, GETDATE())",
                new
                {
                    codigo,
                    tenantCode,
                    UsuarioId = user.Id,
                    Username = user.Username,
                    NombreCompleto = user.NombreCompleto,
                    Rol = user.Rol,
                    CamionId = user.Camion?.Id,
                    Placa = user.Camion?.Placa,
                    CapacidadLitros = user.Camion?.CapacidadLitros ?? 0,
                    expira
                });

            return Ok(new CodigoVinculacionResponseDto
            {
                Codigo = codigo,
                FechaExpiracion = expira,
                NombreCompleto = user.NombreCompleto,
                Username = user.Username,
                Rol = user.Rol,
                EmpresaCodigo = tenantCode,
                EmpresaNombre = tenantName
            });
        }

        [HttpPost("vincular-dispositivo")]
        [AllowAnonymous]
        [EnableRateLimiting("auth-strict")]
        public async Task<IActionResult> VincularDispositivo([FromBody] VincularDispositivoDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Codigo))
                return BadRequest(new { message = "El código de vinculación es requerido." });

            string cleanCode = dto.Codigo.Trim().Replace("-", "").Replace(" ", "");

            string masterConn = _config.GetConnectionString("SaasMaster")
                ?? Environment.GetEnvironmentVariable("SAAS_MASTER_CONNECTION")
                ?? throw new InvalidOperationException("ConnectionStrings:SaasMaster o SAAS_MASTER_CONNECTION no está configurada.");
            using var db = new Microsoft.Data.SqlClient.SqlConnection(masterConn);

            var registro = await db.QueryFirstOrDefaultAsync<dynamic>(@"
                SELECT TOP 1 * FROM TB_DISPOSITIVOS_VINCULACION 
                WHERE CodigoVinculacion = @cleanCode AND Usado = 0 AND FechaExpiracion >= GETDATE()",
                new { cleanCode });

            if (registro == null)
            {
                return BadRequest(new { message = "Código de vinculación inválido, expirado o ya utilizado." });
            }

            int vincId = (int)registro.Id;
            string tenantCode = (string)registro.EmpresaCodigo;
            int usuarioId = (int)registro.UsuarioId;
            string username = (string)registro.Username;
            string nombreCompleto = (string)registro.NombreCompleto;
            string rol = (string)registro.Rol;
            int? camionId = (int?)registro.CamionId;
            string? placaCamion = (string?)registro.PlacaCamion;
            decimal capacidadTanqueLitros = Convert.ToDecimal(registro.CapacidadLitros ?? 0);

            // Obtener datos del tenant destino desde DB_SAAS_MASTER
            var empresa = await db.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT Id, NombreComercial, CadenaConexion FROM TB_EMPRESAS WHERE Codigo = @tenantCode",
                new { tenantCode });
            string empresaNombre = empresa?.NombreComercial ?? tenantCode;
            string? tenantConnStr = empresa?.CadenaConexion != null
                ? Multitenancy.TenantService.AdjustConnectionStringForEnvironment((string)empresa.CadenaConexion)
                : null;

            List<string> modulosTenant = new();
            if (empresa?.Id != null)
            {
                int empId = (int)empresa.Id;
                var mods = await db.QueryAsync<string>(
                    "SELECT ModuloCodigo FROM TB_EMPRESA_MODULOS WHERE EmpresaId = @empId AND Habilitado = 1",
                    new { empId });
                modulosTenant = mods.ToList();
            }

            bool permisoCrear = false;
            bool usuarioActivo = true;
            string? logoUrl = null;
            List<string> permisosDb = new();
            if (!string.IsNullOrWhiteSpace(tenantConnStr))
            {
                using var tenantDb = new Microsoft.Data.SqlClient.SqlConnection(tenantConnStr);
                var uEstado = await tenantDb.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT Activo, PermisoCrearViaje FROM TB_USUARIOS WHERE Id = @usuarioId",
                    new { usuarioId });
                usuarioActivo = uEstado != null && (bool)(uEstado.Activo ?? false);
                permisoCrear = uEstado != null && (bool)(uEstado.PermisoCrearViaje ?? false);
                logoUrl = await tenantDb.QueryFirstOrDefaultAsync<string?>(
                    "SELECT TOP 1 LogoUrl FROM TB_EMPRESA_CONFIG");

                // Leer permisos 100% dinámicos desde TB_ROL_PERMISOS / TB_PERMISOS sincronizados con módulos SaaS_Manager
                try
                {
                    var pRows = await tenantDb.QueryAsync<(string PermisoCodigo, string ModuloCodigo)>(@"
                        SELECT DISTINCT p.Codigo AS PermisoCodigo, m.Codigo AS ModuloCodigo
                        FROM TB_USUARIOS u
                        INNER JOIN TB_ROL_PERMISOS rp
                            ON (u.RolId = rp.RolId OR (u.RolId IS NULL AND rp.RolId = (SELECT TOP 1 Id FROM TB_ROLES WHERE Codigo = u.Rol)))
                        INNER JOIN TB_PERMISOS p ON rp.PermisoId = p.Id
                        INNER JOIN TB_MODULOS m ON p.ModuloId = m.Id
                        WHERE u.Id = @usuarioId AND rp.Concedido = 1 AND p.Activo = 1 AND m.Activo = 1",
                        new { usuarioId });
                    permisosDb = pRows
                        .Where(r => SaasModulePermissionMap.IsModuloRbacHabilitado(r.ModuloCodigo, modulosTenant))
                        .Select(r => r.PermisoCodigo)
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();
                }
                catch { /* fallback tolerante si el tenant aún no tiene TB_ROL_PERMISOS */ }
            }
            else
            {
                var usuarioDb = await _usuariosRepository.ObtenerUsuarioPorIdAsync(usuarioId);
                usuarioActivo = usuarioDb != null && usuarioDb.Activo;
                permisoCrear = usuarioDb?.PermisoCrearViaje ?? false;
                var empresaCfg = await _catalogosRepository.ObtenerEmpresaConfigAsync();
                logoUrl = empresaCfg?.LogoUrl;
                permisosDb = (await _authRepository.ObtenerPermisosUsuarioAsync(usuarioId)).ToList();
            }

            if (!usuarioActivo)
            {
                return StatusCode(403, new { message = "No tienes permisos para acceder. Tu usuario está inactivo.", usuarioInactivo = true });
            }

            var permisos = permisosDb.Count > 0
                ? permisosDb.ToArray()
                : (rol == "ADMIN" || rol == "SUPERADMIN"
                    ? new[] { "ADMIN_TOTAL", "DASHBOARD", "RUTAS_ALL", "MERMAS", "SEMANAS", "LIQUIDACION", "CATALOGOS", "BCV" }
                    : new[] { "RUTAS_CAPTURAR", "RUTAS_VER" });

            // Generar JWT firmado
            var tokenHandler = new JwtSecurityTokenHandler();
            var secretKey = _config["Jwt:SecretKey"] ?? _config["Jwt:Key"] ?? Environment.GetEnvironmentVariable("JWT_SECRET_KEY");
            if (string.IsNullOrWhiteSpace(secretKey) || secretKey.StartsWith("__INYECTAR", StringComparison.OrdinalIgnoreCase))
            {
                if (!Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")?.Equals("Development", StringComparison.OrdinalIgnoreCase) == true)
                {
                    return StatusCode(500, new { message = "Jwt:SecretKey no está configurado en el servidor." });
                }
                secretKey = "DevLocalOnly_TransporteJwtSecretKey_Minimum32Chars!";
            }
            var key = Encoding.UTF8.GetBytes(secretKey);

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, usuarioId.ToString()),
                new Claim(ClaimTypes.Name, username),
                new Claim(ClaimTypes.Role, rol),
                new Claim("empresa_codigo", tenantCode),
                new Claim("dispositivo_movil", "true")
            };

            foreach (var perm in permisos)
            {
                claims.Add(new Claim("permiso", perm));
            }

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddDays(365), // Sesión móvil permanente
                Issuer = _config["Jwt:Issuer"] ?? "TransporteAPI",
                Audience = _config["Jwt:Audience"] ?? "TransporteApp",
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };

            var token = tokenHandler.CreateToken(tokenDescriptor);
            var tokenString = tokenHandler.WriteToken(token);

            // Marcar código como usado solo cuando toda la consulta fue exitosa
            await db.ExecuteAsync(@"
                UPDATE TB_DISPOSITIVOS_VINCULACION 
                SET Usado = 1, DeviceId = @DeviceId, FechaVinculacion = GETDATE()
                WHERE Id = @vincId",
                new { vincId, DeviceId = dto.DeviceId ?? "App Móvil" });

            return Ok(new VincularDispositivoResponseDto
            {
                Token = tokenString,
                EmpresaCodigo = tenantCode,
                EmpresaNombre = empresaNombre,
                EmpresaLogo = logoUrl,
                Id = usuarioId,
                Username = username,
                NombreCompleto = nombreCompleto,
                Rol = rol,
                PermisoCrearViaje = permisoCrear,
                CamionId = camionId,
                PlacaCamion = placaCamion,
                CapacidadTanqueLitros = capacidadTanqueLitros,
                Permisos = permisos,
                ModulosHabilitados = modulosTenant.Any()
                    ? modulosTenant
                    : (_tenantService.GetModulosActivos().Any() ? _tenantService.GetModulosActivos() : new[] { "MOD_LOGISTICA_RUTAS", "MOD_APP_MOVIL" })
            });
        }
    }
}