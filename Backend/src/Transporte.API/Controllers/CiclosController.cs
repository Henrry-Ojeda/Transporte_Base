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
    [Route("api/[controller]")]
    [Authorize]
    [RequireTenantModule("MOD_LIQUIDACIONES")]
    public class CiclosController : ControllerBase
    {
        private readonly ICiclosRepository _ciclosRepository;

        public CiclosController(ICiclosRepository ciclosRepository)
        {
            _ciclosRepository = ciclosRepository;
        }

        [HttpGet("activo")]
        public async Task<IActionResult> ObtenerCicloActivo()
        {
            var activo = await _ciclosRepository.ObtenerCicloActivoAsync();
            return Ok(activo);
        }

        [HttpGet]
        [HttpGet("semanas")]
        public async Task<IActionResult> ObtenerSemanas()
        {
            var semanas = await _ciclosRepository.ObtenerSemanasAsync();
            return Ok(semanas);
        }

        [HttpPost]
        public async Task<IActionResult> CrearSemana([FromBody] CrearCicloDto dto)
        {
            try
            {
                var id = await _ciclosRepository.CrearSemanaAsync(dto);
                var semanas = await _ciclosRepository.ObtenerSemanasAsync();
                return Ok(new { message = "Semana creada exitosamente.", id, semanas });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al crear semana: " + ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> EditarSemana([FromRoute] int id, [FromBody] EditarCicloDto dto)
        {
            try
            {
                var success = await _ciclosRepository.EditarSemanaAsync(id, dto);
                if (!success) return BadRequest(new { message = "No se puede modificar una semana cerrada o inexistente." });
                var semanas = await _ciclosRepository.ObtenerSemanasAsync();
                return Ok(new { message = "Semana modificada exitosamente.", semanas });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al modificar semana: " + ex.Message });
            }
        }

        [HttpPost("generar-anual")]
        public async Task<IActionResult> Generar52Semanas([FromBody] Generar52SemanasDto dto)
        {
            try
            {
                var creadas = await _ciclosRepository.Generar52SemanasAsync(dto);
                var semanas = await _ciclosRepository.ObtenerSemanasAsync();
                return Ok(new { message = $"Se han generado y planificado {creadas} semanas operativas para el año {dto.Anio}.", totalCreadas = creadas, semanas });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al generar semanas automáticas: " + ex.Message });
            }
        }

        [HttpGet("{id}/validar-activacion")]
        public async Task<IActionResult> ValidarActivacion([FromRoute] int id)
        {
            try
            {
                var validacion = await _ciclosRepository.ValidarActivacionCicloAsync(id);
                return Ok(validacion);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al validar secuencia de activación: " + ex.Message });
            }
        }

        [HttpPost("{id}/activar")]
        public async Task<IActionResult> ActivarSemana([FromRoute] int id, [FromBody] ActivarCicloRequestDto? dto)
        {
            try
            {
                var success = await _ciclosRepository.ActivarSemanaAsync(id, dto?.StockInicialPersonalizado);
                if (!success) return BadRequest(new { message = "No se pudo activar la semana." });
                var semanas = await _ciclosRepository.ObtenerSemanasAsync();
                return Ok(new { message = "Semana establecida como ABIERTA (activa).", semanas });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al activar semana: " + ex.Message });
            }
        }

        [HttpGet("{id}/resumen-cierre")]
        public async Task<IActionResult> ObtenerResumenCierre([FromRoute] int id)
        {
            try
            {
                var resumen = await _ciclosRepository.ObtenerResumenCierreAsync(id);
                return Ok(resumen);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al obtener resumen de cierre: " + ex.Message });
            }
        }

        [HttpGet("{id}/balance-cierre")]
        public async Task<IActionResult> ObtenerBalanceCierre([FromRoute] int id)
        {
            try
            {
                var balance = await _ciclosRepository.ObtenerBalanceTanqueCicloAsync(id);
                return Ok(new { cicloId = id, balanceCalculadoTanque = balance });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al calcular balance de tanque: " + ex.Message });
            }
        }

        [HttpPost("{id}/cerrar")]
        public async Task<IActionResult> CerrarSemana([FromRoute] int id, [FromBody] CerrarSemanaDto? dto)
        {
            try
            {
                var success = await _ciclosRepository.CerrarSemanaAsync(id, dto?.StockFinalTanques);
                if (!success) return BadRequest(new { message = "No se pudo cerrar la semana." });
                var semanas = await _ciclosRepository.ObtenerSemanasAsync();
                return Ok(new { message = "Semana cerrada exitosamente y stock en tanque actualizado para el siguiente ciclo.", semanas });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al cerrar semana: " + ex.Message });
            }
        }

        public class ReabrirSemanaRequestDto
        {
            public string? Motivo { get; set; }
        }

        [HttpPost("{id}/reabrir")]
        public async Task<IActionResult> ReabrirSemana([FromRoute] int id, [FromBody] ReabrirSemanaRequestDto? dto)
        {
            try
            {
                var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
                int userId = int.TryParse(userIdStr, out var uid) ? uid : 0;
                var userNombre = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("unique_name") ?? "Administrador";

                var motivo = dto?.Motivo ?? "Reapertura de ciclo operativo";
                var success = await _ciclosRepository.ReabrirSemanaAsync(id, motivo, userId, userNombre);
                if (!success) return BadRequest(new { message = "No se pudo reabrir la semana." });
                var semanas = await _ciclosRepository.ObtenerSemanasAsync();
                return Ok(new { message = "Semana reabierta exitosamente y registrada en el historial de auditoría.", semanas });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al reabrir semana: " + ex.Message });
            }
        }

        [HttpPut("{id}/stock-inicial")]
        public async Task<IActionResult> ActualizarStockInicial([FromRoute] int id, [FromBody] ActualizarStockInicialDto dto)
        {
            try
            {
                var success = await _ciclosRepository.ActualizarStockInicialAsync(id, dto.StockInicial);
                if (!success) return BadRequest(new { message = "No se pudo actualizar el stock inicial de la semana seleccionada." });
                return Ok(new { message = "Stock inicial de tanques actualizado exitosamente.", cicloId = id, stockInicial = dto.StockInicial });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al actualizar stock inicial: " + ex.Message });
            }
        }
    }
}