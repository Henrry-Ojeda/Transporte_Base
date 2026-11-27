using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TrazaLac.API.Security;
using TrazaLac.Core.DTOs;
using TrazaLac.Infrastructure.Repositories;

namespace TrazaLac.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/controlcompanias")]
    [Route("api/control-companias")]
    public class ControlCompaniasController : ControllerBase
    {
        private readonly IControlCompaniasRepository _controlCompaniasRepository;
        private readonly IExamenesLecheRepository? _examenesLecheRepository;

        public ControlCompaniasController(IControlCompaniasRepository controlCompaniasRepository, IExamenesLecheRepository? examenesLecheRepository = null)
        {
            _controlCompaniasRepository = controlCompaniasRepository;
            _examenesLecheRepository = examenesLecheRepository;
        }

        /// <summary>
        /// Obtiene la lista de despachos a compañías con filtros opcionales.
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> ObtenerDespachos(
            [FromQuery] DateTime? fecha = null,
            [FromQuery] DateTime? fechaInicio = null,
            [FromQuery] DateTime? fechaFin = null,
            [FromQuery] string? estado = null,
            [FromQuery] int? usuarioId = null,
            [FromQuery] int? companiaId = null,
            [FromQuery] int? cicloId = null)
        {
            int userId = 1;
            var uidClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("id")?.Value;
            if (int.TryParse(uidClaim, out var parsedId)) userId = parsedId;

            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER").ToUpper();

            // Solo los choferes/conductores se filtran a sus propios despachos;
            // cualquier otro rol con permiso ENTREGAS_VER / DASHBOARD_VER ve todos los despachos de la empresa.
            bool esSoloChofer = rol == "CHOFER" || rol == "CONDUCTOR";
            int? filtroChofer = esSoloChofer ? userId : usuarioId;

            try
            {
                var despachos = await _controlCompaniasRepository.ObtenerTodosAsync(fecha, fechaInicio, fechaFin, estado, filtroChofer, companiaId, cicloId);
                return Ok(despachos ?? Enumerable.Empty<ControlCompaniaDto>());
            }
            catch (Exception)
            {
                return Ok(Enumerable.Empty<ControlCompaniaDto>());
            }
        }

        /// <summary>
        /// Obtiene la trazabilidad completa de leche de Búfala por fechas, semanas, fincas y compañías.
        /// </summary>
        [HttpGet("trazabilidad-bufala")]
        public async Task<IActionResult> ObtenerTrazabilidadBufala(
            [FromQuery] DateTime? fechaDesde = null,
            [FromQuery] DateTime? fechaHasta = null,
            [FromQuery] int? cicloId = null,
            [FromQuery] int? fincaId = null,
            [FromQuery] int? companiaId = null,
            [FromQuery] int? usuarioId = null,
            [FromQuery] string? tipoServicio = null)
        {
            try
            {
                var resumen = await _controlCompaniasRepository.ObtenerTrazabilidadBufalaAsync(fechaDesde, fechaHasta, cicloId, fincaId, companiaId, usuarioId, tipoServicio);
                return Ok(resumen);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene un despacho específico por su ID.
        /// </summary>
        [HttpGet("{id:long}")]
        public async Task<IActionResult> ObtenerPorId([FromRoute] long id)
        {
            var despacho = await _controlCompaniasRepository.ObtenerPorIdAsync(id);
            if (despacho == null) return NotFound(new { message = "Despacho no encontrado." });
            return Ok(despacho);
        }

        /// <summary>
        /// Obtiene el ticket activo en estado 'EN VIA' asignado al chofer.
        /// </summary>
        [HttpGet("chofer-activo")]
        public async Task<IActionResult> ObtenerTicketActivoChofer([FromQuery] int? choferId = null)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER").ToUpper();
            bool esAdmin = rol.Contains("ADMIN") || rol == "SUPERADMIN" || rol == "SUPERVISOR";
            int idBusqueda = (esAdmin && choferId.HasValue && choferId.Value > 0) ? choferId.Value : userId;

            var ticket = await _controlCompaniasRepository.ObtenerTicketActivoChoferAsync(idBusqueda);
            return Ok(ticket);
        }

        /// <summary>
        /// Obtiene la lista de todos los tickets activos en estado 'EN VIA' asignados al chofer o al viaje en curso.
        /// </summary>
        [HttpGet("chofer-activos")]
        public async Task<IActionResult> ObtenerTicketsActivosChofer([FromQuery] int? choferId = null, [FromQuery] long? controlRutaId = null)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER").ToUpper();
            bool esAdmin = rol.Contains("ADMIN") || rol == "SUPERADMIN" || rol == "SUPERVISOR";
            int idBusqueda = (esAdmin && choferId.HasValue && choferId.Value > 0) ? choferId.Value : userId;

            var tickets = await _controlCompaniasRepository.ObtenerTicketsActivosChoferAsync(idBusqueda, controlRutaId);
            return Ok(tickets ?? Enumerable.Empty<ControlCompaniaDto>());
        }

        /// <summary>
        /// Registra un nuevo despacho / ticket de salida hacia una compañía (Estado 'EN VIA').
        /// </summary>
        [HttpPost]
        [RequirePermission("ENTREGAS_CREAR")]
        public async Task<IActionResult> CrearDespacho([FromBody] CrearControlCompaniaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            if (rol == "CHOFER")
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Un chofer no puede crear tickets de receptoría o despacho. Solo la Administración de Receptoría puede emitir tickets de salida." });
            }

            try
            {
                if (dto.LitrosDespachados <= 0)
                {
                    return BadRequest(new { message = "Los litros despachados deben ser mayores a 0." });
                }

                var id = await _controlCompaniasRepository.CrearDespachoAsync(dto, userId);
                return Ok(new { message = "Ticket de despacho a compañía creado exitosamente.", id });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// El chofer o receptoría valida la entrega de la leche en la quesera, registrando la cantidad recibida y la falla.
        /// Pasa el estado a 'DESPACHO'.
        /// </summary>
        [HttpPost("{id:long}/validar-entrega")]
        [RequirePermission("ENTREGAS_CREAR", "ENTREGAS_EDITAR")]
        public async Task<IActionResult> ValidarEntrega([FromRoute] long id, [FromBody] ValidarEntregaCompaniaDto dto)
        {
            int userId = 1;
            var uidClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("id")?.Value;
            if (int.TryParse(uidClaim, out var parsedId)) userId = parsedId;

            try
            {
                var ltsValidar = dto.Desgloses != null && dto.Desgloses.Count > 0
                    ? dto.Desgloses.Sum(d => d.LitrosRecibidos)
                    : (dto.LitrosRecibidosCompania > 0
                        ? dto.LitrosRecibidosCompania
                        : (dto.LitrosConfirmados ?? dto.Litros ?? 0));

                if (ltsValidar < 0)
                {
                    return BadRequest(new { message = "Los litros recibidos no pueden ser negativos." });
                }

                var ok = await _controlCompaniasRepository.ValidarYFinalizarEntregaAsync(id, dto, userId);
                if (!ok) return NotFound(new { message = "Despacho no encontrado." });

                // Registrar examen / recibo opcional en historial TB_EXAMENES_LECHE si se adjuntó
                var fotoRec = !string.IsNullOrWhiteSpace(dto.FotoReciboCompania) ? dto.FotoReciboCompania : dto.FotoReciboUrl;
                if (_examenesLecheRepository != null &&
                    (dto.ExamenLeche != null || !string.IsNullOrWhiteSpace(dto.FotoExamenLeche) || !string.IsNullOrWhiteSpace(fotoRec)))
                {
                    try
                    {
                        var despacho = await _controlCompaniasRepository.ObtenerPorIdAsync(id);
                        var ex = dto.ExamenLeche ?? new GuardarExamenLecheDto();
                        ex.NivelPrueba = "TICKET";
                        ex.ControlCompaniaId = id;
                        ex.ControlRutaId ??= despacho?.ControlRutaId;
                        ex.ChoferId ??= despacho?.UsuarioId;
                        ex.Fecha ??= despacho?.Fecha;
                        ex.TipoLeche ??= dto.TipoLeche ?? despacho?.TipoLeche ?? "VACA";
                        ex.LitrosAsociados ??= ltsValidar > 0 ? ltsValidar : despacho?.LitrosDespachados;
                        ex.ImagenExamen ??= dto.FotoExamenLeche;
                        ex.ImagenRecibo ??= fotoRec;
                        if (string.IsNullOrWhiteSpace(ex.Observacion)) ex.Observacion = dto.Observacion ?? dto.Observaciones;
                        await _examenesLecheRepository.CrearExamenAsync(ex, userId);
                    }
                    catch { /* Tolerante */ }
                }

                return Ok(new { message = "Entrega en compañía validada exitosamente. Estado actualizado a FINALIZADO." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Edita un ticket de despacho a compañía (RBAC dinámico ENTREGAS_EDITAR).
        /// </summary>
        [RequirePermission("ENTREGAS_EDITAR")]
        [HttpPut("{id:long}")]
        public async Task<IActionResult> EditarDespacho([FromRoute] long id, [FromBody] EditarControlCompaniaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            try
            {
                var ok = await _controlCompaniasRepository.EditarDespachoAsync(id, dto, userId);
                if (!ok) return NotFound(new { message = "Despacho no encontrado." });
                return Ok(new { message = "Ticket de despacho actualizado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Elimina un ticket de despacho (RBAC dinámico ENTREGAS_ELIMINAR).
        /// </summary>
        [RequirePermission("ENTREGAS_ELIMINAR")]
        [HttpDelete("{id:long}")]
        public async Task<IActionResult> EliminarDespacho([FromRoute] long id)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            try
            {
                var ok = await _controlCompaniasRepository.EliminarDespachoAsync(id, userId);
                if (!ok) return NotFound(new { message = "Despacho no encontrado." });
                return Ok(new { message = "Ticket de despacho eliminado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
    }
}
