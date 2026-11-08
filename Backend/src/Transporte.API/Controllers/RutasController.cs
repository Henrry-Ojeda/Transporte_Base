using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;
using Transporte.Infrastructure.Services;

namespace Transporte.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class RutasController : ControllerBase
    {
        private readonly IRutasRepository _rutasRepository;
        private readonly ICatalogosRepository _catalogosRepository;
        private readonly IGeminiOcrService _geminiOcrService;

        public RutasController(
            IRutasRepository rutasRepository, 
            ICatalogosRepository catalogosRepository,
            IGeminiOcrService geminiOcrService)
        {
            _rutasRepository = rutasRepository;
            _catalogosRepository = catalogosRepository;
            _geminiOcrService = geminiOcrService;
        }

        [HttpGet]
        [HttpGet("hoy")]
        public async Task<IActionResult> ObtenerRutasHoy(
            [FromQuery] DateTime? fecha = null,
            [FromQuery] DateTime? fechaInicio = null,
            [FromQuery] DateTime? fechaFin = null,
            [FromQuery] int? cicloId = null)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            var rutas = await _rutasRepository.ObtenerRutasHoyAsync(userId, rol, fecha, fechaInicio, fechaFin, cicloId);
            return Ok(rutas);
        }

        [HttpPost]
        public async Task<IActionResult> RegistrarRuta([FromBody] RegistrarRutaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";
            try
            {
                var id = await _rutasRepository.RegistrarRutaAsync(dto, userId, rol);
                return Ok(new { message = "Recolección registrada exitosamente.", id });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("masivo")]
        public async Task<IActionResult> RegistrarRutasMasivo([FromBody] RegistrarRutasMasivoDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";
            try
            {
                var ids = await _rutasRepository.RegistrarRutasMasivoAsync(dto, userId, rol);
                return Ok(new { message = $"Se registraron {ids.Count()} recolecciones exitosamente.", ids });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("ocr-imagen")]
        public async Task<IActionResult> ProcesarImagenOcr([FromBody] ProcesarImagenPayloadDto payload)
        {
            try
            {
                string? base64 = payload?.ImagenBase64;
                if (string.IsNullOrWhiteSpace(base64))
                {
                    return BadRequest(new { message = "No se recibió ninguna imagen para procesar." });
                }

                var fincas = await _catalogosRepository.ObtenerFincasAsync(true);
                var resultado = await _geminiOcrService.ProcesarPlanillaImagenAsync(base64, fincas);
                return Ok(resultado);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Error procesando la imagen: {ex.Message}" });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> ModificarRuta([FromRoute] int id, [FromBody] EditarRutaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                await _rutasRepository.EditarRutaAsync(id, dto, userId, rol);
                return Ok(new { message = "Recolección actualizada exitosamente." });
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
        public async Task<IActionResult> EliminarRuta([FromRoute] int id)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                await _rutasRepository.EliminarRutaAsync(id, userId, rol);
                return Ok(new { message = "Recolección eliminada exitosamente." });
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
        /// Limpia la información de recolección de una finca (litros, fotos, acidez, etc.)
        /// dejándola asignada en el ticket como PENDIENTE (No Recogida).
        /// </summary>
        [HttpPost("{id:long}/limpiar-recoleccion")]
        public async Task<IActionResult> LimpiarRecoleccion([FromRoute] long id)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER").ToUpper();

            if (!rol.Contains("ADMIN") && rol != "SUPERADMIN" && rol != "SUPERVISOR")
            {
                return StatusCode(403, new { message = "Solo un Administrador o Supervisor puede limpiar los datos de recolección de una finca." });
            }

            try
            {
                var ok = await _rutasRepository.LimpiarRecoleccionAsync(id, userId, rol);
                if (!ok) return NotFound(new { message = "Recolección no encontrada." });
                return Ok(new { message = "Información de la finca limpiada exitosamente. La finca vuelve al estado de NO RECOGIDA (Pendiente)." });
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

        [HttpPost("{id}/diferir-litros")]
        public async Task<IActionResult> DiferirLitros([FromRoute] long id, [FromBody] DiferirLitrosDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                await _rutasRepository.DiferirLitrosAsync(id, dto.LitrosDiferir, dto.CicloDestinoId, dto.Motivo, userId, rol);
                return Ok(new { message = "Litros diferidos exitosamente hacia la siguiente semana operativa." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("{id}/revertir-diferimiento")]
        public async Task<IActionResult> RevertirDiferimiento([FromRoute] long id)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                await _rutasRepository.RevertirDiferimientoAsync(id, userId, rol);
                return Ok(new { message = "Diferimiento revertido exitosamente. Los litros han sido reintegrados a la recolección original." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
    }

    public class ProcesarImagenPayloadDto
    {
        public string? ImagenBase64 { get; set; }
    }
}
