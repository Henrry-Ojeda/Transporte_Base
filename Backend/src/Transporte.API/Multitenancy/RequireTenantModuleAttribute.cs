using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;
using Transporte.Core.Interfaces;

namespace Transporte.API.Multitenancy
{
    /// <summary>
    /// Filtro de autorización a nivel de Endpoint para arquitectura SaaS modular.
    /// Valida que la empresa (tenant) que realiza la petición tenga el módulo contratado
    /// y activo en DB_SAAS_MASTER. Si fue cancelado o deshabilitado, bloquea la petición con 403 Forbidden.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
    public class RequireTenantModuleAttribute : Attribute, IAsyncActionFilter
    {
        private readonly string _moduloCodigo;

        public RequireTenantModuleAttribute(string moduloCodigo)
        {
            _moduloCodigo = moduloCodigo ?? string.Empty;
        }

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            if (!string.IsNullOrWhiteSpace(_moduloCodigo))
            {
                var tenantService = context.HttpContext.RequestServices.GetRequiredService<ITenantService>();
                bool tieneModulo = tenantService.TieneModulo(_moduloCodigo);

                if (!tieneModulo)
                {
                    context.Result = new ObjectResult(new
                    {
                        statusCode = StatusCodes.Status403Forbidden,
                        error = "MODULO_NO_CONTRATADO",
                        modulo = _moduloCodigo,
                        message = $"El módulo '{_moduloCodigo}' no está activo para su empresa en la plataforma SaaS. Comuníquese con su proveedor o administrador para contratarlo."
                    })
                    {
                        StatusCode = StatusCodes.Status403Forbidden
                    };
                    return;
                }
            }

            await next();
        }
    }
}

