using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthRepository _authRepository;
        private readonly IUsuariosRepository _usuariosRepository;
        private readonly IConfiguration _config;
        private readonly Transporte.Core.Interfaces.ITenantService _tenantService;

        public AuthController(
            IAuthRepository authRepository, 
            IUsuariosRepository usuariosRepository,
            IConfiguration config,
            Transporte.Core.Interfaces.ITenantService tenantService)
        {
            _authRepository = authRepository;
            _usuariosRepository = usuariosRepository;
            _config = config;
            _tenantService = tenantService;
        }

        [HttpGet("tenant")]
        [AllowAnonymous]
        public IActionResult GetTenantInfo()
        {
            return Ok(new
            {
                codigo = _tenantService.GetTenantCode(),
                nombre = _tenantService.GetTenantName(),
                modulos = _tenantService.GetModulosActivos()
            });
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] LoginDto dto)
        {
            var user = await _authRepository.ObtenerPorUsernameAsync(dto.Username);
            if (user == null)
            {
                return Unauthorized(new { message = "Usuario o contraseÃ±a invÃ¡lidos." });
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
            var secretKey = _config["Jwt:SecretKey"] ?? _config["Jwt:Key"] ?? "ClaveSecretaSuperSeguraParaRutasDeLeche2026_JWT_Token_Key_MuyLargaParaHmacSha256!";
            var key = Encoding.UTF8.GetBytes(secretKey);
            
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Role, user.Rol)
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

            return Ok(new LoginResponseDto
            {
                Id = user.Id,
                Username = user.Username,
                NombreCompleto = user.NombreCompleto,
                Rol = user.Rol,
                PermisoCrearViaje = user.PermisoCrearViaje,
                Token = tokenString,
                Permisos = permisos,
                ModulosHabilitados = _tenantService.GetModulosActivos(),
                EmpresaCodigo = _tenantService.GetTenantCode(),
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
            if (user == null) return NotFound();

            var permisos = await _authRepository.ObtenerPermisosUsuarioAsync(user.Id);

            return Ok(new
            {
                id = user.Id,
                username = user.Username,
                nombreCompleto = user.NombreCompleto,
                rol = user.Rol,
                permisoCrearViaje = user.PermisoCrearViaje,
                permisos,
                modulosHabilitados = _tenantService.GetModulosActivos(),
                empresaCodigo = _tenantService.GetTenantCode(),
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

            // Generar código único de 6 dígitos numéricos (ej. 849215)
            var random = new Random();
            string codigo = random.Next(100000, 999999).ToString();

            // Guardar en DB_SAAS_MASTER para resolución ciega e inmediata
            string masterHost = Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER") == "true" || Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Production" 
                ? "tcp:sql_instancia,1433" 
                : "84.247.178.194,1433";
            string masterConn = $"Server={masterHost};Database=DB_SAAS_MASTER;User Id=sa;Password=sql_HO_2026!;TrustServerCertificate=True;";
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
        public async Task<IActionResult> VincularDispositivo([FromBody] VincularDispositivoDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Codigo))
                return BadRequest(new { message = "El código de vinculación es requerido." });

            string cleanCode = dto.Codigo.Trim().Replace("-", "").Replace(" ", "");

            string masterHost = Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER") == "true" || Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Production" 
                ? "tcp:sql_instancia,1433" 
                : "84.247.178.194,1433";
            string masterConn = $"Server={masterHost};Database=DB_SAAS_MASTER;User Id=sa;Password=sql_HO_2026!;TrustServerCertificate=True;";
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

            // Marcar código como usado
            await db.ExecuteAsync(@"
                UPDATE TB_DISPOSITIVOS_VINCULACION 
                SET Usado = 1, DeviceId = @DeviceId, FechaVinculacion = GETDATE()
                WHERE Id = @vincId",
                new { vincId, DeviceId = dto.DeviceId ?? "App Móvil" });

            // Obtener nombre comercial
            var empresa = await db.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT NombreComercial FROM TB_EMPRESAS WHERE Codigo = @tenantCode",
                new { tenantCode });
            string empresaNombre = empresa?.NombreComercial ?? tenantCode;

            // Generar JWT firmado
            var tokenHandler = new JwtSecurityTokenHandler();
            var secretKey = _config["Jwt:SecretKey"] ?? _config["Jwt:Key"] ?? "ClaveSecretaSuperSeguraParaRutasDeLeche2026_JWT_Token_Key_MuyLargaParaHmacSha256!";
            var key = Encoding.UTF8.GetBytes(secretKey);

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, usuarioId.ToString()),
                new Claim(ClaimTypes.Name, username),
                new Claim(ClaimTypes.Role, rol),
                new Claim("empresa_codigo", tenantCode),
                new Claim("dispositivo_movil", "true")
            };

            var permisos = rol == "ADMIN" || rol == "SUPERADMIN"
                ? new[] { "DASHBOARD", "RUTAS_ALL", "MERMAS", "SEMANAS", "LIQUIDACION", "CATALOGOS", "BCV" }
                : (rol == "CHOFER" ? new[] { "RUTAS_CAPTURAR", "RUTAS_VER" } : new[] { "RUTAS_VER" });

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

            var usuarioDb = await _usuariosRepository.ObtenerUsuarioPorIdAsync(usuarioId);
            bool permisoCrear = usuarioDb?.PermisoCrearViaje ?? false;

            return Ok(new VincularDispositivoResponseDto
            {
                Token = tokenString,
                EmpresaCodigo = tenantCode,
                EmpresaNombre = empresaNombre,
                EmpresaLogo = null,
                Id = usuarioId,
                Username = username,
                NombreCompleto = nombreCompleto,
                Rol = rol,
                PermisoCrearViaje = permisoCrear,
                CamionId = camionId,
                PlacaCamion = placaCamion,
                CapacidadTanqueLitros = capacidadTanqueLitros,
                Permisos = permisos,
                ModulosHabilitados = new[] { "MOD_LOGISTICA_RUTAS" }
            });
        }
    }
}