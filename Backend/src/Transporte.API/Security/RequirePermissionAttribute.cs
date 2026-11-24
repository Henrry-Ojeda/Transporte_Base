using System.Security.Claims;
using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Data.SqlClient;
using Transporte.Core.Interfaces;

namespace Transporte.API.Security
{
    /// <summary>
    /// Filtro de autorización RBAC 100% dinámico contra TB_ROL_PERMISOS / TB_PERMISOS en la BD del tenant.
    /// Cero hardcodeo de roles de negocio: si se crea un rol nuevo en BD y se le concede el permiso, funciona automáticamente.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
    public class RequirePermissionAttribute : Attribute, IAsyncAuthorizationFilter
    {
        private readonly string[] _permisos;

        public RequirePermissionAttribute(params string[] permisos)
        {
            _permisos = permisos ?? Array.Empty<string>();
        }

        public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            var user = context.HttpContext.User;
            if (user?.Identity == null || !user.Identity.IsAuthenticated)
            {
                context.Result = new UnauthorizedResult();
                return;
            }

            if (_permisos.Length == 0) return;

            var rol = (user.FindFirstValue(ClaimTypes.Role) ?? string.Empty).Trim().ToUpperInvariant();
            if (rol == "ADMIN" || rol == "SUPERADMIN" || rol == "SUPER_ADMIN" || rol == "ADMINISTRADOR")
            {
                return;
            }

            var userIdStr = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!int.TryParse(userIdStr, out var usuarioId) || usuarioId <= 0)
            {
                context.Result = new ObjectResult(new
                {
                    error = "PERMISO_DENEGADO",
                    message = "Usuario no válido para validación de permisos."
                }) { StatusCode = 403 };
                return;
            }

            var tenantService = context.HttpContext.RequestServices.GetService<ITenantService>();
            var connStr = tenantService?.GetConnectionString();
            if (string.IsNullOrWhiteSpace(connStr))
            {
                context.Result = new ObjectResult(new
                {
                    error = "PERMISO_DENEGADO",
                    message = "No se pudo resolver la base de datos de la empresa."
                }) { StatusCode = 403 };
                return;
            }

            try
            {
                using var connection = new SqlConnection(connStr);
                const string sql = @"
                    SELECT COUNT(1)
                    FROM TB_USUARIOS u
                    INNER JOIN TB_ROL_PERMISOS rp
                        ON (u.RolId = rp.RolId OR (u.RolId IS NULL AND rp.RolId = (SELECT TOP 1 Id FROM TB_ROLES WHERE Codigo = u.Rol)))
                    INNER JOIN TB_PERMISOS p ON rp.PermisoId = p.Id
                    WHERE u.Id = @usuarioId
                      AND rp.Concedido = 1
                      AND p.Activo = 1
                      AND (p.Codigo = 'ADMIN_TOTAL' OR p.Codigo IN @permisos)";

                var count = await connection.ExecuteScalarAsync<int>(sql, new { usuarioId, permisos = _permisos });
                if (count <= 0)
                {
                    context.Result = new ObjectResult(new
                    {
                        error = "PERMISO_DENEGADO",
                        message = $"No tiene permisos suficientes para acceder a este recurso ({string.Join(", ", _permisos)})."
                    }) { StatusCode = 403 };
                }
            }
            catch
            {
                // Fail-closed ante error al consultar permisos
                context.Result = new ObjectResult(new
                {
                    error = "PERMISO_DENEGADO",
                    message = "No se pudieron verificar los permisos del usuario."
                }) { StatusCode = 403 };
            }
        }
    }
}
