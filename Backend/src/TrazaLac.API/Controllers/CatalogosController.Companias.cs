using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TrazaLac.API.Security;
using TrazaLac.Core.DTOs;

namespace TrazaLac.API.Controllers
{
    public partial class CatalogosController
    {
        // ==========================================
        // 2. COMPAÑÍAS (CRUD COMPLETO)
        // ==========================================
        [HttpGet("companias")]
        [HttpGet("/api/companias")]
        public async Task<IActionResult> ObtenerCompanias([FromQuery] bool soloActivos = false)
        {
            var companias = await _catalogosRepository.ObtenerCompaniasAsync(soloActivos);
            return Ok(companias);
        }

        [HttpGet("companias/{id}")]
        public async Task<IActionResult> ObtenerCompaniaPorId([FromRoute] int id)
        {
            var compania = await _catalogosRepository.ObtenerCompaniaPorIdAsync(id);
            if (compania == null) return NotFound(new { message = "Compañía no encontrada." });
            return Ok(compania);
        }

        [HttpPost("companias")]
        [Authorize]
        [RequirePermission("COMPANIAS_CREAR")]
        public async Task<IActionResult> CrearCompania([FromBody] CrearCompaniaDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "El nombre de la compañía es obligatorio." });

            var id = await _catalogosRepository.CrearCompaniaAsync(dto);
            return Ok(new { id, message = "Compañía registrada exitosamente." });
        }

        [HttpPut("companias/{id}")]
        [Authorize]
        [RequirePermission("COMPANIAS_EDITAR")]
        public async Task<IActionResult> ActualizarCompania([FromRoute] int id, [FromBody] EditarCompaniaDto dto)
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            int? userId = int.TryParse(userIdStr, out var uId) ? uId : null;
            var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.GivenName) ?? "Administrador";

            var ok = await _catalogosRepository.ActualizarCompaniaAsync(id, dto, userId, userName);
            if (!ok) return NotFound(new { message = "Compañía no encontrada o no se pudo actualizar." });
            return Ok(new { message = "Compañía actualizada exitosamente." });
        }

        [HttpPut("companias/{id}/precio")]
        [Authorize]
        [RequirePermission("COMPANIAS_EDITAR")]
        public async Task<IActionResult> ActualizarPrecioCompania([FromRoute] int id, [FromBody] ActualizarPrecioCompaniaDto dto)
        {
            if (dto.NuevoPrecioUSD <= 0)
                return BadRequest(new { message = "El precio debe ser mayor a 0." });

            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            int userId = int.TryParse(userIdStr, out var uId) ? uId : 1;
            var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.GivenName) ?? "Administrador";

            var ok = await _catalogosRepository.ActualizarPrecioCompaniaAsync(id, dto.NuevoPrecioUSD, dto.NuevoPrecioBufalaUSD, dto.NuevoPrecioAcidaUSD, dto.Observacion, userId, userName);
            if (!ok) return NotFound(new { message = "Compañía no encontrada o no se pudo actualizar el precio." });
            return Ok(new { message = "Precio de la compañía actualizado exitosamente." });
        }

        [HttpDelete("companias/{id}")]
        [Authorize]
        [RequirePermission("COMPANIAS_ELIMINAR")]
        public async Task<IActionResult> EliminarCompania([FromRoute] int id)
        {
            var ok = await _catalogosRepository.EliminarCompaniaAsync(id);
            if (!ok) return NotFound(new { message = "Compañía no encontrada." });
            return Ok(new { message = "Compañía eliminada exitosamente." });
        }

        // ==========================================
        // ABONOS Y COBRANZAS DE COMPAÑÍAS
        // ==========================================
        [HttpGet("companias/abonos")]
        [HttpGet("/api/companias/abonos")]
        public async Task<IActionResult> ObtenerAbonosCompanias([FromQuery] int? companiaId = null)
        {
            var abonos = await _catalogosRepository.ObtenerAbonosCompaniasAsync(companiaId);
            return Ok(abonos);
        }

        [HttpPost("companias/abonos")]
        [HttpPost("/api/companias/abonos")]
        [RequirePermission("ABONOS_COMPANIAS_CREAR")]
        public async Task<IActionResult> CrearAbonoCompania([FromBody] GuardarAbonoCompaniaDto dto)
        {
            if (dto.CompaniaId <= 0)
                return BadRequest(new { message = "Debe especificar la compañía." });
            var tieneDist = dto.DistribucionSemanas != null && dto.DistribucionSemanas.Any(x => x.MontoUSD > 0);
            if (!tieneDist && dto.MontoUSD <= 0)
                return BadRequest(new { message = "El monto cobrado debe ser mayor a 0." });

            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            int? userId = int.TryParse(userIdStr, out var uId) ? uId : null;

            var id = await _catalogosRepository.CrearAbonoCompaniaAsync(dto, userId);
            return Ok(new { id, message = "Abono de compañía registrado exitosamente." });
        }

        [HttpDelete("companias/abonos/{id:int}")]
        [HttpDelete("/api/companias/abonos/{id:int}")]
        [RequirePermission("ABONOS_COMPANIAS_ELIMINAR")]
        public async Task<IActionResult> EliminarAbonoCompania([FromRoute] int id)
        {
            var ok = await _catalogosRepository.EliminarAbonoCompaniaAsync(id);
            if (!ok) return NotFound(new { message = "Abono no encontrado." });
            return Ok(new { success = true, message = "Abono eliminado correctamente." });
        }

        [HttpGet("companias/resumen-cobranzas")]
        [HttpGet("/api/companias/resumen-cobranzas")]
        public async Task<IActionResult> ObtenerResumenCobranzasCompanias()
        {
            var resumen = await _catalogosRepository.ObtenerResumenCobranzasCompaniasAsync();
            return Ok(resumen);
        }

        [HttpGet("companias/resumen-cobranzas-semanas")]
        [HttpGet("/api/companias/resumen-cobranzas-semanas")]
        public async Task<IActionResult> ObtenerResumenCobranzasPorSemana([FromQuery] int? companiaId = null, [FromQuery] int? cicloId = null)
        {
            var resumen = await _catalogosRepository.ObtenerResumenCobranzasPorSemanaAsync(companiaId, cicloId);
            return Ok(resumen);
        }

        [HttpGet("companias/{companiaId:int}/semanas/{cicloId:int}/despachos")]
        [HttpGet("/api/companias/{companiaId:int}/semanas/{cicloId:int}/despachos")]
        public async Task<IActionResult> ObtenerDespachosSemanaCompania([FromRoute] int companiaId, [FromRoute] int cicloId)
        {
            var despachos = await _catalogosRepository.ObtenerDespachosSemanaCompaniaAsync(companiaId, cicloId);
            return Ok(despachos);
        }

        [HttpPut("companias/despachos/precios")]
        [HttpPut("/api/companias/despachos/precios")]
        public async Task<IActionResult> ActualizarPreciosDespachosSemana([FromBody] ActualizarPreciosDespachosSemanaDto dto)
        {
            if (dto.CompaniaId <= 0 || dto.Items == null || !dto.Items.Any())
                return BadRequest(new { message = "Debe especificar la compañía y al menos un despacho." });
            await _catalogosRepository.ActualizarPreciosDespachosSemanaAsync(dto);
            return Ok(new { success = true, message = "Precios actualizados correctamente." });
        }

        // ==========================================
        // 3. BANCOS (CRUD COMPLETO)
        // ==========================================
        [HttpGet("bancos")]
        public async Task<IActionResult> ObtenerBancos()
        {
            var bancos = await _catalogosRepository.ObtenerBancosAsync();
            return Ok(bancos);
        }

        [HttpGet("bancos/{id}")]
        public async Task<IActionResult> ObtenerBancoPorId([FromRoute] int id)
        {
            var banco = await _catalogosRepository.ObtenerBancoPorIdAsync(id);
            if (banco == null) return NotFound(new { message = "Banco no encontrado." });
            return Ok(banco);
        }

        [HttpPost("bancos")]
        [Authorize]
        [RequirePermission("BANCOS_CREAR")]
        public async Task<IActionResult> CrearBanco([FromBody] CrearBancoDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "El nombre del banco es obligatorio." });

            var id = await _catalogosRepository.CrearBancoAsync(dto);
            return Ok(new { id, message = "Banco registrado exitosamente." });
        }

        [HttpPut("bancos/{id}")]
        [Authorize]
        [RequirePermission("BANCOS_EDITAR")]
        public async Task<IActionResult> ActualizarBanco([FromRoute] int id, [FromBody] EditarBancoDto dto)
        {
            var ok = await _catalogosRepository.ActualizarBancoAsync(id, dto);
            if (!ok) return NotFound(new { message = "Banco no encontrado o no se pudo actualizar." });
            return Ok(new { message = "Banco actualizado exitosamente." });
        }

        [HttpDelete("bancos/{id}")]
        [Authorize]
        [RequirePermission("BANCOS_ELIMINAR")]
        public async Task<IActionResult> EliminarBanco([FromRoute] int id)
        {
            var ok = await _catalogosRepository.EliminarBancoAsync(id);
            if (!ok) return NotFound(new { message = "Banco no encontrado." });
            return Ok(new { message = "Banco eliminado o desactivado exitosamente." });
        }
    }
}
