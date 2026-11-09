using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/notificaciones")]
    [Authorize]
    public class NotificacionesController : ControllerBase
    {
        private readonly INotificacionesRepository _notificacionesRepository;

        public NotificacionesController(INotificacionesRepository notificacionesRepository)
        {
            _notificacionesRepository = notificacionesRepository;
        }

        private int GetCurrentUserId()
        {
            var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("id")?.Value;
            return int.TryParse(idClaim, out var id) ? id : 0;
        }

        [HttpGet("mis-notificaciones")]
        public async Task<IActionResult> ObtenerMisNotificaciones([FromQuery] int limite = 30)
        {
            try
            {
                var userId = GetCurrentUserId();
                if (userId <= 0) return Unauthorized(new { message = "Usuario no identificado." });

                var lista = await _notificacionesRepository.ObtenerMisNotificacionesAsync(userId, limite);
                return Ok(lista ?? Enumerable.Empty<NotificacionMovilDto>());
            }
            catch (Exception)
            {
                return Ok(Enumerable.Empty<NotificacionMovilDto>());
            }
        }

        [HttpPut("{id}/leer")]
        public async Task<IActionResult> MarcarLeida([FromRoute] long id)
        {
            var userId = GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new { message = "Usuario no identificado." });

            var ok = await _notificacionesRepository.MarcarComoLeidaAsync(id, userId);
            return Ok(new { success = ok });
        }

        [HttpPut("marcar-todas-leidas")]
        public async Task<IActionResult> MarcarTodasLeidas()
        {
            var userId = GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new { message = "Usuario no identificado." });

            var ok = await _notificacionesRepository.MarcarTodasComoLeidasAsync(userId);
            return Ok(new { success = ok });
        }

        [HttpPost("enviar")]
        public async Task<IActionResult> EnviarNotificacion([FromBody] CrearNotificacionMovilDto dto)
        {
            if (dto.UsuarioId <= 0 || string.IsNullOrWhiteSpace(dto.Titulo))
            {
                return BadRequest(new { message = "UsuarioId y Titulo son obligatorios." });
            }

            var id = await _notificacionesRepository.CrearNotificacionAsync(dto);
            return Ok(new { success = true, id });
        }

        [HttpPost("suscribir-push")]
        public async Task<IActionResult> SuscribirPush([FromBody] SuscripcionPushDto dto)
        {
            var userId = GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new { message = "Usuario no identificado." });
            if (string.IsNullOrWhiteSpace(dto.Endpoint) || string.IsNullOrWhiteSpace(dto.P256dh) || string.IsNullOrWhiteSpace(dto.Auth))
            {
                return BadRequest(new { message = "Datos de suscripción incompletos." });
            }

            var ok = await _notificacionesRepository.GuardarSuscripcionPushAsync(userId, dto);
            return Ok(new { success = ok, message = "Dispositivo suscrito a notificaciones Push a nivel de SO." });
        }

        [HttpGet("vapid-public-key")]
        [AllowAnonymous]
        public IActionResult ObtenerVapidPublicKey()
        {
            return Ok(new { publicKey = "BLaD6DOWHSNTZ2TVY91CnRLuOCb8p9NpUv4AGslQ_Cp1vg3oiHA7MIR-qF74ZxzkHKp1ucbg2kVMU61S4IpxRHo" });
        }

        [HttpPost("probar-push-diferido")]
        public async Task<IActionResult> ProbarPushDiferido([FromQuery] int segundos = 5)
        {
            var userId = GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new { message = "Usuario no identificado." });

            _ = Task.Run(async () =>
            {
                await Task.Delay(Math.Max(1, segundos) * 1000);
                await _notificacionesRepository.EnviarWebPushAsync(
                    userId, 
                    "🚨 AVISO DE RUTA (Pantalla Bloqueada)", 
                    "Prueba de notificación recibida con la pantalla apagada / teléfono bloqueado."
                );
            });

            return Ok(new { success = true, message = $"Notificación programada en {segundos} segundos. ¡Bloquea tu pantalla ahora para probarla!" });
        }
    }
}

