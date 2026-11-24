using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.API.Security;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ConfiguracionController : ControllerBase
    {
        private readonly IConfiguracionRepository _configRepo;

        public ConfiguracionController(IConfiguracionRepository configRepo)
        {
            _configRepo = configRepo;
        }

        // ====================================================================
        // PARÁMETROS DEL SISTEMA
        // ====================================================================
        [HttpGet("parametros")]
        public async Task<IActionResult> ObtenerParametros([FromQuery] string? categoria = null)
        {
            var parametros = await _configRepo.ObtenerParametrosAsync(categoria);
            return Ok(parametros);
        }

        [HttpGet("parametros/{clave}")]
        public async Task<IActionResult> ObtenerParametroPorClave([FromRoute] string clave)
        {
            var param = await _configRepo.ObtenerParametroPorClaveAsync(clave);
            if (param == null) return NotFound(new { message = $"Parámetro '{clave}' no encontrado." });
            return Ok(param);
        }

        [HttpPost("parametros")]
        [RequirePermission("CONFIGURACION_VER", "USUARIOS_VER")]
        public async Task<IActionResult> GuardarParametro([FromBody] GuardarParametroDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Clave))
                return BadRequest(new { message = "La clave del parámetro es obligatoria." });

            var username = User.Identity?.Name ?? "SISTEMA";
            var ok = await _configRepo.GuardarParametroAsync(dto, username);
            if (!ok) return BadRequest(new { message = "No se pudo guardar el parámetro." });

            return Ok(new { message = "Parámetro guardado exitosamente." });
        }

        [HttpDelete("parametros/{clave}")]
        [RequirePermission("CONFIGURACION_VER", "USUARIOS_VER")]
        public async Task<IActionResult> EliminarParametro([FromRoute] string clave)
        {
            var ok = await _configRepo.EliminarParametroAsync(clave);
            if (!ok) return NotFound(new { message = $"Parámetro '{clave}' no encontrado o no pudo ser eliminado." });
            return Ok(new { message = $"Parámetro '{clave}' eliminado exitosamente." });
        }

        // ====================================================================
        // TIPOS DE LECHE Y FACTORES DE PRECIO (CRUD)
        // ====================================================================
        [HttpGet("tipos-leche")]
        public async Task<IActionResult> ObtenerTiposLeche([FromQuery] bool soloActivos = false)
        {
            var tipos = await _configRepo.ObtenerTiposLecheAsync(soloActivos);
            return Ok(tipos);
        }

        [HttpGet("tipos-leche/{id}")]
        public async Task<IActionResult> ObtenerTipoLechePorId([FromRoute] int id)
        {
            var tipo = await _configRepo.ObtenerTipoLechePorIdAsync(id);
            if (tipo == null) return NotFound(new { message = "Tipo de leche no encontrado." });
            return Ok(tipo);
        }

        [HttpPost("tipos-leche")]
        [RequirePermission("CONFIGURACION_VER", "USUARIOS_VER")]
        public async Task<IActionResult> GuardarTipoLeche([FromBody] GuardarTipoLecheDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Codigo) || string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "El código y el nombre del tipo de leche son obligatorios." });

            var ok = await _configRepo.GuardarTipoLecheAsync(dto);
            if (!ok) return BadRequest(new { message = "No se pudo guardar el tipo de leche." });

            return Ok(new { message = "Tipo de leche guardado exitosamente." });
        }

        [HttpPut("tipos-leche/{id}/toggle")]
        [RequirePermission("CONFIGURACION_VER", "USUARIOS_VER")]
        public async Task<IActionResult> ToggleTipoLeche([FromRoute] int id, [FromBody] bool activo)
        {
            var tipo = await _configRepo.ObtenerTipoLechePorIdAsync(id);
            if (tipo == null) return NotFound(new { message = "Tipo de leche no encontrado." });

            var currentUserRole = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role)?.Value ?? "";
            var isSuperAdmin = currentUserRole.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase);

            if (tipo.Codigo.Equals("BUFALA", StringComparison.OrdinalIgnoreCase) && !isSuperAdmin)
            {
                return StatusCode(403, new { message = "Acceso denegado: La activación o desactivación de Búfala está licenciada y requiere permisos de SuperAdmin." });
            }

            var ok = await _configRepo.ToggleTipoLecheAsync(id, activo);
            if (!ok) return NotFound(new { message = "Tipo de leche no encontrado." });
            return Ok(new { message = $"Tipo de leche {(activo ? "activado" : "desactivado")} exitosamente." });
        }

        [HttpDelete("tipos-leche/{id}")]
        [RequirePermission("CONFIGURACION_VER", "USUARIOS_VER")]
        public async Task<IActionResult> EliminarTipoLeche([FromRoute] int id)
        {
            var ok = await _configRepo.EliminarTipoLecheAsync(id);
            if (!ok) return NotFound(new { message = "Tipo de leche no encontrado o no pudo ser eliminado." });
            return Ok(new { message = "Tipo de leche eliminado exitosamente." });
        }

        // ====================================================================
        // MENÚ DE NAVEGACIÓN DINÁMICO (Filtrado por Permisos del Usuario)
        // ====================================================================
        [HttpGet("modulos-menu")]
        public async Task<IActionResult> ObtenerModulosMenu()
        {
            var todosModulos = await _configRepo.ObtenerModulosMenuAsync(soloActivos: true);
            var rol = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role)?.Value ?? "";
            var permisosUsuario = User.Claims
                .Where(c => c.Type == "permiso")
                .Select(c => c.Value)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var esAdmin = rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase);

            var modulosPermitidos = todosModulos.Where(m =>
            {
                if (esAdmin) return true;
                if (string.IsNullOrWhiteSpace(m.PermisoRequerido)) return true;
                return permisosUsuario.Contains(m.PermisoRequerido);
            }).ToList();

            return Ok(modulosPermitidos);
        }

        [HttpGet("modulos-admin")]
        [RequirePermission("CONFIGURACION_VER", "USUARIOS_VER")]
        public async Task<IActionResult> ObtenerModulosAdmin()
        {
            var todosModulos = await _configRepo.ObtenerModulosMenuAsync(soloActivos: false);
            return Ok(todosModulos);
        }

        [HttpPut("modulos/{id}/toggle")]
        [RequirePermission("CONFIGURACION_VER", "USUARIOS_VER")]
        public async Task<IActionResult> ToggleModulo([FromRoute] int id, [FromBody] bool activo)
        {
            var currentUserRole = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role)?.Value ?? "";
            var isSuperAdmin = currentUserRole.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase);

            if (!isSuperAdmin)
            {
                return StatusCode(403, new { message = "Acceso denegado: Solo el SuperAdmin tiene permisos para activar o desactivar módulos del sistema." });
            }

            var ok = await _configRepo.ToggleModuloMenuAsync(id, activo);
            if (!ok) return NotFound(new { message = "Módulo no encontrado." });
            return Ok(new { message = $"Módulo {(activo ? "activado" : "desactivado")} exitosamente." });
        }

        // ====================================================================
        // REPORTES DINÁMICOS (Filtrado por Permisos)
        // ====================================================================
        [HttpGet("reportes-config")]
        public async Task<IActionResult> ObtenerReportesConfig([FromQuery] bool soloActivos = true)
        {
            var todosReportes = await _configRepo.ObtenerReportesConfigAsync(soloActivos: soloActivos);
            var rol = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role)?.Value ?? "";
            var permisosUsuario = User.Claims
                .Where(c => c.Type == "permiso")
                .Select(c => c.Value)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var esAdmin = rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase);

            var reportesPermitidos = todosReportes.Where(r =>
            {
                if (esAdmin) return true;
                if (string.IsNullOrWhiteSpace(r.PermisoRequerido)) return true;
                return permisosUsuario.Contains(r.PermisoRequerido);
            }).ToList();

            return Ok(reportesPermitidos);
        }

        [HttpPut("reportes/{id}/toggle")]
        [RequirePermission("CONFIGURACION_VER", "USUARIOS_VER")]
        public async Task<IActionResult> ToggleReporte([FromRoute] int id, [FromBody] bool activo)
        {
            var ok = await _configRepo.ToggleReporteConfigAsync(id, activo);
            if (!ok) return NotFound(new { message = "Reporte no encontrado." });
            return Ok(new { message = $"Reporte {(activo ? "activado" : "desactivado")} exitosamente." });
        }

        // ====================================================================
        // WIDGETS DEL DASHBOARD (Filtrado por Permisos)
        // ====================================================================
        [HttpGet("widgets-dashboard")]
        public async Task<IActionResult> ObtenerWidgetsDashboard([FromQuery] bool soloActivos = true)
        {
            var todosWidgets = await _configRepo.ObtenerWidgetsDashboardAsync(soloActivos: soloActivos);
            var rol = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role)?.Value ?? "";
            var permisosUsuario = User.Claims
                .Where(c => c.Type == "permiso")
                .Select(c => c.Value)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var esAdmin = rol.Contains("ADMIN", StringComparison.OrdinalIgnoreCase);

            var widgetsPermitidos = todosWidgets.Where(w =>
            {
                if (esAdmin) return true;
                if (string.IsNullOrWhiteSpace(w.PermisoRequerido)) return true;
                return permisosUsuario.Contains(w.PermisoRequerido);
            }).ToList();

            return Ok(widgetsPermitidos);
        }

        [HttpPut("widgets/{id}/toggle")]
        [RequirePermission("CONFIGURACION_VER", "USUARIOS_VER")]
        public async Task<IActionResult> ToggleWidget([FromRoute] int id, [FromBody] bool activo)
        {
            var ok = await _configRepo.ToggleWidgetDashboardAsync(id, activo);
            if (!ok) return NotFound(new { message = "Widget no encontrado." });
            return Ok(new { message = $"Widget {(activo ? "activado" : "desactivado")} exitosamente." });
        }
    }
}
