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
    [Route("api/combustible")]
    [Authorize]
    [RequireTenantModule("MOD_COMBUSTIBLE")]
    public class CombustibleController : ControllerBase
    {
        private readonly ICombustibleRepository _repo;

        public CombustibleController(ICombustibleRepository repo)
        {
            _repo = repo;
        }

        private int? GetCurrentUserId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (int.TryParse(claim, out int id)) return id;
            return null;
        }

        [HttpGet("inventario")]
        public async Task<IActionResult> ObtenerInventario()
        {
            try
            {
                var inv = await _repo.ObtenerInventarioAsync();
                return Ok(inv);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al consultar inventario de combustible: " + ex.Message });
            }
        }

        [HttpGet("historial")]
        public async Task<IActionResult> ObtenerHistorial([FromQuery] string? tipoCombustible, [FromQuery] int? camionId, [FromQuery] int top = 100)
        {
            try
            {
                var historial = await _repo.ObtenerHistorialAsync(tipoCombustible, camionId, top);
                return Ok(historial);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al consultar historial de combustible: " + ex.Message });
            }
        }

        [HttpPost("compra")]
        public async Task<IActionResult> RegistrarCompra([FromBody] RegistrarCompraCombustibleDto dto)
        {
            if (dto == null || dto.Litros <= 0)
            {
                return BadRequest(new { message = "La cantidad de litros comprados debe ser mayor a 0." });
            }

            try
            {
                var userId = GetCurrentUserId();
                var ok = await _repo.RegistrarCompraAsync(dto, userId);
                return Ok(new { success = ok, message = "Compra y recarga de combustible registrada exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("despacho")]
        public async Task<IActionResult> RegistrarDespacho([FromBody] RegistrarDespachoCombustibleDto dto)
        {
            if (dto == null || dto.Litros <= 0)
            {
                return BadRequest(new { message = "La cantidad de litros a despachar debe ser mayor a 0." });
            }
            if (dto.CamionId <= 0)
            {
                return BadRequest(new { message = "Debe seleccionar un camión válido." });
            }

            try
            {
                var userId = GetCurrentUserId();
                var ok = await _repo.RegistrarDespachoAsync(dto, userId);
                return Ok(new { success = ok, message = "Despacho de combustible registrado exitosamente." });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error al despachar combustible: " + ex.Message });
            }
        }

        public class AjustarStockDto
        {
            public string TipoCombustible { get; set; } = "GASOIL";
            public decimal NuevoStock { get; set; }
            public decimal? NuevaCapacidad { get; set; }
            public string Motivo { get; set; } = string.Empty;
        }

        [HttpPost("ajuste")]
        public async Task<IActionResult> AjustarStock([FromBody] AjustarStockDto dto)
        {
            if (dto == null || dto.NuevoStock < 0)
            {
                return BadRequest(new { message = "El nuevo stock debe ser mayor o igual a 0." });
            }

            try
            {
                var userId = GetCurrentUserId();
                var ok = await _repo.AjustarStockAsync(dto.TipoCombustible, dto.NuevoStock, dto.Motivo, userId, dto.NuevaCapacidad);
                return Ok(new { success = ok, message = "Ajuste de inventario y capacidad aplicado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
    }
}
