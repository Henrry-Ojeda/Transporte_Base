using System.Security.Claims;
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
    [RequireTenantModule("MOD_LIQUIDACIONES")]
    public class AdelantosController : ControllerBase
    {
        private readonly IAdelantosRepository _adelantosRepository;

        public AdelantosController(IAdelantosRepository adelantosRepository)
        {
            _adelantosRepository = adelantosRepository;
        }

        private int? ObtenerUsuarioId()
        {
            var idClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (int.TryParse(idClaim, out int usuarioId))
            {
                return usuarioId;
            }
            return null;
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerAdelantos([FromQuery] string? tipoEntidad = null, [FromQuery] int? entidadId = null, [FromQuery] string? estado = null)
        {
            var lista = await _adelantosRepository.ObtenerAdelantosAsync(tipoEntidad, entidadId, estado);
            return Ok(lista);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerPorId(int id)
        {
            var adelanto = await _adelantosRepository.ObtenerPorIdAsync(id);
            if (adelanto == null) return NotFound(new { message = "Adelanto no encontrado" });
            return Ok(adelanto);
        }

        [HttpPost]
        public async Task<IActionResult> CrearAdelanto([FromBody] CrearAdelantoDto dto)
        {
            if (dto.MontoTotalUSD <= 0)
            {
                return BadRequest(new { message = "El monto total en USD debe ser mayor a 0." });
            }
            if (dto.NumeroCuotas <= 0)
            {
                return BadRequest(new { message = "El número de cuotas debe ser al menos 1." });
            }
            if (string.IsNullOrWhiteSpace(dto.TipoEntidad) || (dto.TipoEntidad.ToUpper() != "FINCA" && dto.TipoEntidad.ToUpper() != "RECEPTORIA" && dto.TipoEntidad.ToUpper() != "COMPANIA"))
            {
                return BadRequest(new { message = "El tipo de entidad debe ser 'FINCA', 'RECEPTORIA' o 'COMPANIA'." });
            }

            dto.TipoEntidad = dto.TipoEntidad.ToUpper();
            int? usuarioId = ObtenerUsuarioId();
            var result = await _adelantosRepository.CrearAdelantoAsync(dto, usuarioId);
            return CreatedAtAction(nameof(ObtenerPorId), new { id = result.Id }, result);
        }

        [HttpPut("cuotas/{cuotaId}")]
        public async Task<IActionResult> ActualizarCuota(int cuotaId, [FromBody] ActualizarCuotaAdelantoDto dto)
        {
            int? usuarioId = ObtenerUsuarioId();
            var success = await _adelantosRepository.ActualizarCuotaAsync(cuotaId, dto, usuarioId);
            if (!success) return NotFound(new { message = "Cuota no encontrada" });
            return Ok(new { message = "Cuota actualizada exitosamente" });
        }

        [HttpPost("cuotas/{cuotaId}/posponer")]
        public async Task<IActionResult> PosponerCuota(int cuotaId, [FromBody] PosponerCuotaDto dto)
        {
            int? usuarioId = ObtenerUsuarioId();
            var success = await _adelantosRepository.PosponerCuotaAsync(cuotaId, dto?.Motivo, usuarioId, dto?.SemanaOperativaIdDestino);
            if (!success) return NotFound(new { message = "Cuota no encontrada" });
            return Ok(new { message = "Cuota pospuesta exitosamente" });
        }

        [HttpPost("cuotas/{cuotaId}/dividir")]
        public async Task<IActionResult> DividirCuota(int cuotaId, [FromBody] DividirCuotaDto dto)
        {
            if (dto.MontoDescontarUSD <= 0)
            {
                return BadRequest(new { message = "El monto a descontar debe ser mayor a 0 USD." });
            }

            int? usuarioId = ObtenerUsuarioId();
            var success = await _adelantosRepository.DividirCuotaAsync(
                cuotaId, dto.MontoDescontarUSD, dto.SemanaOperativaIdDestino, dto.Motivo, usuarioId);

            if (!success)
            {
                return BadRequest(new { message = "No se pudo realizar la deducción parcial. Verifique que el monto sea menor al total de la cuota." });
            }

            return Ok(new { success = true, message = "Deducción parcial aplicada y remanente trasladado exitosamente al siguiente ciclo." });
        }

        [HttpPost("{id}/reestructurar-cuotas")]
        public async Task<IActionResult> ReestructurarCuotas(int id, [FromBody] ReestructurarCuotasDto dto)
        {
            int? usuarioId = ObtenerUsuarioId();
            var success = await _adelantosRepository.ReestructurarCuotasAsync(id, dto, usuarioId);
            if (!success) return NotFound(new { message = "Adelanto no encontrado" });
            return Ok(new { message = "Plan de cuotas pendientes reestructurado exitosamente" });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> EliminarAdelanto(int id)
        {
            var success = await _adelantosRepository.EliminarAdelantoAsync(id);
            if (!success) return NotFound(new { message = "Adelanto no encontrado" });
            return Ok(new { message = "Adelanto eliminado exitosamente" });
        }

        [HttpPost("marcar-pago-liquidacion")]
        public async Task<IActionResult> MarcarPagoLiquidacion([FromBody] MarcarPagoLiquidacionDto dto)
        {
            int? usuarioId = ObtenerUsuarioId();
            var success = await _adelantosRepository.MarcarPagoLiquidacionFincaAsync(
                dto.FincaId, dto.FechaDesde, dto.FechaHasta, dto.Pagado, dto.TasaBcv, usuarioId);
            return Ok(new { success, message = dto.Pagado ? "Cuotas de adelanto marcadas como cobradas" : "Cobro de cuotas revertido" });
        }

        [HttpGet("abonos")]
        public async Task<IActionResult> ObtenerAbonos([FromQuery] string? tipoEntidad = null, [FromQuery] int? entidadId = null, [FromQuery] int? cicloId = null)
        {
            var lista = await _adelantosRepository.ObtenerAbonosAsync(tipoEntidad, entidadId, cicloId);
            return Ok(lista);
        }

        [HttpPost("abonos/directo")]
        public async Task<IActionResult> RegistrarAbonoDirecto([FromBody] RegistrarAbonoDirectoDto dto)
        {
            if (dto.AdelantoId <= 0 || dto.MontoAbonoUSD <= 0)
            {
                return BadRequest(new { message = "El ID del adelanto y el monto del abono en USD deben ser mayores a cero." });
            }

            int? usuarioId = ObtenerUsuarioId();
            var success = await _adelantosRepository.RegistrarAbonoDirectoAsync(dto, usuarioId);
            if (!success)
            {
                return BadRequest(new { message = "No se pudo registrar el abono. Verifique el adelanto especificado." });
            }

            return Ok(new { success = true, message = "Abono directo registrado y amortizado exitosamente." });
        }

        [HttpPost("actualizar-tasa-activos")]
        public async Task<IActionResult> ActualizarTasaAdelantosActivos([FromBody] ActualizarTasaAdelantosActivosDto dto)
        {
            if (dto == null || dto.TasaBcv <= 0)
            {
                return BadRequest(new { message = "El valor del dólar (Tasa BCV) debe ser mayor a 0." });
            }

            string tipo = string.IsNullOrWhiteSpace(dto.TipoEntidad) ? "FINCA" : dto.TipoEntidad.ToUpper();
            int? usuarioId = ObtenerUsuarioId();

            var cant = await _adelantosRepository.ActualizarTasaAdelantosActivosAsync(tipo, dto.TasaBcv, usuarioId);

            return Ok(new
            {
                success = true,
                mensaje = $"Se actualizó el valor del dólar (Bs. {dto.TasaBcv:N4}) a {cant} adelanto(s) activos de {tipo.ToLower()}.",
                adelantosActualizados = cant,
                tasaBcv = dto.TasaBcv
            });
        }
    }
}
