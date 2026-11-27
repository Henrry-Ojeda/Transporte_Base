using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Core.Interfaces;
using Transporte.Core.Security;
using Transporte.Infrastructure.Repositories;
using Transporte.API.Security;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [RequirePermission("PERMISOS_VER", "USUARIOS_VER", "USUARIOS_SEGURIDAD_VER")]
    public class PermisosController : ControllerBase
    {
        private readonly IPermisosRepository _permisosRepo;
        private readonly ITenantService _tenantService;

        public PermisosController(IPermisosRepository permisosRepo, ITenantService tenantService)
        {
            _permisosRepo = permisosRepo;
            _tenantService = tenantService;
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
            var modulosSaasActivos = _tenantService.GetModulosActivos();

            // Sincronizar Matriz RBAC con los módulos habilitados en SaaS_Manager:
            // Si un módulo no está habilitado para el tenant, se excluye y sus permisos quedan vacíos para roles operativos.
            var modulosHabilitados = matriz.Modulos
                .Where(m => SaasModulePermissionMap.IsModuloRbacHabilitado(m.Codigo, modulosSaasActivos))
                .ToList();
            var modulosIdsValidos = new HashSet<int>(modulosHabilitados.Select(m => m.Id));

            var permisosHabilitados = matriz.Permisos
                .Where(p => modulosIdsValidos.Contains(p.ModuloId))
                .ToList();
            var permisosIdsValidos = new HashSet<int>(permisosHabilitados.Select(p => p.Id));

            var matrizPorRolSincronizada = matriz.MatrizPorRol.Select(mr =>
            {
                var codRol = (mr.RolCodigo ?? string.Empty).Trim().ToUpperInvariant();
                var esAdminOSuper = codRol == "ADMIN" || codRol == "SUPERADMIN" || codRol == "SUPER_ADMIN";
                return new MatrizRolDto
                {
                    RolId = mr.RolId,
                    RolCodigo = mr.RolCodigo,
                    RolNombre = mr.RolNombre,
                    RolDescripcion = mr.RolDescripcion,
                    PermisosAsignadosIds = esAdminOSuper
                        ? permisosHabilitados.Select(p => p.Id).ToList()
                        : mr.PermisosAsignadosIds.Where(id => permisosIdsValidos.Contains(id)).ToList()
                };
            }).ToList();

            return Ok(new MatrizSeguridadCompletaDto
            {
                Roles = matriz.Roles,
                Modulos = modulosHabilitados,
                Permisos = permisosHabilitados,
                MatrizPorRol = matrizPorRolSincronizada
            });
        }

        [HttpGet("rol/{rolId}")]
        public async Task<IActionResult> ObtenerPermisosPorRol([FromRoute] int rolId)
        {
            var permisos = await _permisosRepo.ObtenerPermisosPorRolAsync(rolId);
            var modulosSaasActivos = _tenantService.GetModulosActivos();
            var filtrados = permisos.Where(p => SaasModulePermissionMap.IsModuloRbacHabilitado(p.ModuloCodigo, modulosSaasActivos));
            return Ok(filtrados);
        }

        [HttpPost("matriz/guardar-rol")]
        public async Task<IActionResult> GuardarRolPermisos([FromBody] GuardarRolPermisosDto dto)
        {
            if (dto.RolId <= 0)
                return BadRequest(new { message = "Debe especificar un Rol válido." });

            // Filtrar permisos que pertenezcan solo a módulos habilitados en SaaS_Manager
            var modulosSaasActivos = _tenantService.GetModulosActivos();
            var todosPermisos = await _permisosRepo.ObtenerPermisosAsync(soloActivos: true);
            var idsPermitidos = new HashSet<int>(
                todosPermisos
                    .Where(p => SaasModulePermissionMap.IsModuloRbacHabilitado(p.ModuloCodigo, modulosSaasActivos))
                    .Select(p => p.Id));

            var limpios = (dto.PermisosIds ?? new List<int>()).Where(id => idsPermitidos.Contains(id)).ToList();
            await _permisosRepo.GuardarRolPermisosAsync(dto.RolId, limpios);
            return Ok(new { message = "Matriz de permisos del rol actualizada exitosamente." });
        }

        [HttpPost("matriz/toggle")]
        public async Task<IActionResult> ToggleRolPermiso([FromBody] ToggleRolPermisoDto dto)
        {
            if (dto.RolId <= 0 || dto.PermisoId <= 0)
                return BadRequest(new { message = "RolId y PermisoId son requeridos." });

            if (dto.Concedido)
            {
                var permiso = await _permisosRepo.ObtenerPermisoPorIdAsync(dto.PermisoId);
                if (permiso == null)
                    return NotFound(new { message = "Permiso no encontrado." });

                var modulosSaasActivos = _tenantService.GetModulosActivos();
                if (!SaasModulePermissionMap.IsModuloRbacHabilitado(permiso.ModuloCodigo, modulosSaasActivos))
                {
                    return BadRequest(new { message = $"El módulo '{permiso.ModuloNombre}' no está habilitado para esta empresa en SaaS Manager." });
                }
            }

            await _permisosRepo.ToggleRolPermisoAsync(dto.RolId, dto.PermisoId, dto.Concedido);
            return Ok(new { message = "Permiso actualizado para el rol seleccionado." });
        }
        // ====================================================================
        // ROLES (CRUD DINÁMICO RBAC - ADMIN / SUPERADMIN / PERMISOS_EDITAR)
        // ====================================================================
        private bool EsSuperAdminActual()
        {
            var rol = (User?.FindFirstValue(ClaimTypes.Role) ?? string.Empty).Trim().ToUpperInvariant();
            return rol == "SUPERADMIN" || rol == "SUPER_ADMIN";
        }

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
        [RequirePermission("PERMISOS_EDITAR", "USUARIOS_EDITAR", "PERMISOS_VER")]
        public async Task<IActionResult> CrearRol([FromBody] CrearRolDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Codigo) || string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "Código y Nombre del rol son obligatorios." });

            var codUpper = dto.Codigo.Trim().ToUpperInvariant();
            if ((codUpper == "SUPERADMIN" || codUpper == "SUPER_ADMIN") && !EsSuperAdminActual())
                return Forbid();

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
        [RequirePermission("PERMISOS_EDITAR", "USUARIOS_EDITAR", "PERMISOS_VER")]
        public async Task<IActionResult> ActualizarRol([FromRoute] int id, [FromBody] CrearRolDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Codigo) || string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "Código y Nombre del rol son obligatorios." });

            var existente = await _permisosRepo.ObtenerRolPorIdAsync(id);
            if (existente == null) return NotFound(new { message = "Rol no encontrado." });

            var codExistente = (existente.Codigo ?? string.Empty).Trim().ToUpperInvariant();
            var codNuevo = dto.Codigo.Trim().ToUpperInvariant();
            if ((codExistente == "SUPERADMIN" || codExistente == "SUPER_ADMIN" || codNuevo == "SUPERADMIN" || codNuevo == "SUPER_ADMIN") && !EsSuperAdminActual())
                return Forbid();

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
        [RequirePermission("PERMISOS_EDITAR", "USUARIOS_EDITAR", "PERMISOS_VER")]
        public async Task<IActionResult> EliminarRol([FromRoute] int id)
        {
            var existente = await _permisosRepo.ObtenerRolPorIdAsync(id);
            if (existente == null) return NotFound(new { message = "Rol no encontrado." });

            var codExistente = (existente.Codigo ?? string.Empty).Trim().ToUpperInvariant();
            if ((codExistente == "SUPERADMIN" || codExistente == "SUPER_ADMIN") && !EsSuperAdminActual())
                return Forbid();

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