using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transporte.Core.DTOs;
using Transporte.Infrastructure.Repositories;
using Transporte.API.Multitenancy;

namespace Transporte.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [RequireTenantModule("MOD_ASISTENTE_IA")]
    public class ChatController : ControllerBase
    {
        private readonly IChatRepository _chatRepository;

        public ChatController(IChatRepository chatRepository)
        {
            _chatRepository = chatRepository;
        }

        [HttpPost("analizar")]
        public async Task<IActionResult> Analizar([FromBody] ChatRequestDto dto)
        {
            try
            {
                var result = await _chatRepository.AnalizarDatosSistemaAsync(dto?.Mensaje ?? "");
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Error procesando el análisis de datos", details = ex.Message });
            }
        }

        [HttpGet("sugerencias")]
        public async Task<IActionResult> ObtenerSugerencias()
        {
            try
            {
                var sugerencias = await _chatRepository.ObtenerSugerenciasPromptAsync();
                return Ok(sugerencias);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Error al obtener sugerencias del chat", details = ex.Message });
            }
        }
    }
}
