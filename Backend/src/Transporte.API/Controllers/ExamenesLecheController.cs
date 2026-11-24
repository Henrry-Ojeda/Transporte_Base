using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.API.Security;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;
using Transporte.Infrastructure.Services;

namespace Transporte.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/examenes-leche")]
    public class ExamenesLecheController : ControllerBase
    {
        private readonly IExamenesLecheRepository _repo;
        private readonly IGeminiOcrService _ocrService;

        public ExamenesLecheController(IExamenesLecheRepository repo, IGeminiOcrService ocrService)
        {
            _repo = repo;
            _ocrService = ocrService;
        }

        private int GetUserId()
        {
            var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("id")?.Value;
            return int.TryParse(claim, out var id) ? id : 1;
        }

        // =====================================================================
        // EXÁMENES DE CALIDAD DE LECHE
        // =====================================================================

        [HttpGet]
        [RequirePermission("CALIDAD_VER", "ENTREGAS_VER", "CONTROL_RUTAS_VER", "FINCAS_VER")]
        public async Task<IActionResult> ObtenerHistorial(
            [FromQuery] DateTime? fechaInicio = null,
            [FromQuery] DateTime? fechaFin = null,
            [FromQuery] string? nivelPrueba = null,
            [FromQuery] int? fincaId = null,
            [FromQuery] int? choferId = null,
            [FromQuery] long? controlRutaId = null,
            [FromQuery] string? resultado = null,
            [FromQuery] bool? soloFueraDeRango = null)
        {
            var lista = await _repo.ObtenerHistorialAsync(fechaInicio, fechaFin, nivelPrueba, fincaId, choferId, controlRutaId, resultado, soloFueraDeRango);
            return Ok(lista);
        }

        [HttpGet("ticket/{controlRutaId:long}")]
        [RequirePermission("CALIDAD_VER", "ENTREGAS_VER", "CONTROL_RUTAS_VER")]
        public async Task<IActionResult> ObtenerPorTicket([FromRoute] long controlRutaId)
        {
            var lista = await _repo.ObtenerPorTicketAsync(controlRutaId);
            return Ok(lista);
        }

        [HttpGet("finca/{fincaId:int}/historial")]
        [RequirePermission("CALIDAD_VER", "FINCAS_VER", "ENTREGAS_VER", "CONTROL_RUTAS_VER")]
        public async Task<IActionResult> ObtenerHistorialIntegralFinca(
            [FromRoute] int fincaId,
            [FromQuery] DateTime? fechaInicio = null,
            [FromQuery] DateTime? fechaFin = null)
        {
            var lista = await _repo.ObtenerHistorialIntegralFincaAsync(fincaId, fechaInicio, fechaFin);
            return Ok(lista);
        }

        [HttpPost]
        [RequirePermission("CALIDAD_CREAR", "ENTREGAS_CREAR", "ENTREGAS_EDITAR")]
        public async Task<IActionResult> CrearExamen([FromBody] GuardarExamenLecheDto dto)
        {
            try
            {
                var id = await _repo.CrearExamenAsync(dto, GetUserId());
                return Ok(new { id, message = "Examen de leche registrado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Error al registrar examen: {ex.Message}" });
            }
        }

        [HttpPut("{id:long}")]
        [RequirePermission("CALIDAD_EDITAR", "ENTREGAS_EDITAR")]
        public async Task<IActionResult> ActualizarExamen([FromRoute] long id, [FromBody] GuardarExamenLecheDto dto)
        {
            try
            {
                var ok = await _repo.ActualizarExamenAsync(id, dto, GetUserId());
                if (!ok) return NotFound(new { message = "Examen de leche no encontrado." });
                return Ok(new { message = "Examen de leche actualizado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Error al actualizar examen: {ex.Message}" });
            }
        }

        [HttpDelete("{id:long}")]
        [RequirePermission("CALIDAD_ELIMINAR", "ENTREGAS_ELIMINAR")]
        public async Task<IActionResult> EliminarExamen([FromRoute] long id)
        {
            var ok = await _repo.EliminarExamenAsync(id, GetUserId());
            if (!ok) return NotFound(new { message = "Examen de leche no encontrado." });
            return Ok(new { message = "Examen de leche eliminado." });
        }

        [HttpPost("ocr-lactoscan")]
        [RequirePermission("CALIDAD_CREAR", "ENTREGAS_CREAR", "ENTREGAS_EDITAR")]
        public async Task<IActionResult> LeerTicketLactoscan([FromBody] OcrLactoscanRequestDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.ImagenBase64))
                return BadRequest(new { message = "Debe proporcionar la imagen del ticket Lactoscan." });

            var res = await _ocrService.ProcesarTicketLactoscanAsync(dto.ImagenBase64);
            return Ok(res);
        }

        // =====================================================================
        // PARÁMETROS DE CALIDAD DE LECHE (CRUD + CHECK PRINCIPAL ÚNICO)
        // =====================================================================

        [HttpGet("/api/parametros-calidad-leche")]
        [RequirePermission("CALIDAD_VER", "CALIDAD_PARAMETROS", "ENTREGAS_VER", "FINCAS_VER")]
        public async Task<IActionResult> ObtenerParametros()
        {
            var lista = await _repo.ObtenerParametrosAsync();
            return Ok(lista);
        }

        [HttpGet("/api/parametros-calidad-leche/principal")]
        [RequirePermission("CALIDAD_VER", "CALIDAD_PARAMETROS", "ENTREGAS_VER", "FINCAS_VER", "CONTROL_RUTAS_VER")]
        public async Task<IActionResult> ObtenerParametroPrincipal()
        {
            var principal = await _repo.ObtenerParametroPrincipalAsync();
            return Ok(principal);
        }

        [HttpPost("/api/parametros-calidad-leche")]
        [RequirePermission("CALIDAD_PARAMETROS", "CALIDAD_CREAR")]
        public async Task<IActionResult> CrearParametro([FromBody] GuardarParametroCalidadLecheDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "El nombre del perfil de parámetros es obligatorio." });

            try
            {
                var id = await _repo.CrearParametroAsync(dto, GetUserId());
                return Ok(new { id, message = "Parámetros de calidad creados exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Error al crear parámetros: {ex.Message}" });
            }
        }

        [HttpPut("/api/parametros-calidad-leche/{id:int}")]
        [RequirePermission("CALIDAD_PARAMETROS", "CALIDAD_EDITAR")]
        public async Task<IActionResult> ActualizarParametro([FromRoute] int id, [FromBody] GuardarParametroCalidadLecheDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "El nombre del perfil de parámetros es obligatorio." });

            try
            {
                var ok = await _repo.ActualizarParametroAsync(id, dto, GetUserId());
                if (!ok) return NotFound(new { message = "Parámetro de calidad no encontrado." });
                return Ok(new { message = "Parámetros de calidad actualizados exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Error al actualizar parámetros: {ex.Message}" });
            }
        }

        [HttpPatch("/api/parametros-calidad-leche/{id:int}/principal")]
        [RequirePermission("CALIDAD_PARAMETROS", "CALIDAD_EDITAR")]
        public async Task<IActionResult> MarcarPrincipal([FromRoute] int id)
        {
            var ok = await _repo.MarcarParametroPrincipalAsync(id, GetUserId());
            if (!ok) return NotFound(new { message = "Parámetro de calidad no encontrado." });
            return Ok(new { message = "Parámetro Principal actualizado exitosamente." });
        }

        [HttpDelete("/api/parametros-calidad-leche/{id:int}")]
        [RequirePermission("CALIDAD_PARAMETROS", "CALIDAD_ELIMINAR")]
        public async Task<IActionResult> EliminarParametro([FromRoute] int id)
        {
            var ok = await _repo.EliminarParametroAsync(id, GetUserId());
            if (!ok) return NotFound(new { message = "Parámetro de calidad no encontrado." });
            return Ok(new { message = "Parámetro de calidad eliminado." });
        }
    }
}
