using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TrazaLac.API.Security;
using TrazaLac.Core.DTOs;
using TrazaLac.Infrastructure.Repositories;

namespace TrazaLac.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class CamionesController : ControllerBase
    {
        private readonly IUsuariosRepository _usuariosRepository;

        public CamionesController(IUsuariosRepository usuariosRepository)
        {
            _usuariosRepository = usuariosRepository;
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerCamiones([FromQuery] bool soloActivos = false)
        {
            var camiones = await _usuariosRepository.ObtenerCamionesAsync(soloActivos);
            return Ok(camiones);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerCamionPorId([FromRoute] int id)
        {
            var camion = await _usuariosRepository.ObtenerCamionPorIdAsync(id);
            if (camion == null) return NotFound(new { message = "Camión no encontrado." });
            return Ok(camion);
        }

        [HttpGet("chofer/{usuarioId}")]
        public async Task<IActionResult> ObtenerCamionPorChofer([FromRoute] int usuarioId)
        {
            var camion = await _usuariosRepository.ObtenerCamionPorUsuarioIdAsync(usuarioId);
            if (camion == null) return NotFound(new { message = "No se encontró camión asignado a este chofer." });
            return Ok(camion);
        }

        [HttpPost]
        [RequirePermission("CAMIONES_CREAR", "HISTORIAL_CAMIONES_CREAR")]
        public async Task<IActionResult> CrearCamion([FromBody] CrearCamionDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Placa))
                return BadRequest(new { message = "La placa del camión es obligatoria." });

            try
            {
                var id = await _usuariosRepository.CrearCamionAsync(dto);
                return Ok(new { id, message = "Camión registrado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Error al registrar camión: {ex.Message}" });
            }
        }

        [HttpPut("{id}")]
        [RequirePermission("CAMIONES_EDITAR", "HISTORIAL_CAMIONES_EDITAR")]
        public async Task<IActionResult> ActualizarCamion([FromRoute] int id, [FromBody] EditarCamionDto dto)
        {
            var ok = await _usuariosRepository.ActualizarCamionAsync(id, dto);
            if (!ok) return NotFound(new { message = "Camión no encontrado o no modificado." });
            return Ok(new { message = "Camión actualizado exitosamente." });
        }

        [HttpPut("{id}/estado")]
        [RequirePermission("CAMIONES_EDITAR", "HISTORIAL_CAMIONES_EDITAR")]
        public async Task<IActionResult> ActualizarEstadoCamion([FromRoute] int id, [FromBody] ActualizarEstadoCamionDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Estado))
                return BadRequest(new { message = "El estado es requerido." });

            var ok = await _usuariosRepository.ActualizarEstadoCamionAsync(id, dto.Estado);
            if (!ok) return NotFound(new { message = "Camión no encontrado." });
            return Ok(new { message = $"Estado del camión actualizado a {dto.Estado.ToUpper()}." });
        }

        [HttpDelete("{id}")]
        [RequirePermission("CAMIONES_ELIMINAR", "HISTORIAL_CAMIONES_ELIMINAR")]
        public async Task<IActionResult> EliminarCamion([FromRoute] int id)
        {
            var ok = await _usuariosRepository.EliminarCamionAsync(id);
            if (!ok) return NotFound(new { message = "Camión no encontrado." });
            return Ok(new { message = "Camión eliminado exitosamente." });
        }
    }
}
