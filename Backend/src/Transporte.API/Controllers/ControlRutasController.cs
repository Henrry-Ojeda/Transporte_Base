using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;

namespace Transporte.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/controlrutas")]
    [Route("api/control-rutas")]
    public class ControlRutasController : ControllerBase
    {
        private readonly IControlRutasRepository _controlRutasRepository;

        public ControlRutasController(IControlRutasRepository controlRutasRepository)
        {
            _controlRutasRepository = controlRutasRepository;
        }

        /// <summary>
        /// Obtiene los registros de control de rutas, filtrados por fecha y/o ciclo operativo.
        /// </summary>
        [HttpGet]
        [HttpGet("hoy")]
        public async Task<IActionResult> ObtenerControles(
            [FromQuery] DateTime? fecha = null,
            [FromQuery] DateTime? fechaInicio = null,
            [FromQuery] DateTime? fechaFin = null,
            [FromQuery] int? cicloId = null)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            var controles = await _controlRutasRepository.ObtenerControlesAsync(userId, rol, fecha, fechaInicio, fechaFin, cicloId);
            return Ok(controles);
        }

        /// <summary>
        /// Obtiene un registro de control por su ID.
        /// </summary>
        [HttpGet("{id:long}")]
        public async Task<IActionResult> ObtenerControlPorId([FromRoute] long id)
        {
            var control = await _controlRutasRepository.ObtenerControlPorIdAsync(id);
            if (control == null) return NotFound(new { message = "Control no encontrado." });
            return Ok(control);
        }

        /// <summary>
        /// Registra manualmente un nuevo control de ruta (con litros ingresados por el usuario).
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> RegistrarControl([FromBody] RegistrarControlRutaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var id = await _controlRutasRepository.RegistrarControlAsync(dto, userId, rol);
                return Ok(new { message = "Control de ruta registrado exitosamente.", id });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Recalcula automáticamente el control para una fecha y conductor 
        /// sumando los datos reales de TB_RUTAS_RECOLECCION y TB_ENTREGAS_COMPANIA.
        /// Crea o actualiza el registro existente.
        /// </summary>
        [HttpPost("recalcular")]
        public async Task<IActionResult> RecalcularControl(
            [FromQuery] DateTime? fecha = null,
            [FromQuery] int? conductorId = null)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var fechaEfectiva = fecha ?? DateTime.Today;
                var conductorEfectivo = conductorId ?? userId;
                var id = await _controlRutasRepository.RecalcularControlAsync(fechaEfectiva, conductorEfectivo, userId, rol);
                return Ok(new { message = "Control de ruta recalculado exitosamente.", id });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Edita un registro de control de ruta existente (litros, estado, observación).
        /// </summary>
        [HttpPut("{id:long}")]
        public async Task<IActionResult> EditarControl([FromRoute] long id, [FromBody] EditarControlRutaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var ok = await _controlRutasRepository.EditarControlAsync(id, dto, userId, rol);
                if (!ok) return NotFound(new { message = "Control no encontrado." });
                return Ok(new { message = "Control de ruta actualizado exitosamente." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Elimina un registro de control y desvincula las rutas y entregas asociadas.
        /// </summary>
        [HttpDelete("{id:long}")]
        public async Task<IActionResult> EliminarControl([FromRoute] long id)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var ok = await _controlRutasRepository.EliminarControlAsync(id, userId, rol);
                if (!ok) return NotFound(new { message = "Control no encontrado." });
                return Ok(new { message = "Control de ruta eliminado exitosamente." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene el catálogo de procesos de ticket (RUTA, RECEPCIONADO, DESTINO, FINALIZADO).
        /// </summary>
        [HttpGet("procesos")]
        public async Task<IActionResult> ObtenerProcesos()
        {
            var procesos = await _controlRutasRepository.ObtenerProcesosDisponiblesAsync();
            return Ok(procesos);
        }

        /// <summary>
        /// Cambia el proceso actual de un ticket y registra la transición en el historial.
        /// </summary>
        [HttpPut("{id:long}/proceso")]
        public async Task<IActionResult> CambiarProceso([FromRoute] long id, [FromBody] CambiarProcesoTicketDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            try
            {
                var ok = await _controlRutasRepository.CambiarProcesoAsync(id, dto.ProcesoId, userId, dto.Observacion);
                if (!ok) return NotFound(new { message = "Control no encontrado." });
                return Ok(new { message = "Proceso del ticket actualizado exitosamente." });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Asigna o modifica las rutas logísticas asociadas a un ticket de control ya creado.
        /// </summary>
        [HttpPut("{id:long}/rutas-logisticas")]
        public async Task<IActionResult> AsignarRutasLogisticas([FromRoute] long id, [FromBody] AsignarRutasTicketDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var ok = await _controlRutasRepository.AsignarRutasLogisticasAsync(id, dto, userId, rol);
                if (!ok) return NotFound(new { message = "Ticket no encontrado." });
                return Ok(new { message = "Rutas logísticas asignadas al ticket exitosamente." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene el historial de cambios de proceso de un ticket.
        /// </summary>
        [HttpGet("{id:long}/historial")]
        public async Task<IActionResult> ObtenerHistorial([FromRoute] long id)
        {
            var historial = await _controlRutasRepository.ObtenerHistorialProcesosAsync(id);
            return Ok(historial);
        }

        // =====================================================================
        // ENDPOINTS DEL NUEVO FLUJO LOGÍSTICO DE VIAJES (AGENTS_2)
        // =====================================================================

        /// <summary>
        /// Obtiene el viaje actualmente activo del chofer (en estado ABIERTO, RECIBIDO o ENTREGADO).
        /// </summary>
        [HttpGet("viaje-activo")]
        public async Task<IActionResult> ObtenerViajeActivo([FromQuery] int? choferId = null)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER").ToUpper();
            bool esAdmin = rol.Contains("ADMIN") || rol == "SUPERADMIN" || rol == "SUPERVISOR";
            int idBusqueda = (esAdmin && choferId.HasValue && choferId.Value > 0) ? choferId.Value : userId;

            var viaje = await _controlRutasRepository.ObtenerViajeActivoChoferAsync(idBusqueda);
            if (viaje == null)
                return NoContent();
            return Ok(viaje);
        }

        /// <summary>
        /// Obtiene todos los viajes activos o del día asignados al chofer (ej. mañana y tarde).
        /// </summary>
        [HttpGet("viajes-activos")]
        public async Task<IActionResult> ObtenerViajesActivosChofer([FromQuery] int? choferId = null, [FromQuery] DateTime? fecha = null)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER").ToUpper();
            bool esAdmin = rol.Contains("ADMIN") || rol == "SUPERADMIN" || rol == "SUPERVISOR";
            int idBusqueda = (esAdmin && choferId.HasValue && choferId.Value > 0) ? choferId.Value : userId;

            var viajes = await _controlRutasRepository.ObtenerViajesActivosChoferAsync(idBusqueda, fecha);
            return Ok(viajes ?? Enumerable.Empty<ControlRutaDto>());
        }

        /// <summary>
        /// Crea un nuevo Viaje / Ticket para iniciar la recolección de leche.
        /// </summary>
        [HttpPost("iniciar-viaje")]
        public async Task<IActionResult> IniciarViaje([FromBody] CrearViajeDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var id = await _controlRutasRepository.CrearNuevoViajeAsync(dto, userId, rol);
                return Ok(new { message = "Viaje iniciado exitosamente.", id });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Registra una finca visitada dentro del viaje actual.
        /// </summary>
        [HttpPost("{id:long}/fincas")]
        public async Task<IActionResult> AgregarFinca([FromRoute] long id, [FromBody] AgregarFincaViajeDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";
            dto.ControlRutaId = id;

            try
            {
                var rutaId = await _controlRutasRepository.AgregarFincaAViajeAsync(dto, userId, rol);
                return Ok(new { message = "Finca agregada al viaje exitosamente.", rutaId });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene las fincas recolectadas dentro de un viaje específico.
        /// </summary>
        [HttpGet("{id:long}/fincas")]
        public async Task<IActionResult> ObtenerFincasViaje([FromRoute] long id)
        {
            var fincas = await _controlRutasRepository.ObtenerFincasDeViajeAsync(id);
            return Ok(fincas);
        }

        /// <summary>
        /// El chofer finaliza la recolección y despacha el viaje hacia Receptoría.
        /// </summary>
        [HttpPost("{id:long}/enviar-receptoria")]
        public async Task<IActionResult> EnviarAReceptoria([FromRoute] long id, [FromBody] EnviarAReceptoriaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            try
            {
                var ok = await _controlRutasRepository.EnviarAReceptoriaAsync(id, userId, dto.Observacion);
                if (!ok) return NotFound(new { message = "Viaje no encontrado." });
                return Ok(new { message = "Viaje enviado a Receptoría exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// En Receptoría se pesan los litros reales y se decide si la leche se queda o si se recarga y despacha a planta.
        /// </summary>
        [HttpPost("{id:long}/recibir-receptoria")]
        public async Task<IActionResult> RecibirEnReceptoria([FromRoute] long id, [FromBody] RecibirEnReceptoriaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            try
            {
                var ok = await _controlRutasRepository.RecibirEnReceptoriaAsync(id, dto, userId);
                if (!ok) return NotFound(new { message = "Viaje no encontrado." });
                return Ok(new { message = "Recepción de viaje procesada exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// El chofer entrega directamente la leche a una compañía/quesera sin pasar por receptoría.
        /// </summary>
        [HttpPost("{id:long}/entregar-compania-directo")]
        public async Task<IActionResult> EntregarDirectoCompania([FromRoute] long id, [FromBody] EntregarDirectoCompaniaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            try
            {
                var ok = await _controlRutasRepository.EntregarDirectoCompaniaAsync(id, dto, userId);
                if (!ok) return NotFound(new { message = "Viaje no encontrado." });
                return Ok(new { message = "Entrega directa registrada exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// El chofer en ruta despacha la leche hacia una compañía.
        /// Cierra la entrada de ruta en RECEPCIONADO y crea automáticamente el ticket en TB_CONTROL_COMPANIAS en estado 'EN VIA'.
        /// </summary>
        [HttpPost("{id:long}/enviar-compania")]
        public async Task<IActionResult> EnviarACompaniaDesdeRuta([FromRoute] long id, [FromBody] EnviarDesdeRutaACompaniaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            try
            {
                var controlCompaniaId = await _controlRutasRepository.EnviarDesdeRutaACompaniaAsync(id, dto, userId);
                return Ok(new { message = "Ruta finalizada y ticket de salida a compañía generado exitosamente.", controlCompaniaId });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Semi-proceso de Traspaso de Leche hacia otro chofer / ticket.
        /// Permite transferir el volumen recolectado a un ticket ya creado o crear automáticamente el nuevo ticket.
        /// </summary>
        [HttpPost("{id:long}/traspasar-leche")]
        public async Task<IActionResult> TraspasarLeche([FromRoute] long id, [FromBody] TraspasarLecheDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var resultado = await _controlRutasRepository.TraspasarLecheAViajeAsync(id, dto, userId, rol);
                return Ok(resultado);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene los despachos a compañía asociados a un ticket de ruta (ControlRutaId).
        /// </summary>
        [HttpGet("{id:long}/despachos")]
        public async Task<IActionResult> ObtenerDespachosDeTicket([FromRoute] long id)
        {
            try
            {
                var despachos = await _controlRutasRepository.ObtenerDespachosDeTicketAsync(id);
                return Ok(despachos);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Elimina un despacho individual asociado a un ticket de ruta y recalcula los totales.
        /// </summary>
        [HttpDelete("despacho/{controlCompaniaId:long}")]
        public async Task<IActionResult> EliminarDespachoDirecto([FromRoute] long controlCompaniaId)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            try
            {
                var ok = await _controlRutasRepository.EliminarDespachoDirectoAsync(controlCompaniaId, userId);
                if (!ok) return NotFound(new { message = "Despacho no encontrado." });
                return Ok(new { message = "Despacho eliminado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Registra la entrega final en planta cuando el viaje provino de receptoría.
        /// </summary>
        [HttpPost("{id:long}/entregar-planta")]
        public async Task<IActionResult> RegistrarEntregaPlanta([FromRoute] long id, [FromBody] RegistrarEntregaPlantaDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            try
            {
                var ok = await _controlRutasRepository.RegistrarEntregaPlantaAsync(id, dto, userId);
                if (!ok) return NotFound(new { message = "Viaje no encontrado." });
                return Ok(new { message = "Entrega en planta registrada exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// El Administrador realiza el cuadre final y cierre contable del viaje.
        /// </summary>
        [HttpPost("{id:long}/finalizar")]
        public async Task<IActionResult> FinalizarViaje([FromRoute] long id, [FromBody] FinalizarViajeDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            try
            {
                var ok = await _controlRutasRepository.FinalizarViajeContableAsync(id, userId, dto.Observacion);
                if (!ok) return NotFound(new { message = "Viaje no encontrado." });
                return Ok(new { message = "Viaje auditado y finalizado exitosamente." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Revierte el proceso de un viaje/ticket a un estado anterior (ej. En Ruta) registrando el motivo en auditoría.
        /// </summary>
        [HttpPost("{id:long}/revertir-proceso")]
        [HttpGet("{id:long}/revertir-proceso")]
        public async Task<IActionResult> RevertirProceso([FromRoute] long id, [FromBody] RevertirProcesoViajeDto? dto = null)
        {
            int userId = 1;
            var uidClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("id")?.Value;
            if (int.TryParse(uidClaim, out var parsedId)) userId = parsedId;
            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER").ToUpper();

            dto ??= new RevertirProcesoViajeDto
            {
                NuevoProcesoId = 1,
                Motivo = "Reversión directa a ruta"
            };

            try
            {
                var ok = await _controlRutasRepository.RevertirProcesoViajeAsync(id, dto, userId, rol);
                if (!ok) return NotFound(new { message = "Viaje no encontrado." });

                if (Request.Headers.Accept.ToString().Contains("text/html"))
                {
                    return Redirect("/rutas");
                }

                return Ok(new { message = "Proceso del viaje revertido exitosamente con registro en bitácora." });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        // =====================================================================
        // ENDPOINTS DE MODIFICACIÓN AUDITADA Y LOGS DESDE CONTROL DE VIAJES
        // =====================================================================

        /// <summary>
        /// Edita una finca de un viaje con registro obligatorio en la bitácora de auditoría.
        /// </summary>
        [HttpPut("{id:long}/fincas/{rutaId:long}/editar-auditado")]
        public async Task<IActionResult> EditarFincaAuditado(
            [FromRoute] long id,
            [FromRoute] long rutaId,
            [FromBody] EditarFincaViajeAuditadoDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var ok = await _controlRutasRepository.EditarFincaDeViajeAuditadoAsync(id, rutaId, dto, userId, rol);
                if (!ok) return NotFound(new { message = "Registro no encontrado." });
                return Ok(new { message = "Finca del viaje modificada exitosamente con registro en bitácora." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Elimina una finca de un viaje con registro obligatorio en la bitácora de auditoría.
        /// </summary>
        [HttpDelete("{id:long}/fincas/{rutaId:long}/eliminar-auditado")]
        public async Task<IActionResult> EliminarFincaAuditado(
            [FromRoute] long id,
            [FromRoute] long rutaId,
            [FromQuery] string motivo)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var ok = await _controlRutasRepository.EliminarFincaDeViajeAuditadoAsync(id, rutaId, motivo, userId, rol);
                if (!ok) return NotFound(new { message = "Registro no encontrado." });
                return Ok(new { message = "Finca eliminada del viaje exitosamente con registro en bitácora." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Limpia los litros y detalles de una finca del ticket, dejándola como NO RECOGIDA (Pendiente).
        /// </summary>
        [HttpPost("{id:long}/fincas/{rutaId:long}/limpiar")]
        public async Task<IActionResult> LimpiarFincaTicket([FromRoute] long id, [FromRoute] long rutaId)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER").ToUpper();

            if (!rol.Contains("ADMIN") && rol != "SUPERADMIN" && rol != "SUPERVISOR")
            {
                return StatusCode(403, new { message = "Solo un Administrador o Supervisor puede limpiar los datos de recolección de una finca." });
            }

            try
            {
                var ok = await _controlRutasRepository.LimpiarFincaTicketAsync(id, rutaId, userId, rol);
                if (!ok) return NotFound(new { message = "Recolección no encontrada en este ticket." });
                return Ok(new { message = "Información de la finca limpiada exitosamente. La finca queda en el ticket como NO RECOGIDA (Pendiente)." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene las entregas / receptorías asociadas a un viaje.
        /// </summary>
        [HttpGet("{id:long}/entregas")]
        public async Task<IActionResult> ObtenerEntregasViaje([FromRoute] long id)
        {
            var entregas = await _controlRutasRepository.ObtenerEntregasDeViajeAsync(id);
            return Ok(entregas);
        }

        /// <summary>
        /// Edita una entrega de un viaje con registro obligatorio en la bitácora de auditoría.
        /// </summary>
        [HttpPut("{id:long}/entregas/{entregaId:long}/editar-auditado")]
        public async Task<IActionResult> EditarEntregaAuditado(
            [FromRoute] long id,
            [FromRoute] long entregaId,
            [FromBody] EditarEntregaViajeAuditadoDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var ok = await _controlRutasRepository.EditarEntregaDeViajeAuditadoAsync(id, entregaId, dto, userId, rol);
                if (!ok) return NotFound(new { message = "Entrega no encontrada." });
                return Ok(new { message = "Entrega del viaje modificada exitosamente con registro en bitácora." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene los logs de auditoría de modificaciones de un ticket/control de viaje.
        /// </summary>
        [HttpGet("{id:long}/logs-modificaciones")]
        public async Task<IActionResult> ObtenerLogsModificaciones([FromRoute] long id)
        {
            var logs = await _controlRutasRepository.ObtenerLogsModificacionesControlAsync(id);
            return Ok(logs);
        }

        /// <summary>
        /// Obtiene la bitácora global de auditoría de todas las modificaciones del sistema (Solo SUPERADMIN y ADMIN).
        /// </summary>
        [HttpGet("logs-auditoria-global")]
        public async Task<IActionResult> ObtenerLogsAuditoriaGlobal(
            [FromQuery] DateTime? fechaDesde,
            [FromQuery] DateTime? fechaHasta,
            [FromQuery] string? tipoEntidad,
            [FromQuery] string? busqueda,
            [FromQuery] int limite = 200)
        {
            var rol = (User.FindFirstValue(ClaimTypes.Role) ?? "").ToUpper();
            if (rol != "SUPERADMIN" && rol != "ADMIN" && rol != "SUPER_ADMIN")
            {
                return Forbid();
            }

            var logs = await _controlRutasRepository.ObtenerLogsAuditoriaGlobalAsync(fechaDesde, fechaHasta, tipoEntidad, busqueda, limite);
            return Ok(logs);
        }

        /// <summary>
        /// Valida filas cargadas desde un archivo Excel antes de crear tickets.
        /// Verifica fincas, choferes, litros, fechas y detección de duplicados ya existentes.
        /// </summary>
        [HttpPost("validar-carga-masiva-excel")]
        public async Task<IActionResult> ValidarCargaMasivaExcel([FromBody] ValidarCargaMasivaExcelRequestDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var resultado = await _controlRutasRepository.ValidarCargaMasivaExcelAsync(dto, userId, rol);
                return Ok(resultado);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Ejecuta la creación masiva de nuevos tickets y paradas en base a la data de Excel validada.
        /// Los tickets se crean en estado ABIERTO para que el SuperAdmin los revise y finalice.
        /// </summary>
        [HttpPost("ejecutar-carga-masiva-excel")]
        public async Task<IActionResult> EjecutarCargaMasivaExcel([FromBody] EjecutarCargaMasivaExcelRequestDto dto)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var rol = User.FindFirstValue(ClaimTypes.Role) ?? "CHOFER";

            try
            {
                var resultado = await _controlRutasRepository.EjecutarCargaMasivaExcelAsync(dto, userId, rol);
                return Ok(resultado);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
    }
}
