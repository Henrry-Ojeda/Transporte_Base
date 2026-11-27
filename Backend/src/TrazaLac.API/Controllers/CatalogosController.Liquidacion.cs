using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TrazaLac.Core.DTOs;

namespace TrazaLac.API.Controllers
{
    public partial class CatalogosController
    {
        // ==========================================
        // 4. PRE-LIQUIDACIÓN Y PAGOS DE FINCAS
        // ==========================================
        [HttpGet("preliquidacion")]
        [HttpGet("pre-liquidacion")]
        [Authorize]
        public async Task<IActionResult> ObtenerPreLiquidacion(
            [FromQuery] int? cicloId = null,
            [FromQuery] string? cicloIds = null,
            [FromQuery] DateTime? fechaInicio = null,
            [FromQuery] DateTime? fechaFin = null)
        {
            var preliq = await _catalogosRepository.ObtenerPreLiquidacionSemanaAsync(cicloId, cicloIds, fechaInicio, fechaFin);
            return Ok(preliq);
        }

        [HttpPost("pre-liquidacion/ajustar")]
        [Authorize]
        public async Task<IActionResult> AjustarPreLiquidacion([FromBody] AjustarPreLiquidacionFincaDto dto)
        {
            if (dto == null || dto.FincaId <= 0)
                return BadRequest(new { mensaje = "Datos de ajuste de finca inválidos." });

            var ok = await _catalogosRepository.AjustarPreLiquidacionFincaAsync(dto);
            if (!ok) return BadRequest(new { mensaje = "No se pudo aplicar el ajuste." });

            return Ok(new { mensaje = "Ajuste de liquidación guardado exitosamente." });
        }

        [HttpPost("pre-liquidacion/actualizar-tasa-pendientes")]
        [Authorize]
        public async Task<IActionResult> ActualizarTasaFincasPendientes([FromBody] ActualizarTasaPendientesDto dto)
        {
            if (dto == null || dto.TasaBcv <= 0)
                return BadRequest(new { mensaje = "La tasa BCV debe ser mayor a cero." });

            try
            {
                var cant = await _catalogosRepository.ActualizarTasaFincasPendientesAsync(dto);
                return Ok(new
                {
                    mensaje = $"Tasa BCV actualizada exitosamente para {cant} finca(s) pendientes de pago.",
                    fincasActualizadas = cant,
                    tasaBcv = dto.TasaBcv
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { mensaje = ex.Message });
            }
        }

        [HttpPost("pre-liquidacion/pagar")]
        [Authorize]
        public async Task<IActionResult> ProcesarPagoLiquidacion([FromBody] ProcesarPagoLiquidacionDto dto)
        {
            if (dto == null || dto.FincaId <= 0)
                return BadRequest(new { mensaje = "Datos de finca o pago inválidos." });

            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            int? usuarioId = int.TryParse(userIdClaim, out var parsed) ? parsed : null;

            var ok = await _catalogosRepository.ProcesarPagoLiquidacionAsync(dto, usuarioId);
            if (!ok) return BadRequest(new { mensaje = "No se pudo procesar el registro de pago." });

            return Ok(new { mensaje = dto.Pagado ? "Pago registrado exitosamente." : "Pago revertido exitosamente." });
        }

        [HttpGet("liquidacion/historial")]
        [Authorize]
        public async Task<IActionResult> ObtenerHistorialPagosLiquidacion(
            [FromQuery] int? cicloId = null,
            [FromQuery] int? fincaId = null,
            [FromQuery] DateTime? desde = null,
            [FromQuery] DateTime? hasta = null)
        {
            var historial = await _catalogosRepository.ObtenerHistorialPagosLiquidacionAsync(cicloId, fincaId, desde, hasta);
            return Ok(historial);
        }

        [HttpGet("liquidacion/logs")]
        public async Task<IActionResult> ObtenerLogsPagosLiquidacion([FromQuery] int? fincaId = null, [FromQuery] int? cicloId = null)
        {
            var logs = await _catalogosRepository.ObtenerLogsPagosLiquidacionAsync(fincaId, cicloId);
            return Ok(logs);
        }
    }
}
