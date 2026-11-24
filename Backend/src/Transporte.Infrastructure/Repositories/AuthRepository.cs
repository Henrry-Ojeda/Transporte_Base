using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

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
        public AuthRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
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

            if (user.Rol == "ADMIN" || user.Rol == "SUPERADMIN")
            {
                return new[] { "DASHBOARD", "RUTAS_ALL", "MERMAS", "SEMANAS", "LIQUIDACION", "CATALOGOS", "BCV" };
            }

            using var connection = new SqlConnection(_connectionString);
            var sqlPermisos = @"
                SELECT DISTINCT p.Codigo
                FROM TB_USUARIOS u
                INNER JOIN TB_ROL_PERMISOS rp ON (u.RolId = rp.RolId OR (u.RolId IS NULL AND rp.RolId = (SELECT TOP 1 Id FROM TB_ROLES WHERE Codigo = u.Rol)))
                INNER JOIN TB_PERMISOS p ON rp.PermisoId = p.Id
                WHERE u.Id = @usuarioId AND rp.Concedido = 1 AND p.Activo = 1";

            var permisosDb = (await connection.QueryAsync<string>(sqlPermisos, new { usuarioId })).ToList();
            if (string.Equals(user.Rol, "SUPERVISOR", StringComparison.OrdinalIgnoreCase))
            {
                if (!permisosDb.Contains("DASHBOARD")) permisosDb.Add("DASHBOARD");
                if (!permisosDb.Contains("RUTAS_ALL")) permisosDb.Add("RUTAS_ALL");
                if (!permisosDb.Contains("MERMAS")) permisosDb.Add("MERMAS");
                if (!permisosDb.Contains("CATALOGOS")) permisosDb.Add("CATALOGOS");
            }
            else if (permisosDb.Count == 0)
            {
                permisosDb.AddRange(new[] { "RUTAS_OWN", "DASHBOARD" });
            }

            return permisosDb;
        }
    }

}
