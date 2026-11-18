using System.Threading.Tasks;
using System.Collections.Generic;

namespace Transporte.Core.Interfaces
{
    public interface ITenantService
    {
        string GetConnectionString();
        string GetTenantCode();
        string GetTenantName();
        List<string> GetModulosActivos();
        bool TieneModulo(string moduloCodigo);
        List<string>? GetAiTablasPermitidas();
        bool PuedeConsultarTablaAi(string tabla, string? moduloRequerido = null);
    }
}

