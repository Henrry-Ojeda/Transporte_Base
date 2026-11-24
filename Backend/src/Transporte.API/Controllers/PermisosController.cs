using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;
using Transporte.API.Security;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [RequirePermission("PERMISOS_VER", "USUARIOS_VER")]
    public class PermisosController : ControllerBase
    {
        private readonly IPermisosRepository _permisosRepo;

        public PermisosController(IPermisosRepository permisosRepo)
        {
            _permisosRepo = permisosRepo;
        }

        // ====================================================================
        // MÓDULOS
        // ====================================================================
        [HttpGet("modulos")]
        public async Task<IActionResult> ObtenerModulos([FromQuery] bool soloActivos = false)
        {
            var modulos = await _permisosRepo.ObtenerModulosAsync(soloActivos);
            return Ok(modulos);
        }

        [HttpGet("modulos/{id}")]
        public async Task<IActionResult> ObtenerModuloPorId([FromRoute] int id)
        {
            var modulo = await _permisosRepo.ObtenerModuloPorIdAsync(id);
            if (modulo == null) return NotFound(new { message = "Módulo no encontrado." });
            return Ok(modulo);
        }

        [HttpPost("modulos")]
        public async Task<IActionResult> CrearModulo([FromBody] CrearModuloDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Codigo))
                return BadRequest(new { message = "El código del módulo es obligatorio." });

            if (string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "El nombre del módulo es obligatorio." });

            try
            {
                var id = await _permisosRepo.CrearModuloAsync(dto);
                return Ok(new { id, message = "Módulo creado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message.Contains("UQ_") || ex.Message.Contains("duplicate") || ex.Message.Contains("UNIQUE")
                    ? "Ya existe un módulo con este código."
                    : $"Error al crear módulo: {ex.Message}" });
            }
        }

        [HttpPut("modulos/{id}")]
        public async Task<IActionResult> ActualizarModulo([FromRoute] int id, [FromBody] CrearModuloDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Codigo) || string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "Código y Nombre son requeridos." });

            var ok = await _permisosRepo.ActualizarModuloAsync(id, dto);
            if (!ok) return NotFound(new { message = "Módulo no encontrado o no modificado." });
            return Ok(new { message = "Módulo actualizado exitosamente." });
        }

        [HttpDelete("modulos/{id}")]
        public async Task<IActionResult> EliminarModulo([FromRoute] int id)
        {
            var ok = await _permisosRepo.EliminarModuloAsync(id);
            if (!ok) return NotFound(new { message = "Módulo no encontrado." });
            return Ok(new { message = "Módulo eliminado exitosamente." });
        }

        // ====================================================================
        // PERMISOS ATÓMICOS
        // ====================================================================
        [HttpGet]
        public async Task<IActionResult> ObtenerPermisos([FromQuery] int? moduloId = null, [FromQuery] bool soloActivos = false)
        {
            var permisos = await _permisosRepo.ObtenerPermisosAsync(moduloId, soloActivos);
            return Ok(permisos);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerPermisoPorId([FromRoute] int id)
        {
            var permiso = await _permisosRepo.ObtenerPermisoPorIdAsync(id);
            if (permiso == null) return NotFound(new { message = "Permiso no encontrado." });
            return Ok(permiso);
        }

        [HttpPost]
        public async Task<IActionResult> CrearPermiso([FromBody] CrearPermisoDto dto)
        {
            if (dto.ModuloId <= 0)
                return BadRequest(new { message = "Debe seleccionar un módulo válido." });

            if (string.IsNullOrWhiteSpace(dto.Codigo))
                return BadRequest(new { message = "El código del permiso es obligatorio." });

            if (string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "El nombre del permiso es obligatorio." });

            try
            {
                var id = await _permisosRepo.CrearPermisoAsync(dto);
                return Ok(new { id, message = "Permiso creado y registrado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message.Contains("UQ_") || ex.Message.Contains("duplicate") || ex.Message.Contains("UNIQUE")
                    ? "Ya existe un permiso con este código."
                    : $"Error al crear permiso: {ex.Message}" });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> ActualizarPermiso([FromRoute] int id, [FromBody] CrearPermisoDto dto)
        {
            if (dto.ModuloId <= 0 || string.IsNullOrWhiteSpace(dto.Codigo) || string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "Módulo, Código y Nombre son obligatorios." });

            var ok = await _permisosRepo.ActualizarPermisoAsync(id, dto);
            if (!ok) return NotFound(new { message = "Permiso no encontrado o no modificado." });
            return Ok(new { message = "Permiso actualizado exitosamente." });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> EliminarPermiso([FromRoute] int id)
        {
            var ok = await _permisosRepo.EliminarPermisoAsync(id);
            if (!ok) return NotFound(new { message = "Permiso no encontrado." });
            return Ok(new { message = "Permiso eliminado exitosamente." });
        }

        // ====================================================================
        // MATRIZ DE ASIGNACIÓN DE PERMISOS (RBAC)
        // ====================================================================
        [HttpGet("matriz")]
        public async Task<IActionResult> ObtenerMatrizCompleta()
        {
            var matriz = await _permisosRepo.ObtenerMatrizCompletaAsync();
            return Ok(matriz);
        }

        [HttpGet("rol/{rolId}")]
        public async Task<IActionResult> ObtenerPermisosPorRol([FromRoute] int rolId)
        {
            var permisos = await _permisosRepo.ObtenerPermisosPorRolAsync(rolId);
            return Ok(permisos);
        }

        [HttpPost("matriz/guardar-rol")]
        public async Task<IActionResult> GuardarRolPermisos([FromBody] GuardarRolPermisosDto dto)
        {
            if (dto.RolId <= 0)
                return BadRequest(new { message = "Debe especificar un Rol válido." });

            await _permisosRepo.GuardarRolPermisosAsync(dto.RolId, dto.PermisosIds ?? new List<int>());
            return Ok(new { message = "Matriz de permisos del rol actualizada exitosamente." });
        }

        [HttpPost("matriz/toggle")]
        public async Task<IActionResult> ToggleRolPermiso([FromBody] ToggleRolPermisoDto dto)
        {
            if (dto.RolId <= 0 || dto.PermisoId <= 0)
                return BadRequest(new { message = "RolId y PermisoId son requeridos." });

            await _permisosRepo.ToggleRolPermisoAsync(dto.RolId, dto.PermisoId, dto.Concedido);
            return Ok(new { message = "Permiso actualizado para el rol seleccionado." });
        }
        // ====================================================================
        // ROLES (CRUD SUPERADMIN)
        // ====================================================================
        [HttpGet("roles")]
        public async Task<IActionResult> ObtenerRoles([FromQuery] bool soloActivos = false)
        {
            var roles = await _permisosRepo.ObtenerRolesAsync(soloActivos);
            return Ok(roles);
        }

        [HttpGet("roles/{id}")]
        public async Task<IActionResult> ObtenerRolPorId([FromRoute] int id)
        {
            var rol = await _permisosRepo.ObtenerRolPorIdAsync(id);
            if (rol == null) return NotFound(new { message = "Rol no encontrado." });
            return Ok(rol);
        }

        [HttpPost("roles")]
        [Authorize(Roles = "SUPERADMIN")]
        public async Task<IActionResult> CrearRol([FromBody] CrearRolDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Codigo) || string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "Código y Nombre del rol son obligatorios." });

            try
            {
                var id = await _permisosRepo.CrearRolAsync(dto);
                return Ok(new { id, message = "Rol creado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPut("roles/{id}")]
        [Authorize(Roles = "SUPERADMIN")]
        public async Task<IActionResult> ActualizarRol([FromRoute] int id, [FromBody] CrearRolDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Codigo) || string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "Código y Nombre del rol son obligatorios." });

            try
            {
                var ok = await _permisosRepo.ActualizarRolAsync(id, dto);
                if (!ok) return NotFound(new { message = "Rol no encontrado." });
                return Ok(new { message = "Rol actualizado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpDelete("roles/{id}")]
        [Authorize(Roles = "SUPERADMIN")]
        public async Task<IActionResult> EliminarRol([FromRoute] int id)
        {
            try
            {
                var ok = await _permisosRepo.EliminarRolAsync(id);
                if (!ok) return NotFound(new { message = "Rol no encontrado." });
                return Ok(new { message = "Rol eliminado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
    }
}