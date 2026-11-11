using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;
using Transporte.API.Multitenancy;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [RequireTenantModule("MOD_HISTORIAL_BCV")]
    public class BcvController : ControllerBase
    {
        private readonly IBcvRepository _bcvRepository;

        public BcvController(IBcvRepository bcvRepository)
        {
            _bcvRepository = bcvRepository;
        }

        [HttpGet("hoy")]
        public async Task<IActionResult> ObtenerTasaHoy()
        {
            var ultima = await _bcvRepository.ObtenerUltimaTasaAsync();
            if (ultima != null)
            {
                bool esHoy = ultima.Fecha.Date >= DateTime.Today;
                return Ok(new 
                { 
                    tieneTasaHoy = esHoy, 
                    id = ultima.Id, 
                    fecha = ultima.Fecha, 
                    tasaDolarBs = ultima.TasaDolarBs, 
                    fuente = ultima.Fuente, 
                    observacion = ultima.Observacion,
                    data = ultima 
                });
            }

            return Ok(new { tieneTasaHoy = false, tasaDolarBs = 0m, data = (object?)null });
        }

        [HttpGet("historial")]
        public async Task<IActionResult> ObtenerHistorial([FromQuery] int dias = 1000)
        {
            var historial = await _bcvRepository.ObtenerHistorialAsync(dias);
            return Ok(historial);
        }

        [HttpPost]
        [HttpPost("registrar")]
        [HttpPost("guardar")]
        [Authorize(Roles = "SUPERADMIN,ADMIN,FINANZAS,SUPERVISOR")]
        public async Task<IActionResult> GuardarTasa([FromBody] RegistrarBcvDto dto)
        {
            if (dto.TasaDolarBs <= 0)
                return BadRequest(new { message = "El valor de la tasa debe ser mayor a 0." });

            int? usuarioId = null;
            var claimId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (int.TryParse(claimId, out int uid)) usuarioId = uid;

            try
            {
                await _bcvRepository.GuardarTasaAsync(dto, usuarioId);
                return Ok(new { message = "Tasa BCV guardada exitosamente." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "SUPERADMIN,ADMIN,FINANZAS,SUPERVISOR")]
        public async Task<IActionResult> EditarTasa([FromRoute] int id, [FromBody] EditarBcvDto dto)
        {
            if (dto.TasaDolarBs.HasValue && dto.TasaDolarBs.Value <= 0)
                return BadRequest(new { message = "El valor de la tasa debe ser mayor a 0." });

            int? usuarioId = null;
            var claimId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (int.TryParse(claimId, out int uid)) usuarioId = uid;

            try
            {
                var ok = await _bcvRepository.EditarTasaAsync(id, dto, usuarioId);
                if (!ok) return NotFound(new { message = "No se encontró el registro de tasa BCV." });
                return Ok(new { message = "Tasa BCV actualizada exitosamente." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "SUPERADMIN,ADMIN,FINANZAS,SUPERVISOR")]
        public async Task<IActionResult> EliminarTasa([FromRoute] int id)
        {
            try
            {
                var ok = await _bcvRepository.EliminarTasaAsync(id);
                if (!ok) return NotFound(new { message = "No se encontró el registro de tasa BCV." });
                return Ok(new { message = "Tasa BCV eliminada exitosamente." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }
    }
}