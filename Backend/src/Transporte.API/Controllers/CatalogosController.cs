using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;
using Transporte.Infrastructure.Repositories;

using System.Security.Claims;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class CatalogosController : ControllerBase
    {
        private readonly ICatalogosRepository _catalogosRepository;
        private readonly ICiclosRepository _ciclosRepository;

        public CatalogosController(ICatalogosRepository catalogosRepository, ICiclosRepository ciclosRepository)
        {
            _catalogosRepository = catalogosRepository;
            _ciclosRepository = ciclosRepository;
        }

        [HttpGet("semanas")]
        public async Task<IActionResult> ObtenerSemanas()
        {
            var semanas = await _ciclosRepository.ObtenerSemanasAsync();
            return Ok(semanas);
        }

        [HttpGet("propietarios")]
        public async Task<IActionResult> ObtenerPropietarios()
        {
            var result = await _catalogosRepository.ObtenerPropietariosAsync();
            return Ok(result);
        }

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
        public async Task<IActionResult> CrearFinca([FromBody] CrearFincaDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "El nombre de la finca es obligatorio." });

            var id = await _catalogosRepository.CrearFincaAsync(dto);
            return Ok(new { id, message = "Finca registrada exitosamente." });
        }

        [HttpPut("fincas/{id}")]
        [Authorize]
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
        public async Task<IActionResult> EliminarFinca([FromRoute] int id)
        {
            var ok = await _catalogosRepository.EliminarFincaAsync(id);
            if (!ok) return NotFound(new { message = "Finca no encontrada." });
            return Ok(new { message = "Finca eliminada exitosamente." });
        }

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
        public async Task<IActionResult> CrearCompania([FromBody] CrearCompaniaDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "El nombre de la compañía es obligatorio." });

            var id = await _catalogosRepository.CrearCompaniaAsync(dto);
            return Ok(new { id, message = "Compañía registrada exitosamente." });
        }

        [HttpPut("companias/{id}")]
        [Authorize]
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
        public async Task<IActionResult> CrearAbonoCompania([FromBody] GuardarAbonoCompaniaDto dto)
        {
            if (dto.CompaniaId <= 0)
                return BadRequest(new { message = "Debe especificar la compañía." });
            if (dto.MontoUSD <= 0)
                return BadRequest(new { message = "El monto cobrado debe ser mayor a 0." });

            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            int? userId = int.TryParse(userIdStr, out var uId) ? uId : null;

            var id = await _catalogosRepository.CrearAbonoCompaniaAsync(dto, userId);
            return Ok(new { id, message = "Abono de compañía registrado exitosamente." });
        }

        [HttpGet("companias/resumen-cobranzas")]
        [HttpGet("/api/companias/resumen-cobranzas")]
        public async Task<IActionResult> ObtenerResumenCobranzasCompanias()
        {
            var resumen = await _catalogosRepository.ObtenerResumenCobranzasCompaniasAsync();
            return Ok(resumen);
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
        public async Task<IActionResult> CrearBanco([FromBody] CrearBancoDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { message = "El nombre del banco es obligatorio." });

            var id = await _catalogosRepository.CrearBancoAsync(dto);
            return Ok(new { id, message = "Banco registrado exitosamente." });
        }

        [HttpPut("bancos/{id}")]
        [Authorize]
        public async Task<IActionResult> ActualizarBanco([FromRoute] int id, [FromBody] EditarBancoDto dto)
        {
            var ok = await _catalogosRepository.ActualizarBancoAsync(id, dto);
            if (!ok) return NotFound(new { message = "Banco no encontrado o no se pudo actualizar." });
            return Ok(new { message = "Banco actualizado exitosamente." });
        }

        [HttpDelete("bancos/{id}")]
        [Authorize]
        public async Task<IActionResult> EliminarBanco([FromRoute] int id)
        {
            var ok = await _catalogosRepository.EliminarBancoAsync(id);
            if (!ok) return NotFound(new { message = "Banco no encontrado." });
            return Ok(new { message = "Banco eliminado o desactivado exitosamente." });
        }

        // ==========================================
        // 4. OTROS CATÁLOGOS
        // ==========================================
        [HttpGet("choferes")]
        [HttpGet("conductores")]
        public async Task<IActionResult> ObtenerChoferes()
        {
            var choferes = await _catalogosRepository.ObtenerChoferesAsync();
            return Ok(choferes);
        }

        [HttpGet("ciclo-activo")]
        public async Task<IActionResult> ObtenerCicloActivo()
        {
            var ciclo = await _catalogosRepository.ObtenerCicloActivoAsync();
            if (ciclo == null) return NotFound(new { message = "No hay semana activa." });
            return Ok(ciclo);
        }

        [HttpGet("mermas")]
        [HttpGet("mermas/hoy")]
        public async Task<IActionResult> ObtenerMermasHoy([FromQuery] DateTime? fecha = null, [FromQuery] DateTime? fechaInicio = null, [FromQuery] DateTime? fechaFin = null, [FromQuery] int? choferId = null)
        {
            var mermas = await _catalogosRepository.ObtenerMermasHoyAsync(fecha, fechaInicio, fechaFin, choferId);
            return Ok(mermas);
        }

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
                return Ok(new { 
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

        // ==========================================
        // CONFIGURACIÓN DE EMPRESA Y MEMBRETE
        // ==========================================
        [HttpGet("empresa")]
        [HttpGet("/api/empresa")]
        [AllowAnonymous]
        public async Task<IActionResult> ObtenerEmpresaConfig()
        {
            var config = await _catalogosRepository.ObtenerEmpresaConfigAsync();
            return Ok(config);
        }

        [HttpPut("empresa")]
        [HttpPost("empresa")]
        [HttpPut("/api/empresa")]
        [HttpPost("/api/empresa")]
        [Authorize]
        public async Task<IActionResult> GuardarEmpresaConfig([FromBody] EmpresaConfigDto dto)
        {
            if (!string.IsNullOrWhiteSpace(dto.NombreEmpresa))
                dto.Nombre = dto.NombreEmpresa;

            if (string.IsNullOrWhiteSpace(dto.Nombre))
                return BadRequest(new { mensaje = "El nombre de la empresa es obligatorio." });

            var ok = await _catalogosRepository.GuardarEmpresaConfigAsync(dto);
            if (!ok) return BadRequest(new { mensaje = "No se pudo actualizar la información de la empresa." });

            Transporte.API.Multitenancy.TenantService.InvalidateCache();

            return Ok(new { mensaje = "Información de la empresa actualizada exitosamente.", data = dto });
        }

        [HttpPut("licencia")]
        [HttpPut("/api/empresa/licencia")]
        [Authorize(Roles = "SUPERADMIN")]
        public async Task<IActionResult> ActualizarLicencia([FromBody] ActualizarLicenciaDto dto)
        {
            if (dto.FechaVencimiento.Date < DateTime.UtcNow.Date)
            {
                return BadRequest(new { mensaje = "La fecha de vencimiento debe ser igual o posterior a hoy." });
            }

            var ok = await _catalogosRepository.ActualizarLicenciaAsync(dto.FechaVencimiento);
            if (!ok) return BadRequest(new { mensaje = "No se pudo actualizar la fecha de vencimiento de la licencia." });

            Transporte.API.Multitenancy.TenantService.InvalidateCache();
            return Ok(new { mensaje = "Fecha de vencimiento de licencia renovada exitosamente.", fechaVencimiento = dto.FechaVencimiento });
        }
    }
}
