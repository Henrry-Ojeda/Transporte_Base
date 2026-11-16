using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;

namespace Transporte.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/mapa-rutas")]
    public class MapaRutasController : ControllerBase
    {
        private readonly IMapaRutasRepository _repo;

        public MapaRutasController(IMapaRutasRepository repo)
        {
            _repo = repo;
        }

        private int ObtenerUsuarioId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub") ?? User.FindFirst("id");
            return int.TryParse(claim?.Value, out var id) ? id : 0;
        }

        [HttpPost("gps/punto")]
        public async Task<IActionResult> RegistrarPuntoGps([FromBody] RegistrarPuntoGpsDto dto)
        {
            if (dto == null || dto.ControlRutaId <= 0)
                return BadRequest(new { message = "ControlRutaId inválido." });

            var usuarioId = ObtenerUsuarioId();
            var guardado = await _repo.RegistrarPuntoGpsAsync(usuarioId, dto);
            return Ok(new { guardado });
        }

        [HttpPut("fincas/{fincaId:int}/coordenadas")]
        public async Task<IActionResult> ActualizarCoordenadasFinca([FromRoute] int fincaId, [FromBody] ActualizarCoordenadasFincaDto dto)
        {
            if (dto == null)
                return BadRequest(new { message = "Coordenadas inválidas." });

            var ok = await _repo.ActualizarCoordenadasFincaAsync(fincaId, dto.Latitud, dto.Longitud);
            if (!ok) return NotFound(new { message = "Finca no encontrada." });
            return Ok(new { message = "Coordenadas de finca actualizadas exitosamente." });
        }

        [HttpGet("analisis")]
        public async Task<IActionResult> ObtenerAnalisisMapa(
            [FromQuery] DateTime? fechaDesde = null,
            [FromQuery] DateTime? fechaHasta = null,
            [FromQuery] int? rutaId = null,
            [FromQuery] int? camionId = null,
            [FromQuery] int? choferId = null)
        {
            var hoy = DateTime.UtcNow.AddHours(-4).Date;
            var desde = (fechaDesde ?? hoy.AddDays(-7)).Date;
            var hasta = (fechaHasta ?? hoy).Date;

            var data = await _repo.ObtenerAnalisisMapaRutasAsync(desde, hasta, rutaId, camionId, choferId);
            return Ok(data);
        }
    }
}
