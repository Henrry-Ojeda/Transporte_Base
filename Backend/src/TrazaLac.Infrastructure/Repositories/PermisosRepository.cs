using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using TrazaLac.Core.DTOs;

namespace TrazaLac.Infrastructure.Repositories
{
    public interface IPermisosRepository
    {
        // Módulos
        Task<IEnumerable<ModuloDto>> ObtenerModulosAsync(bool soloActivos = false);
        Task<ModuloDto?> ObtenerModuloPorIdAsync(int id);
        Task<int> CrearModuloAsync(CrearModuloDto dto);
        Task<bool> ActualizarModuloAsync(int id, CrearModuloDto dto);
        Task<bool> EliminarModuloAsync(int id);

        // Permisos / Acciones
        Task<IEnumerable<PermisoDto>> ObtenerPermisosAsync(int? moduloId = null, bool soloActivos = false);
        Task<PermisoDto?> ObtenerPermisoPorIdAsync(int id);
        Task<int> CrearPermisoAsync(CrearPermisoDto dto);
        Task<bool> ActualizarPermisoAsync(int id, CrearPermisoDto dto);
        Task<bool> EliminarPermisoAsync(int id);

        // Matriz RBAC
        Task<MatrizSeguridadCompletaDto> ObtenerMatrizCompletaAsync();
        Task<IEnumerable<RolPermisoItemDto>> ObtenerPermisosPorRolAsync(int rolId);
        Task<bool> GuardarRolPermisosAsync(int rolId, List<int> permisosIds);
        Task<bool> ToggleRolPermisoAsync(int rolId, int permisoId, bool concedido);

        // Roles (CRUD SUPERADMIN)
        Task<IEnumerable<RolDto>> ObtenerRolesAsync(bool soloActivos = false);
        Task<RolDto?> ObtenerRolPorIdAsync(int id);
        Task<int> CrearRolAsync(CrearRolDto dto);
        Task<bool> ActualizarRolAsync(int id, CrearRolDto dto);
        Task<bool> EliminarRolAsync(int id);
    }

    public class PermisosRepository : IPermisosRepository
    {
        private readonly string _connectionString;

        public PermisosRepository(IConfiguration configuration, TrazaLac.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE_V2;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        // ====================================================================
        // MÓDULOS
        // ====================================================================
        public async Task<IEnumerable<ModuloDto>> ObtenerModulosAsync(bool soloActivos = false)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT m.Id, m.Codigo, m.Nombre, m.Icono, m.Orden, m.Activo,
                       COUNT(p.Id) AS TotalPermisos
                FROM TB_MODULOS m
                LEFT JOIN TB_PERMISOS p ON m.Id = p.ModuloId
                " + (soloActivos ? " WHERE m.Activo = 1 " : "") + @"
                GROUP BY m.Id, m.Codigo, m.Nombre, m.Icono, m.Orden, m.Activo
                ORDER BY m.Orden ASC, m.Nombre ASC";

            return await connection.QueryAsync<ModuloDto>(sql);
        }

        public async Task<ModuloDto?> ObtenerModuloPorIdAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT m.Id, m.Codigo, m.Nombre, m.Icono, m.Orden, m.Activo,
                       COUNT(p.Id) AS TotalPermisos
                FROM TB_MODULOS m
                LEFT JOIN TB_PERMISOS p ON m.Id = p.ModuloId
                WHERE m.Id = @id
                GROUP BY m.Id, m.Codigo, m.Nombre, m.Icono, m.Orden, m.Activo";

            return await connection.QueryFirstOrDefaultAsync<ModuloDto>(sql, new { id });
        }

        public async Task<int> CrearModuloAsync(CrearModuloDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                INSERT INTO TB_MODULOS (Codigo, Nombre, Icono, Orden, Activo)
                VALUES (@Codigo, @Nombre, @Icono, @Orden, @Activo);
                SELECT CAST(SCOPE_IDENTITY() as int);";

            return await connection.ExecuteScalarAsync<int>(sql, new
            {
                Codigo = dto.Codigo.Trim().ToUpper(),
                Nombre = dto.Nombre.Trim(),
                Icono = string.IsNullOrWhiteSpace(dto.Icono) ? "fa-cube" : dto.Icono.Trim(),
                dto.Orden,
                dto.Activo
            });
        }

        public async Task<bool> ActualizarModuloAsync(int id, CrearModuloDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                UPDATE TB_MODULOS 
                SET Codigo = @Codigo,
                    Nombre = @Nombre,
                    Icono = @Icono,
                    Orden = @Orden,
                    Activo = @Activo
                WHERE Id = @id";

            var rows = await connection.ExecuteAsync(sql, new
            {
                id,
                Codigo = dto.Codigo.Trim().ToUpper(),
                Nombre = dto.Nombre.Trim(),
                Icono = string.IsNullOrWhiteSpace(dto.Icono) ? "fa-cube" : dto.Icono.Trim(),
                dto.Orden,
                dto.Activo
            });

            return rows > 0;
        }

        public async Task<bool> EliminarModuloAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            // Primero eliminar permisos asignados en cascada si no hay FK cascade
            await connection.ExecuteAsync(@"
                DELETE FROM TB_ROL_PERMISOS WHERE PermisoId IN (SELECT Id FROM TB_PERMISOS WHERE ModuloId = @id);
                DELETE FROM TB_PERMISOS WHERE ModuloId = @id;
                DELETE FROM TB_MODULOS WHERE Id = @id;", new { id });
            return true;
        }

        // ====================================================================
        // PERMISOS / ACCIONES ATÓMICAS
        // ====================================================================
        public async Task<IEnumerable<PermisoDto>> ObtenerPermisosAsync(int? moduloId = null, bool soloActivos = false)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT p.Id, p.ModuloId, m.Codigo AS ModuloCodigo, m.Nombre AS ModuloNombre, m.Icono AS ModuloIcono,
                       p.Codigo, p.Nombre, p.Accion, p.Descripcion, p.Activo,
                       COUNT(rp.RolId) AS TotalRolesAsignados
                FROM TB_PERMISOS p
                INNER JOIN TB_MODULOS m ON p.ModuloId = m.Id
                LEFT JOIN TB_ROL_PERMISOS rp ON p.Id = rp.PermisoId AND rp.Concedido = 1
                WHERE 1=1 " +
                (moduloId.HasValue ? " AND p.ModuloId = @moduloId " : "") +
                (soloActivos ? " AND p.Activo = 1 AND m.Activo = 1 " : "") + @"
                GROUP BY p.Id, p.ModuloId, m.Codigo, m.Nombre, m.Icono, m.Orden,
                         p.Codigo, p.Nombre, p.Accion, p.Descripcion, p.Activo
                ORDER BY m.Orden ASC, p.ModuloId ASC, 
                         CASE p.Accion WHEN 'VER' THEN 1 WHEN 'EDITAR' THEN 2 WHEN 'CREAR' THEN 3 WHEN 'AGREGAR' THEN 3 WHEN 'ELIMINAR' THEN 4 ELSE 5 END ASC, 
                         p.Codigo ASC";

            return await connection.QueryAsync<PermisoDto>(sql, new { moduloId });
        }

        public async Task<PermisoDto?> ObtenerPermisoPorIdAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT p.Id, p.ModuloId, m.Codigo AS ModuloCodigo, m.Nombre AS ModuloNombre, m.Icono AS ModuloIcono,
                       p.Codigo, p.Nombre, p.Accion, p.Descripcion, p.Activo,
                       COUNT(rp.RolId) AS TotalRolesAsignados
                FROM TB_PERMISOS p
                INNER JOIN TB_MODULOS m ON p.ModuloId = m.Id
                LEFT JOIN TB_ROL_PERMISOS rp ON p.Id = rp.PermisoId AND rp.Concedido = 1
                WHERE p.Id = @id
                GROUP BY p.Id, p.ModuloId, m.Codigo, m.Nombre, m.Icono,
                         p.Codigo, p.Nombre, p.Accion, p.Descripcion, p.Activo";

            return await connection.QueryFirstOrDefaultAsync<PermisoDto>(sql, new { id });
        }

        public async Task<int> CrearPermisoAsync(CrearPermisoDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                INSERT INTO TB_PERMISOS (ModuloId, Codigo, Nombre, Accion, Descripcion, Activo)
                VALUES (@ModuloId, @Codigo, @Nombre, @Accion, @Descripcion, @Activo);
                SELECT CAST(SCOPE_IDENTITY() as int);";

            var id = await connection.ExecuteScalarAsync<int>(sql, new
            {
                dto.ModuloId,
                Codigo = dto.Codigo.Trim().ToUpper(),
                Nombre = dto.Nombre.Trim(),
                Accion = string.IsNullOrWhiteSpace(dto.Accion) ? "VER" : dto.Accion.Trim().ToUpper(),
                dto.Descripcion,
                dto.Activo
            });

            // Conceder automáticamente al rol ADMIN (RolId = 1)
            await connection.ExecuteAsync(@"
                IF NOT EXISTS (SELECT 1 FROM TB_ROL_PERMISOS WHERE RolId = 1 AND PermisoId = @id)
                BEGIN
                    INSERT INTO TB_ROL_PERMISOS (RolId, PermisoId, Concedido, CreatedAt)
                    VALUES (1, @id, 1, GETDATE());
                END", new { id });

            return id;
        }

        public async Task<bool> ActualizarPermisoAsync(int id, CrearPermisoDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                UPDATE TB_PERMISOS
                SET ModuloId = @ModuloId,
                    Codigo = @Codigo,
                    Nombre = @Nombre,
                    Accion = @Accion,
                    Descripcion = @Descripcion,
                    Activo = @Activo
                WHERE Id = @id";

            var rows = await connection.ExecuteAsync(sql, new
            {
                id,
                dto.ModuloId,
                Codigo = dto.Codigo.Trim().ToUpper(),
                Nombre = dto.Nombre.Trim(),
                Accion = string.IsNullOrWhiteSpace(dto.Accion) ? "VER" : dto.Accion.Trim().ToUpper(),
                dto.Descripcion,
                dto.Activo
            });

            return rows > 0;
        }

        public async Task<bool> EliminarPermisoAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.ExecuteAsync(@"
                DELETE FROM TB_ROL_PERMISOS WHERE PermisoId = @id;
                DELETE FROM TB_PERMISOS WHERE Id = @id;", new { id });
            return true;
        }

        // ====================================================================
        // MATRIZ RBAC COMPLETA
        // ====================================================================
        public async Task<MatrizSeguridadCompletaDto> ObtenerMatrizCompletaAsync()
        {
            using var connection = new SqlConnection(_connectionString);

            // 1. Roles
            var roles = (await connection.QueryAsync<RolDto>(
                "SELECT Id, Codigo, Nombre, Descripcion, Activo FROM TB_ROLES WHERE Activo = 1 ORDER BY Id ASC")).ToList();

            // 2. Módulos
            var modulos = (await ObtenerModulosAsync(soloActivos: true)).ToList();

            // 3. Permisos
            var permisos = (await ObtenerPermisosAsync(soloActivos: true)).ToList();

            // 4. Asignaciones por Rol
            var asignacionesRaw = await connection.QueryAsync<(int RolId, int PermisoId)>(
                "SELECT RolId, PermisoId FROM TB_ROL_PERMISOS WHERE Concedido = 1");

            var dictAsignaciones = asignacionesRaw
                .GroupBy(x => x.RolId)
                .ToDictionary(g => g.Key, g => g.Select(x => x.PermisoId).ToList());

            var matrizRoles = roles.Select(r => new MatrizRolDto
            {
                RolId = r.Id,
                RolCodigo = r.Codigo,
                RolNombre = r.Nombre,
                RolDescripcion = r.Descripcion,
                PermisosAsignadosIds = dictAsignaciones.TryGetValue(r.Id, out var pIds) ? pIds : new List<int>()
            }).ToList();

            return new MatrizSeguridadCompletaDto
            {
                Roles = roles,
                Modulos = modulos,
                Permisos = permisos,
                MatrizPorRol = matrizRoles
            };
        }

        public async Task<IEnumerable<RolPermisoItemDto>> ObtenerPermisosPorRolAsync(int rolId)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT p.Id AS PermisoId, p.Codigo AS PermisoCodigo, p.Nombre AS PermisoNombre, p.Accion,
                       m.Id AS ModuloId, m.Codigo AS ModuloCodigo, m.Nombre AS ModuloNombre, m.Icono AS ModuloIcono,
                       CASE WHEN rp.Concedido = 1 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS Concedido
                FROM TB_PERMISOS p
                INNER JOIN TB_MODULOS m ON p.ModuloId = m.Id
                LEFT JOIN TB_ROL_PERMISOS rp ON p.Id = rp.PermisoId AND rp.RolId = @rolId
                WHERE p.Activo = 1 AND m.Activo = 1
                ORDER BY m.Orden ASC, p.ModuloId ASC, 
                         CASE p.Accion WHEN 'VER' THEN 1 WHEN 'EDITAR' THEN 2 WHEN 'CREAR' THEN 3 WHEN 'AGREGAR' THEN 3 WHEN 'ELIMINAR' THEN 4 ELSE 5 END ASC, 
                         p.Codigo ASC";

            return await connection.QueryAsync<RolPermisoItemDto>(sql, new { rolId });
        }

        public async Task<bool> GuardarRolPermisosAsync(int rolId, List<int> permisosIds)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                // Limpiar asignaciones previas del rol
                await connection.ExecuteAsync(
                    "DELETE FROM TB_ROL_PERMISOS WHERE RolId = @rolId",
                    new { rolId },
                    transaction);

                // Insertar nuevas asignaciones concedidas
                if (permisosIds != null && permisosIds.Any())
                {
                    var sqlInsert = @"
                        INSERT INTO TB_ROL_PERMISOS (RolId, PermisoId, Concedido, CreatedAt)
                        VALUES (@rolId, @permisoId, 1, GETDATE())";

                    foreach (var pId in permisosIds.Distinct())
                    {
                        await connection.ExecuteAsync(sqlInsert, new { rolId, permisoId = pId }, transaction);
                    }
                }

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> ToggleRolPermisoAsync(int rolId, int permisoId, bool concedido)
        {
            using var connection = new SqlConnection(_connectionString);
            if (concedido)
            {
                var sql = @"
                    IF EXISTS (SELECT 1 FROM TB_ROL_PERMISOS WHERE RolId = @rolId AND PermisoId = @permisoId)
                        UPDATE TB_ROL_PERMISOS SET Concedido = 1 WHERE RolId = @rolId AND PermisoId = @permisoId;
                    ELSE
                        INSERT INTO TB_ROL_PERMISOS (RolId, PermisoId, Concedido, CreatedAt) VALUES (@rolId, @permisoId, 1, GETDATE());";
                await connection.ExecuteAsync(sql, new { rolId, permisoId });
            }
            else
            {
                await connection.ExecuteAsync(
                    "DELETE FROM TB_ROL_PERMISOS WHERE RolId = @rolId AND PermisoId = @permisoId",
                    new { rolId, permisoId });
            }
            return true;
        }
        // ====================================================================
        // GESTIÓN DE ROLES (CRUD SUPERADMIN)
        // ====================================================================
        public async Task<IEnumerable<RolDto>> ObtenerRolesAsync(bool soloActivos = false)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT r.Id, r.Codigo, r.Nombre, r.Descripcion, r.Activo,
                       (SELECT COUNT(*) FROM TB_USUARIOS u WHERE u.RolId = r.Id OR (u.RolId IS NULL AND u.Rol = r.Codigo)) AS UsuariosCount
                FROM TB_ROLES r " +
                (soloActivos ? " WHERE r.Activo = 1 " : "") +
                " ORDER BY r.Id ASC";
            return await connection.QueryAsync<RolDto>(sql);
        }

        public async Task<RolDto?> ObtenerRolPorIdAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT r.Id, r.Codigo, r.Nombre, r.Descripcion, r.Activo,
                       (SELECT COUNT(*) FROM TB_USUARIOS u WHERE u.RolId = r.Id OR (u.RolId IS NULL AND u.Rol = r.Codigo)) AS UsuariosCount
                FROM TB_ROLES r
                WHERE r.Id = @id";
            return await connection.QueryFirstOrDefaultAsync<RolDto>(sql, new { id });
        }

        public async Task<int> CrearRolAsync(CrearRolDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            var cod = dto.Codigo.Trim().ToUpper();
            var existe = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM TB_ROLES WHERE UPPER(Codigo) = @cod", new { cod });
            if (existe > 0) throw new InvalidOperationException($"Ya existe un rol con el código '{cod}'.");

            var sql = @"
                INSERT INTO TB_ROLES (Codigo, Nombre, Descripcion, Activo)
                VALUES (@cod, @nombre, @descripcion, @activo);
                SELECT CAST(SCOPE_IDENTITY() AS INT);";

            return await connection.ExecuteScalarAsync<int>(sql, new
            {
                cod,
                nombre = dto.Nombre.Trim(),
                descripcion = dto.Descripcion?.Trim(),
                dto.Activo
            });
        }

        public async Task<bool> ActualizarRolAsync(int id, CrearRolDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            var rol = await ObtenerRolPorIdAsync(id);
            if (rol == null) return false;

            var cod = dto.Codigo.Trim().ToUpper();
            var existe = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM TB_ROLES WHERE UPPER(Codigo) = @cod AND Id <> @id", new { cod, id });
            if (existe > 0) throw new InvalidOperationException($"Ya existe otro rol con el código '{cod}'.");

            var sql = @"
                UPDATE TB_ROLES
                SET Codigo = @cod,
                    Nombre = @nombre,
                    Descripcion = @descripcion,
                    Activo = @activo
                WHERE Id = @id";

            var rows = await connection.ExecuteAsync(sql, new
            {
                id,
                cod,
                nombre = dto.Nombre.Trim(),
                descripcion = dto.Descripcion?.Trim(),
                dto.Activo
            });

            return rows > 0;
        }

        public async Task<bool> EliminarRolAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var rol = await ObtenerRolPorIdAsync(id);
            if (rol == null) return false;

            var cod = rol.Codigo.ToUpper();
            if (cod == "SUPERADMIN" || cod == "ADMIN" || cod == "CHOFER")
            {
                throw new InvalidOperationException($"El rol del sistema '{rol.Nombre}' ({cod}) no puede ser eliminado.");
            }

            var usuariosCount = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM TB_USUARIOS WHERE RolId = @id OR UPPER(Rol) = @cod", new { id, cod });
            if (usuariosCount > 0)
            {
                throw new InvalidOperationException($"No se puede eliminar el rol '{rol.Nombre}' porque tiene {usuariosCount} usuario(s) asignado(s). Reasigne los usuarios antes de eliminarlo.");
            }

            // Eliminar asignaciones de permisos
            await connection.ExecuteAsync("DELETE FROM TB_ROL_PERMISOS WHERE RolId = @id", new { id });
            var rows = await connection.ExecuteAsync("DELETE FROM TB_ROLES WHERE Id = @id", new { id });
            return rows > 0;
        }
    }
}