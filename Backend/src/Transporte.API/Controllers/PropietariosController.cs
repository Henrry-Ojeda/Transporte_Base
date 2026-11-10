using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;

namespace Transporte.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PropietariosController : ControllerBase
{
    private readonly ICatalogosRepository _catalogosRepository;

    public PropietariosController(ICatalogosRepository catalogosRepository)
    {
        _catalogosRepository = catalogosRepository;
    }

    private int? GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(claim, out var id) ? id : null;
    }

    [HttpGet]
    public async Task<IActionResult> GetPropietarios()
    {
        var result = await _catalogosRepository.ObtenerPropietariosAsync();
        return Ok(result);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetPropietarioById(int id)
    {
        var item = await _catalogosRepository.ObtenerPropietarioPorIdAsync(id);
        if (item == null)
        {
            return Ok(new PropietarioDto { Id = id, Nombre = $"Propietario #{id}", Estado = "ACTIVO", Activo = true });
        }
        return Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Crear([FromBody] CrearPropietarioDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Nombre))
            return BadRequest(new { mensaje = "El nombre del propietario es obligatorio" });

        int id = await _catalogosRepository.CrearPropietarioAsync(dto, GetUserId());
        return CreatedAtAction(nameof(GetPropietarioById), new { id }, new { id, mensaje = "Propietario creado con éxito" });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Actualizar(int id, [FromBody] ActualizarPropietarioDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Nombre))
            return BadRequest(new { mensaje = "El nombre del propietario es obligatorio" });

        bool ok = await _catalogosRepository.ActualizarPropietarioAsync(id, dto, GetUserId());
        if (!ok) return NotFound(new { mensaje = "Propietario no encontrado" });
        return Ok(new { mensaje = "Propietario actualizado con éxito" });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Eliminar(int id)
    {
        bool ok = await _catalogosRepository.EliminarPropietarioAsync(id);
        if (!ok) return NotFound(new { mensaje = "Propietario no encontrado" });
        return Ok(new { mensaje = "Propietario eliminado y sus fincas desvinculadas de forma segura" });
    }

    [HttpPost("asignar-fincas")]
    public async Task<IActionResult> AsignarFincas([FromBody] AsignarFincasPropietarioDto dto)
    {
        bool ok = await _catalogosRepository.AsignarFincasPropietarioAsync(dto);
        if (!ok) return BadRequest(new { mensaje = "No se pudieron asignar las fincas al propietario" });
        return Ok(new { mensaje = "Fincas asignadas correctamente al propietario" });
    }

    [HttpGet("preliquidacion-consolidada")]
    public async Task<IActionResult> GetPreLiquidacionConsolidada([FromQuery] int? cicloId = null)
    {
        var result = await _catalogosRepository.ObtenerPreLiquidacionConsolidadaPropietariosAsync(cicloId);
        return Ok(result);
    }
}
