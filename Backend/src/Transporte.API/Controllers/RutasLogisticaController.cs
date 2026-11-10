using System.Threading.Tasks;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;

namespace Transporte.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/rutas-logistica")]
    [Route("api/rutaslogistica")]
    [Route("api/rutaslogisticas")]
    public class RutasLogisticaController : ControllerBase
    {
        private readonly IRutasLogisticaRepository _rutasLogisticaRepository;

        public RutasLogisticaController(IRutasLogisticaRepository rutasLogisticaRepository)
        {
            _rutasLogisticaRepository = rutasLogisticaRepository;
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerRutas()
        {
            var rutas = await _rutasLogisticaRepository.ObtenerRutasAsync();
            return Ok(rutas);
        }

        [HttpGet("{id:int}")]
        public async Task<IActionResult> ObtenerRutaPorId(int id)
        {
            var ruta = await _rutasLogisticaRepository.ObtenerRutaPorIdAsync(id);
            if (ruta == null) return NotFound(new { message = "Ruta logística no encontrada." });
            return Ok(ruta);
        }

        [HttpPost]
        public async Task<IActionResult> CrearRuta([FromBody] GuardarRutaLogisticaDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombre))
            {
                return BadRequest(new { message = "El nombre de la ruta es obligatorio." });
            }
            if (string.IsNullOrWhiteSpace(dto.Codigo))
            {
                dto.Codigo = dto.Nombre.ToUpper().Replace(" ", "_");
            }

            try
            {
                var id = await _rutasLogisticaRepository.CrearRutaAsync(dto);
                return Ok(new { message = "Ruta logística creada exitosamente.", id });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPut("{id:int}")]
        public async Task<IActionResult> ActualizarRuta(int id, [FromBody] GuardarRutaLogisticaDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombre))
            {
                return BadRequest(new { message = "El nombre de la ruta es obligatorio." });
            }

            try
            {
                var ok = await _rutasLogisticaRepository.ActualizarRutaAsync(id, dto);
                if (!ok) return NotFound(new { message = "Ruta logística no encontrada." });
                return Ok(new { message = "Ruta logística actualizada exitosamente." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> EliminarRuta(int id)
        {
            try
            {
                var ok = await _rutasLogisticaRepository.EliminarRutaAsync(id);
                if (!ok) return NotFound(new { message = "Ruta no encontrada." });
                return Ok(new { message = "Ruta logística eliminada exitosamente." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpGet("{id:int}/fincas")]
        public async Task<IActionResult> ObtenerFincasDeRuta(int id)
        {
            var fincas = await _rutasLogisticaRepository.ObtenerFincasDeRutaAsync(id);
            return Ok(fincas);
        }

        [HttpPost("{id:int}/fincas")]
        public async Task<IActionResult> AsignarFincasARuta(int id, [FromBody] AsignarFincasRutaDto dto)
        {
            try
            {
                var ok = await _rutasLogisticaRepository.AsignarFincasARutaAsync(id, dto.FincaIds, dto.FincasHabitualesIds, dto.FincasAlternasIds);
                return Ok(new { message = "Fincas asignadas a la ruta exitosamente." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("{id:int}/asignar-finca-directa/{fincaId:int}")]
        public async Task<IActionResult> AsignarFincaDirecta(int id, int fincaId)
        {
            try
            {
                var ok = await _rutasLogisticaRepository.AsignarFincaDirectaAsync(id, fincaId);
                return Ok(new { message = "Finca asignada a la ruta exitosamente." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpGet("planificacion-choferes")]
        public async Task<IActionResult> ObtenerPlanificaciones([FromQuery] System.DateTime? fecha)
        {
            try
            {
                var fechaConsulta = (fecha ?? System.DateTime.Today).Date;
                var list = await _rutasLogisticaRepository.ObtenerPlanificacionesPorFechaAsync(fechaConsulta);
                return Ok(list);
            }
            catch (System.Exception ex)
            {
                return StatusCode(500, new { message = ex.Message, stack = ex.StackTrace });
            }
        }

        [HttpPost("planificacion-choferes")]
        public async Task<IActionResult> GuardarPlanificacion([FromBody] GuardarPlanificacionRutaChoferDto dto)
        {
            if (dto.CamionId <= 0 || dto.ConductorId <= 0)
            {
                return BadRequest(new { message = "El camión y el conductor son obligatorios." });
            }
            if (dto.FincasIds == null || dto.FincasIds.Count == 0)
            {
                return BadRequest(new { message = "Debe asignar al menos una finca a este camión." });
            }

            var userId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : 1;
            try
            {
                var id = await _rutasLogisticaRepository.GuardarPlanificacionChoferAsync(dto, userId);
                return Ok(new { message = "Planificación guardada exitosamente.", id });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpDelete("planificacion-choferes/{id:int}")]
        public async Task<IActionResult> EliminarPlanificacion(int id)
        {
            try
            {
                var ok = await _rutasLogisticaRepository.EliminarPlanificacionChoferAsync(id);
                if (!ok) return NotFound(new { message = "Planificación no encontrada." });
                return Ok(new { message = "Planificación eliminada exitosamente." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("ticket/{ticketId:long}/modificar-fincas")]
        public async Task<IActionResult> ModificarFincasTicket([FromRoute] long ticketId, [FromBody] List<int> fincaIds)
        {
            var userId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : 1;
            try
            {
                var ok = await _rutasLogisticaRepository.ModificarFincasTicketAsync(ticketId, fincaIds ?? new List<int>(), userId);
                if (!ok) return NotFound(new { message = "Ticket no encontrado." });
                return Ok(new { message = "Fincas del ticket actualizadas exitosamente (se aplicó regla de blindaje para fincas con leche recogida)." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpGet("fincas-promedios-15dias")]
        public async Task<IActionResult> ObtenerFincasPromedios([FromQuery] int? rutaId)
        {
            var fincas = await _rutasLogisticaRepository.ObtenerFincasConPromedio15DiasAsync(rutaId);
            return Ok(fincas);
        }

        [HttpGet("recolecciones-hoy-fincas")]
        public async Task<IActionResult> ObtenerRecoleccionesHoyFincas([FromQuery] System.DateTime? fecha)
        {
            var list = await _rutasLogisticaRepository.ObtenerRecoleccionesHoyFincasAsync(fecha);
            return Ok(list);
        }

        [HttpPost("solicitar-extraordinaria")]
        public async Task<IActionResult> SolicitarRecoleccionExtraordinaria([FromBody] CrearSolicitudExtraordinariaDto dto)
        {
            if (dto.FincaId <= 0) return BadRequest(new { message = "Finca inválida." });
            var userId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : 1;
            try
            {
                var id = await _rutasLogisticaRepository.SolicitarRecoleccionExtraordinariaAsync(dto, userId);
                return Ok(new { success = true, id, message = "Solicitud de recolección extraordinaria enviada para aprobación." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpGet("solicitudes-extraordinarias")]
        public async Task<IActionResult> ObtenerSolicitudesExtraordinarias([FromQuery] System.DateTime? fecha)
        {
            var list = await _rutasLogisticaRepository.ObtenerSolicitudesExtraordinariasHoyAsync(fecha);
            return Ok(list);
        }

        [HttpPost("responder-extraordinaria/{id:long}")]
        public async Task<IActionResult> ResponderSolicitudExtraordinaria([FromRoute] long id, [FromBody] ResponderSolicitudExtraordinariaDto dto)
        {
            var userId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : 1;
            try
            {
                var ok = await _rutasLogisticaRepository.ResponderSolicitudExtraordinariaAsync(id, userId, dto.Aprobar);
                if (!ok) return NotFound(new { message = "Solicitud no encontrada." });
                return Ok(new { success = true, message = dto.Aprobar ? "Solicitud aprobada exitosamente." : "Solicitud rechazada." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
    }
}
