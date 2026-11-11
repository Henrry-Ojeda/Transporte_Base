using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;
using Transporte.API.Multitenancy;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/pagos-usuarios")]
    [Route("api/pagosusuarios")]
    [Authorize]
    [RequireTenantModule("MOD_PAGOS_PERSONAL")]
    public class PagosUsuariosController : ControllerBase
    {
        private readonly IPagosUsuariosRepository _pagosUsuariosRepo;

        public PagosUsuariosController(IPagosUsuariosRepository pagosUsuariosRepo)
        {
            _pagosUsuariosRepo = pagosUsuariosRepo;
        }

        private int? ObtenerUsuarioActualId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (int.TryParse(claim, out int id)) return id;
            return null;
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerPagos([FromQuery] int? cicloId, [FromQuery] int? usuarioId, [FromQuery] string? tipoBeneficiario, [FromQuery] string? estado)
        {
            var list = await _pagosUsuariosRepo.ObtenerPagosAsync(cicloId, usuarioId, tipoBeneficiario, estado);
            return Ok(list);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerPagoPorId(int id)
        {
            var pago = await _pagosUsuariosRepo.ObtenerPagoPorIdAsync(id);
            if (pago == null) return NotFound(new { message = $"No se encontró el pago con ID {id}" });
            return Ok(pago);
        }

        [HttpGet("calculo-semanal/{cicloId}")]
        public async Task<IActionResult> CalcularLiquidacionSemana(int cicloId)
        {
            var list = await _pagosUsuariosRepo.CalcularLiquidacionUsuariosSemanaAsync(cicloId);
            return Ok(list);
        }

        [HttpPost]
        public async Task<IActionResult> CrearPago([FromBody] CrearPagoUsuarioDto dto)
        {
            if (dto.UsuarioId <= 0) return BadRequest(new { message = "El usuario beneficiario es obligatorio" });
            int operadorId = ObtenerUsuarioActualId() ?? 1;
            int pagoId = await _pagosUsuariosRepo.CrearPagoUsuarioAsync(dto, operadorId);
            return CreatedAtAction(nameof(ObtenerPagoPorId), new { id = pagoId }, new { id = pagoId, message = "Pago registrado exitosamente" });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> ActualizarPago(int id, [FromBody] EditarPagoUsuarioDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.MotivoModificacion))
            {
                return BadRequest(new { message = "El motivo de modificación es obligatorio para auditoría" });
            }
            int operadorId = ObtenerUsuarioActualId() ?? 1;
            bool ok = await _pagosUsuariosRepo.ActualizarPagoUsuarioAsync(id, dto, operadorId);
            if (!ok) return NotFound(new { message = $"No se encontró el pago con ID {id}" });
            return Ok(new { message = "Pago actualizado exitosamente" });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> AnularPago(int id, [FromQuery] string? motivo)
        {
            int operadorId = ObtenerUsuarioActualId() ?? 1;
            string motivoAnulacion = !string.IsNullOrWhiteSpace(motivo) ? motivo : "Anulación de pago solicitada por operador";
            bool ok = await _pagosUsuariosRepo.AnularPagoUsuarioAsync(id, motivoAnulacion, operadorId);
            if (!ok) return NotFound(new { message = $"No se encontró el pago con ID {id}" });
            return Ok(new { message = "Pago anulado exitosamente" });
        }

        // ==========================================
        // ADELANTOS Y PRÉSTAMOS
        // ==========================================

        [HttpGet("adelantos")]
        public async Task<IActionResult> ObtenerAdelantos([FromQuery] int? usuarioId, [FromQuery] string? estado)
        {
            var list = await _pagosUsuariosRepo.ObtenerAdelantosUsuariosAsync(usuarioId, estado);
            return Ok(list);
        }

        [HttpPost("adelantos")]
        public async Task<IActionResult> CrearAdelanto([FromBody] CrearAdelantoRequest request)
        {
            if (request.UsuarioId <= 0 || request.MontoTotalUSD <= 0)
            {
                return BadRequest(new { message = "UsuarioId y MontoTotalUSD válidos son obligatorios" });
            }
            int operadorId = ObtenerUsuarioActualId() ?? 1;
            int id = await _pagosUsuariosRepo.CrearAdelantoUsuarioAsync(
                request.UsuarioId,
                request.MontoTotalUSD,
                request.NumeroCuotas > 0 ? request.NumeroCuotas : 1,
                request.Observacion,
                operadorId);

            return Ok(new { id, message = "Adelanto/Préstamo registrado exitosamente" });
        }

        // ==========================================
        // LOGS DE AUDITORÍA
        // ==========================================

        [HttpGet("logs")]
        public async Task<IActionResult> ObtenerLogs([FromQuery] int? pagoId, [FromQuery] int? usuarioId)
        {
            var logs = await _pagosUsuariosRepo.ObtenerLogsPagosAsync(pagoId, usuarioId);
            return Ok(logs);
        }
    }

    public class CrearAdelantoRequest
    {
        public int UsuarioId { get; set; }
        public decimal MontoTotalUSD { get; set; }
        public int NumeroCuotas { get; set; } = 1;
        public string? Observacion { get; set; }
    }
}
