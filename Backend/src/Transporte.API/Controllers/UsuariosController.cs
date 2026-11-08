using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "ADMIN,SUPERADMIN")]
    public class UsuariosController : ControllerBase
    {
        private readonly IUsuariosRepository _usuariosRepository;

        public UsuariosController(IUsuariosRepository usuariosRepository)
        {
            _usuariosRepository = usuariosRepository;
        }

        private bool IsCallerSuperAdmin()
        {
            var rol = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role)?.Value ?? "";
            return rol.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase);
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerUsuarios([FromQuery] string? rol = null, [FromQuery] bool soloActivos = false)
        {
            var usuarios = await _usuariosRepository.ObtenerUsuariosAsync(rol, soloActivos);
            return Ok(usuarios);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerUsuarioPorId([FromRoute] int id)
        {
            var usuario = await _usuariosRepository.ObtenerUsuarioPorIdAsync(id);
            if (usuario == null) return NotFound(new { message = "Usuario no encontrado." });
            return Ok(usuario);
        }

        [HttpGet("roles")]
        public async Task<IActionResult> ObtenerRoles()
        {
            var roles = await _usuariosRepository.ObtenerRolesAsync();
            if (!IsCallerSuperAdmin())
            {
                // El rol Administrador no puede ver ni asignar el rol SUPERADMIN
                roles = roles.Where(r => !r.Codigo.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase));
            }
            return Ok(roles);
        }

        [HttpGet("choferes-disponibles")]
        public async Task<IActionResult> ObtenerChoferesDisponibles()
        {
            var choferes = await _usuariosRepository.ObtenerChoferesDisponiblesAsync();
            return Ok(choferes);
        }

        [HttpPost]
        public async Task<IActionResult> CrearUsuario([FromBody] CrearUsuarioDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Username))
                return BadRequest(new { message = "El nombre de usuario es obligatorio." });

            if (string.IsNullOrWhiteSpace(dto.NombreCompleto))
                return BadRequest(new { message = "El nombre completo es obligatorio." });

            // Solo el SuperAdmin puede asignar el rol SUPERADMIN
            if (dto.Rol?.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase) == true && !IsCallerSuperAdmin())
            {
                return StatusCode(403, new { message = "Acceso denegado: El rol Administrador no tiene autorización para crear ni asignar usuarios con el rol SuperAdmin." });
            }

            try
            {
                var id = await _usuariosRepository.CrearUsuarioAsync(dto);
                return Ok(new { id, message = "Usuario creado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message.Contains("UQ_") || ex.Message.Contains("UNIQUE") || ex.Message.Contains("duplicate")
                    ? "El nombre de usuario ya está registrado en el sistema."
                    : $"Error al crear usuario: {ex.Message}" });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> ActualizarUsuario([FromRoute] int id, [FromBody] EditarUsuarioDto dto)
        {
            var target = await _usuariosRepository.ObtenerUsuarioPorIdAsync(id);
            if (target == null) return NotFound(new { message = "Usuario no encontrado." });

            // El Administrador no puede editar al SuperAdmin
            if (target.Rol?.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase) == true && !IsCallerSuperAdmin())
            {
                return StatusCode(403, new { message = "Acceso denegado: Solo el SuperAdmin puede modificar datos del usuario SuperAdmin principal." });
            }

            // El Administrador no puede elevar a un usuario al rol SUPERADMIN
            if (dto.Rol?.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase) == true && !IsCallerSuperAdmin())
            {
                return StatusCode(403, new { message = "Acceso denegado: El rol Administrador no tiene autorización para asignar el rol SuperAdmin." });
            }

            var ok = await _usuariosRepository.ActualizarUsuarioAsync(id, dto);
            if (!ok) return NotFound(new { message = "Usuario no encontrado o no modificado." });
            return Ok(new { message = "Usuario actualizado exitosamente." });
        }

        [HttpPut("{id}/password")]
        public async Task<IActionResult> ActualizarPassword([FromRoute] int id, [FromBody] CambiarPasswordDto dto)
        {
            var pass = dto?.ObtenerPasswordValida() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(pass) || pass.Length < 6)
                return BadRequest(new { message = "La nueva contraseña debe tener al menos 6 caracteres." });

            var target = await _usuariosRepository.ObtenerUsuarioPorIdAsync(id);
            if (target == null) return NotFound(new { message = "Usuario no encontrado." });

            // El Administrador no puede cambiar la contraseña del SuperAdmin
            if (target.Rol?.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase) == true && !IsCallerSuperAdmin())
            {
                return StatusCode(403, new { message = "Acceso denegado: Solo el SuperAdmin puede cambiar la contraseña del usuario SuperAdmin principal." });
            }

            var ok = await _usuariosRepository.ActualizarPasswordAsync(id, pass);
            if (!ok) return NotFound(new { message = "Usuario no encontrado." });
            return Ok(new { message = "Contraseña actualizada exitosamente." });
        }

        [HttpPatch("{id}/permiso-crear-viaje")]
        public async Task<IActionResult> ActualizarPermisoCrearViaje([FromRoute] int id, [FromBody] CambiarPermisoCrearViajeDto dto)
        {
            var target = await _usuariosRepository.ObtenerUsuarioPorIdAsync(id);
            if (target == null) return NotFound(new { message = "Usuario no encontrado." });

            var ok = await _usuariosRepository.ActualizarPermisoCrearViajeAsync(id, dto.PermisoCrearViaje);
            if (!ok) return BadRequest(new { message = "No se pudo actualizar el permiso para crear ruta." });

            return Ok(new
            {
                success = true,
                message = dto.PermisoCrearViaje
                    ? $"Permiso concedido exitosamente a {target.NombreCompleto}. Ahora puede crear o iniciar 1 ruta."
                    : $"Permiso para crear ruta revocado a {target.NombreCompleto}.",
                permisoCrearViaje = dto.PermisoCrearViaje
            });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> EliminarUsuario([FromRoute] int id)
        {
            var target = await _usuariosRepository.ObtenerUsuarioPorIdAsync(id);
            if (target == null) return NotFound(new { message = "Usuario no encontrado." });

            // El SuperAdmin es intocable
            if (target.Rol?.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase) == true)
            {
                return StatusCode(403, new { message = "Acceso denegado: El usuario SuperAdmin es único e inmune y no puede ser eliminado ni desactivado." });
            }

            var ok = await _usuariosRepository.EliminarUsuarioAsync(id);
            if (!ok) return NotFound(new { message = "Usuario no encontrado." });
            return Ok(new { message = "Usuario eliminado exitosamente." });
        }
    }
}
