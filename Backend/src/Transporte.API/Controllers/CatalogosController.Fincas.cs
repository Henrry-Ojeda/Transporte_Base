using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.API.Security;
using Transporte.Core.DTOs;

namespace Transporte.API.Controllers
{
    public partial class CatalogosController
    {
        // ==========================================
        // 1. FINCAS (CRUD COMPLETO Y PRECIOS)
        // ==========================================
        [HttpGet("fincas")]
        [HttpGet("/api/fincas")]
        public async Task<IActionResult> ObtenerFincas([FromQuery] bool soloActivos = false)
        {
            var fincas = await _catalogosRepository.ObtenerFincasAsync(soloActivos);
            return Ok(fincas);
        }

        [HttpGet("fincas/{id}")]
        public async Task<IActionResult> ObtenerFincaPorId([FromRoute] int id)
        {
            var finca = await _catalogosRepository.ObtenerFincaPorIdAsync(id);
            if (finca == null) return NotFound(new { message = "Finca no encontrada." });
            return Ok(finca);
        }

        [HttpPost("fincas")]
        [Authorize]
        [RequirePermission("FINCAS_CREAR")]
        public async Task<IActionResult> CrearFinca([FromBody] CrearFincaDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "El nombre de la finca es obligatorio." });

            var id = await _catalogosRepository.CrearFincaAsync(dto);
            return Ok(new { id, message = "Finca registrada exitosamente." });
        }

        [HttpPut("fincas/{id}")]
        [Authorize]
        [RequirePermission("FINCAS_EDITAR")]
        public async Task<IActionResult> ActualizarFinca([FromRoute] int id, [FromBody] EditarFincaDto dto)
        {
            int? userId = null;
            var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("id")?.Value ?? User.FindFirst("sub")?.Value;
            if (int.TryParse(idClaim, out var parsedId))
            {
                userId = parsedId;
            }
            var usuarioNombre = User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name ?? "Administrador";

            var ok = await _catalogosRepository.ActualizarFincaAsync(id, dto, userId, usuarioNombre);
            if (!ok) return NotFound(new { message = "Finca no encontrada o no se pudo actualizar." });
            return Ok(new { message = "Finca actualizada exitosamente." });
        }

        [HttpPost("fincas/precios-masivo")]
        [HttpPost("fincas/actualizar-precios-masivo")]
        [Authorize]
        [RequirePermission("FINCAS_EDITAR")]
        public async Task<IActionResult> ActualizarPreciosMasivo([FromBody] ActualizarPrecioMasivoDto dto)
        {
            if (dto.NuevoPrecioUSD <= 0)
                return BadRequest(new { message = "El precio por litro ($/LT) debe ser mayor a 0." });

            int userId = 1;
            var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("id")?.Value ?? User.FindFirst("sub")?.Value;
            if (int.TryParse(idClaim, out var parsedId))
            {
                userId = parsedId;
            }
            var usuarioNombre = User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name ?? "Administrador";

            var count = await _catalogosRepository.ActualizarPreciosMasivoAsync(dto, userId, usuarioNombre);
            return Ok(new { cantidadAfectadas = count, message = $"Se actualizó el precio a ${dto.NuevoPrecioUSD:N4} $/LT en {count} fincas exitosamente." });
        }

        [HttpGet("fincas/historial-precios")]
        public async Task<IActionResult> ObtenerHistorialPrecios()
        {
            var historial = await _catalogosRepository.ObtenerHistorialPreciosAsync();
            return Ok(historial);
        }

        [HttpDelete("fincas/{id}")]
        [Authorize]
        [RequirePermission("FINCAS_ELIMINAR")]
        public async Task<IActionResult> EliminarFinca([FromRoute] int id)
        {
            var ok = await _catalogosRepository.EliminarFincaAsync(id);
            if (!ok) return NotFound(new { message = "Finca no encontrada." });
            return Ok(new { message = "Finca eliminada exitosamente." });
        }
    }
}
