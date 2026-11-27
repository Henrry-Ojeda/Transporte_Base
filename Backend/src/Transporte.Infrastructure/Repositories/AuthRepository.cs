using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;
using Transporte.Core.Interfaces;
using Transporte.Core.Security;

namespace Transporte.Infrastructure.Repositories
{
    public interface IAuthRepository
    {
        Task<Usuario?> ObtenerPorUsernameAsync(string username);
        Task<Usuario?> ObtenerPorIdAsync(int id);
        Task<IEnumerable<string>> ObtenerPermisosUsuarioAsync(int usuarioId);
    }

    public class AuthRepository : IAuthRepository
    {
        private readonly string _connectionString;
        private readonly ITenantService? _tenantService;
        public AuthRepository(IConfiguration configuration, ITenantService? tenantService = null)
        {
            _tenantService = tenantService;
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        public async Task<Usuario?> ObtenerPorUsernameAsync(string username)
        {
            using var connection = new SqlConnection(_connectionString);
            var u = (username ?? "").Trim();
            return await connection.QueryFirstOrDefaultAsync<Usuario>(@"
                SELECT TOP 1 * FROM TB_USUARIOS 
                WHERE LOWER(Username) = LOWER(@u) AND Activo = 1", 
                new { u });
        }

        public async Task<Usuario?> ObtenerPorIdAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryFirstOrDefaultAsync<Usuario>(
                "SELECT * FROM TB_USUARIOS WHERE Id = @id", new { id });
        }

        public async Task<IEnumerable<string>> ObtenerPermisosUsuarioAsync(int usuarioId)
        {
            var user = await ObtenerPorIdAsync(usuarioId);
            if (user == null) return Enumerable.Empty<string>();

            var rolUpper = (user.Rol ?? string.Empty).Trim().ToUpperInvariant();
            if (rolUpper == "ADMIN" || rolUpper == "SUPERADMIN" || rolUpper == "SUPER_ADMIN")
            {
                return new[] { "DASHBOARD", "RUTAS_ALL", "MERMAS", "SEMANAS", "LIQUIDACION", "CATALOGOS", "BCV" };
            }

            using var connection = new SqlConnection(_connectionString);
            var sqlPermisos = @"
                SELECT DISTINCT p.Codigo AS PermisoCodigo, m.Codigo AS ModuloCodigo
                FROM TB_USUARIOS u
                INNER JOIN TB_ROL_PERMISOS rp ON (u.RolId = rp.RolId OR (u.RolId IS NULL AND rp.RolId = (SELECT TOP 1 Id FROM TB_ROLES WHERE Codigo = u.Rol)))
                INNER JOIN TB_PERMISOS p ON rp.PermisoId = p.Id
                INNER JOIN TB_MODULOS m ON p.ModuloId = m.Id
                WHERE u.Id = @usuarioId
                  AND u.Activo = 1
                  AND rp.Concedido = 1
                  AND p.Activo = 1
                  AND m.Activo = 1";

            var filas = await connection.QueryAsync<(string PermisoCodigo, string ModuloCodigo)>(sqlPermisos, new { usuarioId });
            var modulosSaasActivos = _tenantService?.GetModulosActivos();

            // Si un módulo NO está habilitado en SaaS_Manager, sus permisos quedan vacíos para roles no-admin
            var permisosSincronizados = filas
                .Where(f => SaasModulePermissionMap.IsModuloRbacHabilitado(f.ModuloCodigo, modulosSaasActivos))
                .Select(f => f.PermisoCodigo)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            return permisosSincronizados;
        }
    }

}
