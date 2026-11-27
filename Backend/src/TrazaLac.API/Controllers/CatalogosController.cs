using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TrazaLac.Core.DTOs;
using TrazaLac.Infrastructure.Repositories;

namespace TrazaLac.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public partial class CatalogosController : ControllerBase
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

            TrazaLac.API.Multitenancy.TenantService.InvalidateCache();

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

            TrazaLac.API.Multitenancy.TenantService.InvalidateCache();
            return Ok(new { mensaje = "Fecha de vencimiento de licencia renovada exitosamente.", fechaVencimiento = dto.FechaVencimiento });
        }
    }
}
