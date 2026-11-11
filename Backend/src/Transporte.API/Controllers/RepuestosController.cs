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
    [Route("api/repuestos")]
    [Authorize]
    [RequireTenantModule("MOD_REPUESTOS")]
    public class RepuestosController : ControllerBase
    {
        private readonly IRepuestosRepository _repo;

        public RepuestosController(IRepuestosRepository repo)
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
        public async Task<IActionResult> ObtenerRepuestos([FromQuery] string? categoria, [FromQuery] bool soloActivos = false)
        {
            try
            {
                var list = await _repo.ObtenerRepuestosAsync(categoria, soloActivos);
                return Ok(list);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al obtener repuestos: " + ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerRepuestoPorId(int id)
        {
            try
            {
                var r = await _repo.ObtenerRepuestoPorIdAsync(id);
                if (r == null) return NotFound(new { message = "Repuesto no encontrado." });
                return Ok(r);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error: " + ex.Message });
            }
        }

        [HttpPost]
        public async Task<IActionResult> Crear([FromBody] GuardarRepuestoDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Nombre))
            {
                return BadRequest(new { message = "El nombre del repuesto es obligatorio." });
            }

            try
            {
                var id = await _repo.CrearRepuestoAsync(dto);
                return Ok(new { id, message = "Repuesto creado exitosamente en catálogo." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Actualizar(int id, [FromBody] GuardarRepuestoDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Nombre))
            {
                return BadRequest(new { message = "Datos inválidos para actualizar repuesto." });
            }

            try
            {
                var ok = await _repo.ActualizarRepuestoAsync(id, dto);
                if (!ok) return NotFound(new { message = "No se encontró el repuesto para actualizar." });
                return Ok(new { success = true, message = "Repuesto actualizado exitosamente." });
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
                var ok = await _repo.EliminarRepuestoAsync(id);
                if (!ok) return NotFound(new { message = "No se encontró el repuesto." });
                return Ok(new { success = true, message = "Repuesto desactivado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpGet("movimientos")]
        public async Task<IActionResult> ObtenerMovimientos([FromQuery] int? repuestoId, [FromQuery] int? camionId, [FromQuery] int top = 100)
        {
            try
            {
                var list = await _repo.ObtenerMovimientosAsync(repuestoId, camionId, top);
                return Ok(list);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al consultar movimientos: " + ex.Message });
            }
        }

        [HttpPost("movimientos")]
        public async Task<IActionResult> RegistrarMovimiento([FromBody] RegistrarMovimientoRepuestoDto dto)
        {
            if (dto == null || dto.RepuestoId <= 0 || dto.Cantidad <= 0)
            {
                return BadRequest(new { message = "Repuesto y cantidad válida (> 0) son obligatorios." });
            }

            try
            {
                var userId = GetCurrentUserId();
                var ok = await _repo.RegistrarMovimientoAsync(dto, userId);
                return Ok(new { success = ok, message = "Movimiento de repuesto registrado exitosamente." });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error registrando movimiento: " + ex.Message });
            }
        }
    }
}
