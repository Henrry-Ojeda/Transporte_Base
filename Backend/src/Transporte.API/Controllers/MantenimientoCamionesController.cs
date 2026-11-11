using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;
using Transporte.API.Multitenancy;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/mantenimiento-camiones")]
    [Authorize]
    [RequireTenantModule("MOD_MANTENIMIENTO")]
    public class MantenimientoCamionesController : ControllerBase
    {
        private readonly IMantenimientoCamionesRepository _repo;

        public MantenimientoCamionesController(IMantenimientoCamionesRepository repo)
        {
            _repo = repo;
        }

        private int? GetCurrentUserId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (int.TryParse(claim, out int id)) return id;
            return null;
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerMantenimientos([FromQuery] int? camionId, [FromQuery] string? tipoEvento, [FromQuery] string? estado)
        {
            try
            {
                var list = await _repo.ObtenerMantenimientosAsync(camionId, tipoEvento, estado);
                return Ok(list);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al obtener mantenimientos: " + ex.Message });
            }
        }

        [HttpGet("alertas")]
        public async Task<IActionResult> ObtenerAlertas()
        {
            try
            {
                var alertas = await _repo.ObtenerAlertasPreventivasAsync();
                return Ok(alertas);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al obtener alertas preventivas: " + ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerPorId(int id)
        {
            try
            {
                var m = await _repo.ObtenerPorIdAsync(id);
                if (m == null) return NotFound(new { message = "Registro de mantenimiento no encontrado." });
                return Ok(m);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error: " + ex.Message });
            }
        }

        [HttpPost]
        public async Task<IActionResult> Crear([FromBody] CrearMantenimientoCamionDto dto)
        {
            if (dto == null || dto.CamionId <= 0 || string.IsNullOrWhiteSpace(dto.Titulo))
            {
                return BadRequest(new { message = "El camión y el título del mantenimiento son requeridos." });
            }

            try
            {
                var userId = GetCurrentUserId();
                var id = await _repo.CrearMantenimientoAsync(dto, userId);
                return Ok(new { id, message = "Evento de mantenimiento registrado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Actualizar(int id, [FromBody] CrearMantenimientoCamionDto dto)
        {
            if (dto == null || dto.CamionId <= 0 || string.IsNullOrWhiteSpace(dto.Titulo))
            {
                return BadRequest(new { message = "Datos inválidos para actualizar mantenimiento." });
            }

            try
            {
                var userId = GetCurrentUserId();
                var ok = await _repo.ActualizarMantenimientoAsync(id, dto, userId);
                if (!ok) return NotFound(new { message = "No se encontró el registro para actualizar." });
                return Ok(new { success = true, message = "Mantenimiento actualizado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Eliminar(int id)
        {
            try
            {
                var ok = await _repo.EliminarMantenimientoAsync(id);
                if (!ok) return NotFound(new { message = "No se encontró el registro para eliminar." });
                return Ok(new { success = true, message = "Registro eliminado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
        // ====================================================================
        // INCIDENTES Y TAREAS DE TALLER (CHOFER <-> TALLER <-> ADMIN)
        // ====================================================================
        [HttpPost("incidentes")]
        public async Task<IActionResult> ReportarIncidente([FromBody] ReportarIncidenteChoferDto dto)
        {
            if (dto.CamionId <= 0 || string.IsNullOrWhiteSpace(dto.Titulo))
                return BadRequest(new { message = "El camión y el título del incidente son requeridos." });

            var userId = GetCurrentUserId() ?? 1;
            try
            {
                var id = await _repo.ReportarIncidenteChoferAsync(dto, userId);
                return Ok(new { id, message = "Incidente reportado al taller exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpGet("incidentes")]
        public async Task<IActionResult> ObtenerIncidentes([FromQuery] int? camionId, [FromQuery] string? estado)
        {
            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "").ToUpper();
            int? choferFiltro = null;
            if (rol == "CHOFER")
            {
                choferFiltro = GetCurrentUserId();
            }

            try
            {
                var list = await _repo.ObtenerMantenimientosAsync(camionId, "INCIDENTE", estado);
                if (choferFiltro.HasValue)
                {
                    list = list.Where(x => x.ReportadoPorChoferId == choferFiltro.Value);
                }
                return Ok(list);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpPut("incidentes/{id}/estado")]
        [Authorize(Roles = "TALLER,ADMIN,SUPERADMIN,SUPER_ADMIN,ADMINISTRADOR,SUPERVISOR")]
        public async Task<IActionResult> ActualizarEstadoIncidente([FromRoute] int id, [FromBody] ActualizarEstadoIncidenteDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Estado))
                return BadRequest(new { message = "El estado del incidente es requerido." });

            var userId = GetCurrentUserId() ?? 1;
            try
            {
                var ok = await _repo.ActualizarEstadoIncidenteAsync(id, dto, userId);
                if (!ok) return NotFound(new { message = "Incidente no encontrado." });
                return Ok(new { message = "Estado del incidente y disponibilidad del camión actualizados." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
    }
}