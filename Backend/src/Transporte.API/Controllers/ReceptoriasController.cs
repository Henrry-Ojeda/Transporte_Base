using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;

namespace Transporte.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    [Route("api/entregas")]
    [Route("api/receptoria")]
    public class ReceptoriasController : ControllerBase
    {
        private readonly IEntregasRepository _entregasRepository;

        public ReceptoriasController(IEntregasRepository entregasRepository)
        {
            _entregasRepository = entregasRepository;
        }

        [HttpGet]
        [HttpGet("hoy")]
        public async Task<IActionResult> ObtenerEntregasHoy(
            [FromQuery] DateTime? fecha = null,
            [FromQuery] DateTime? fechaInicio = null,
            [FromQuery] DateTime? fechaFin = null,
            [FromQuery] int? cicloId = null)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            var entregas = await _entregasRepository.ObtenerEntregasHoyAsync(userId, rol, fecha, fechaInicio, fechaFin, cicloId);
            return Ok(entregas);
        }

        /// <summary>
        /// Obtiene el balance volumétrico completo, stock físico en tanques y trazabilidad de los 4 procesos operativos.
        /// </summary>
        [HttpGet("balance-volumetrico")]
        public async Task<IActionResult> ObtenerBalanceVolumetrico(
            [FromQuery] int? cicloId = null,
            [FromQuery] DateTime? fecha = null,
            [FromQuery] DateTime? fechaInicio = null,
            [FromQuery] DateTime? fechaFin = null)
        {
            try
            {
                if (fecha.HasValue && !fechaInicio.HasValue)
                {
                    fechaInicio = fecha.Value.Date;
                    fechaFin = fecha.Value.Date.AddDays(1).AddTicks(-1);
                }
                var balance = await _entregasRepository.ObtenerBalanceVolumetricoAsync(cicloId, fechaInicio, fechaFin);
                return Ok(balance);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost]
        public async Task<IActionResult> RegistrarEntrega([FromBody] RegistrarEntregaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";
            try
            {
                var id = await _entregasRepository.RegistrarEntregaAsync(dto, userId, rol);
                return Ok(new { message = "Entrega en receptoría registrada exitosamente.", id });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> ModificarEntrega([FromRoute] int id, [FromBody] EditarEntregaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                await _entregasRepository.EditarEntregaAsync(id, dto, userId, rol);
                return Ok(new { message = "Entrega actualizada exitosamente." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> EliminarEntrega([FromRoute] int id)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                await _entregasRepository.EliminarEntregaAsync(id, userId, rol);
                return Ok(new { message = "Entrega eliminada exitosamente." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        // =========================================================================
        // CONTROL DIARIO DE TANQUES Y AFORO (VALIDACIÓN Y CONFIRMACIÓN POR SUPERVISOR / ADMIN)
        // =========================================================================
        [HttpGet("control-tanques-diario")]
        public async Task<IActionResult> ObtenerControlTanquesDiario([FromQuery] DateTime? fecha = null)
        {
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "SUPERVISOR";
            var targetFecha = fecha ?? DateTime.UtcNow.Date;
            var result = await _entregasRepository.ObtenerControlTanquesDiarioAsync(targetFecha, rol);
            return Ok(result);
        }

        [HttpPost("control-tanques-diario")]
        public async Task<IActionResult> GuardarControlTanquesDiario([FromBody] ControlTanquesDiarioDto dto)
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            int userId = int.TryParse(userIdStr, out var u) ? u : 1;
            var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.GivenName) ?? "Supervisor";
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "SUPERVISOR";

            try
            {
                var id = await _entregasRepository.GuardarControlTanquesDiarioAsync(dto, userId, userName, rol);
                return Ok(new { id, message = "Control diario de tanques guardado correctamente." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("control-tanques-diario/confirmar-apertura")]
        public async Task<IActionResult> ConfirmarAperturaTanques([FromBody] dynamic payload)
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            int userId = int.TryParse(userIdStr, out var u) ? u : 1;
            var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.GivenName) ?? "Supervisor";
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "SUPERVISOR";

            DateTime fecha = DateTime.UtcNow.Date;
            try
            {
                string fechaStr = (string?)payload?.fecha ?? "";
                if (DateTime.TryParse(fechaStr, out var f)) fecha = f.Date;
            }
            catch {}

            try
            {
                var ok = await _entregasRepository.ConfirmarAperturaTanquesAsync(fecha, userId, userName, rol);
                return Ok(new { success = ok, message = $"Apertura del día {fecha:dd/MM/yyyy} validada y confirmada exitosamente por {userName}." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("control-tanques-diario/confirmar-cierre")]
        public async Task<IActionResult> ConfirmarCierreTanques([FromBody] dynamic payload)
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            int userId = int.TryParse(userIdStr, out var u) ? u : 1;
            var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.GivenName) ?? "Supervisor";
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "SUPERVISOR";

            DateTime fecha = DateTime.UtcNow.Date;
            try
            {
                string fechaStr = (string?)payload?.fecha ?? "";
                if (DateTime.TryParse(fechaStr, out var f)) fecha = f.Date;
            }
            catch {}

            try
            {
                var ok = await _entregasRepository.ConfirmarCierreTanquesAsync(fecha, userId, userName, rol);
                return Ok(new { success = ok, message = $"Cierre oficial del día {fecha:dd/MM/yyyy} confirmado y bloqueado para modificaciones. Registrado por {userName}." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Registra un ticket de entrada directo en Receptoría traído por un tercero (Conductor OTROS / Camión OTROS).
        /// Genera el control de viaje, parada de recolección para liquidación de la finca y entrada confirmada en silos.
        /// </summary>
        [HttpPost("entrada-tercero")]
        public async Task<IActionResult> CrearEntradaTercero([FromBody] CrearEntradaTerceroDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER").ToUpper();

            if (!rol.Contains("ADMIN") && rol != "SUPERVISOR" && rol != "RECEPTOR" && rol != "RECEPTORIA")
                return StatusCode(403, new { message = "Solo Receptoría o Administración pueden registrar entradas de terceros." });

            try
            {
                var controlRutaId = await _entregasRepository.CrearEntradaTerceroAsync(dto, userId);
                return Ok(new { success = true, id = controlRutaId, message = $"Ticket de entrada por tercero #{controlRutaId} creado (pendiente de confirmar en silos)." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPut("entrada-tercero/{id:long}")]
        public async Task<IActionResult> EditarEntradaTercero([FromRoute] long id, [FromBody] CrearEntradaTerceroDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER").ToUpper();

            if (!rol.Contains("ADMIN") && rol != "SUPERVISOR" && rol != "RECEPTOR" && rol != "RECEPTORIA")
                return StatusCode(403, new { message = "Solo Receptoría o Administración pueden editar entradas de terceros." });

            try
            {
                await _entregasRepository.EditarEntradaTerceroAsync(id, dto, userId);
                return Ok(new { success = true, id, message = $"Ticket de entrada por tercero #{id} actualizado correctamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
    }
}