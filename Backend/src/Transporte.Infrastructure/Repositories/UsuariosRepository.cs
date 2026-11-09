using System.Data;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

namespace Transporte.Infrastructure.Repositories
{
    public interface IUsuariosRepository
    {
        Task<IEnumerable<UsuarioDto>> ObtenerUsuariosAsync(string? rol = null, bool soloActivos = false);
        Task<UsuarioDto?> ObtenerUsuarioPorIdAsync(int id);
        Task<int> CrearUsuarioAsync(CrearUsuarioDto dto);
        Task<bool> ActualizarUsuarioAsync(int id, EditarUsuarioDto dto);
        Task<bool> ActualizarPasswordAsync(int id, string nuevaPassword);
        Task<bool> EliminarUsuarioAsync(int id);
        Task<IEnumerable<RolDto>> ObtenerRolesAsync();
        Task<IEnumerable<ChoferDto>> ObtenerChoferesDisponiblesAsync();
        Task<bool> ActualizarPermisoCrearViajeAsync(int usuarioId, bool habilitado);
        Task<PerfilUsuarioDto?> ObtenerPerfilAsync(int userId);
        Task<(bool success, string message)> ActualizarPerfilAsync(int userId, ActualizarPerfilDto dto);

        // Camiones
        Task<IEnumerable<CamionDto>> ObtenerCamionesAsync(bool soloActivos = false);
        Task<CamionDto?> ObtenerCamionPorIdAsync(int id);
        Task<CamionDto?> ObtenerCamionPorUsuarioIdAsync(int usuarioId);
        Task<int> CrearCamionAsync(CrearCamionDto dto);
        Task<bool> ActualizarCamionAsync(int id, EditarCamionDto dto);
        Task<bool> ActualizarEstadoCamionAsync(int id, string estado);
        Task<bool> EliminarCamionAsync(int id);
    }

    public class UsuariosRepository : IUsuariosRepository
    {
        private readonly string _connectionString;

        public UsuariosRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        public async Task<IEnumerable<UsuarioDto>> ObtenerUsuariosAsync(string? rol = null, bool soloActivos = false)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT u.Id, u.Username, u.NombreCompleto, u.Cedula, u.Telefono, u.Rol, u.RolId,
                       ISNULL(r.Nombre, u.Rol) AS RolNombre, ISNULL(u.TarifaPorLitro, 0) AS TarifaPorLitro,
                       ISNULL(u.SueldoBase, 0) AS SueldoBase, ISNULL(u.FrecuenciaPago, 'Semanal') AS FrecuenciaPago, ISNULL(u.TipoPago, 'Variado') AS TipoPago,
                       u.BancoNombre, u.NumeroCuenta, u.CedulaPagoMovil, u.TelefonoPagoMovil,
                       ISNULL(u.PermisoCrearViaje, 0) AS PermisoCrearViaje,
                       u.Activo, u.CreatedAt,
                       c.Id, c.UsuarioId, c.Placa, c.Compartimientos, c.CapacidadLitros, c.MarcaModelo, c.Observaciones, c.Activo, c.CreatedAt
                FROM TB_USUARIOS u
                LEFT JOIN TB_ROLES r ON u.RolId = r.Id OR (u.RolId IS NULL AND u.Rol = r.Codigo)
                LEFT JOIN TB_CAMIONES c ON u.Id = c.UsuarioId AND c.IsDeleted = 0
                WHERE u.IsDeleted = 0 " + 
                (soloActivos ? " AND u.Activo = 1 " : "") +
                (!string.IsNullOrWhiteSpace(rol) ? " AND u.Rol = @rol " : "") + @"
                ORDER BY u.NombreCompleto ASC";

            var usuariosDict = new Dictionary<int, UsuarioDto>();

            var list = await connection.QueryAsync<UsuarioDto, CamionDto, UsuarioDto>(
                sql,
                (usuario, camion) =>
                {
                    if (!usuariosDict.TryGetValue(usuario.Id, out var userEntry))
                    {
                        userEntry = usuario;
                        userEntry.Camion = camion != null && camion.Id > 0 ? camion : null;
                        usuariosDict.Add(userEntry.Id, userEntry);
                    }
                    return userEntry;
                },
                new { rol },
                splitOn: "Id");

            return usuariosDict.Values;
        }

        public async Task<UsuarioDto?> ObtenerUsuarioPorIdAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT u.Id, u.Username, u.NombreCompleto, u.Cedula, u.Telefono, u.Rol, u.RolId,
                       ISNULL(r.Nombre, u.Rol) AS RolNombre, ISNULL(u.TarifaPorLitro, 0) AS TarifaPorLitro,
                       ISNULL(u.SueldoBase, 0) AS SueldoBase, ISNULL(u.FrecuenciaPago, 'Semanal') AS FrecuenciaPago, ISNULL(u.TipoPago, 'Variado') AS TipoPago,
                       u.BancoNombre, u.NumeroCuenta, u.CedulaPagoMovil, u.TelefonoPagoMovil,
                       ISNULL(u.PermisoCrearViaje, 0) AS PermisoCrearViaje,
                       u.Activo, u.CreatedAt,
                       c.Id, c.UsuarioId, c.Placa, c.Compartimientos, c.CapacidadLitros, c.MarcaModelo, c.Observaciones, c.Activo, c.CreatedAt
                FROM TB_USUARIOS u
                LEFT JOIN TB_ROLES r ON u.RolId = r.Id OR (u.RolId IS NULL AND u.Rol = r.Codigo)
                LEFT JOIN TB_CAMIONES c ON u.Id = c.UsuarioId AND c.IsDeleted = 0
                WHERE u.Id = @id AND u.IsDeleted = 0";

            UsuarioDto? result = null;

            await connection.QueryAsync<UsuarioDto, CamionDto, UsuarioDto>(
                sql,
                (usuario, camion) =>
                {
                    if (result == null)
                    {
                        result = usuario;
                        result.Camion = camion != null && camion.Id > 0 ? camion : null;
                    }
                    return result;
                },
                new { id },
                splitOn: "Id");

            return result;
        }

        public async Task<int> CrearUsuarioAsync(CrearUsuarioDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                // Buscar RolId o Codigo de rol
                int rolId = dto.RolId ?? 4; // Por defecto CHOFER (4)
                string rolCodigo = dto.Rol;

                var rolDb = await connection.QueryFirstOrDefaultAsync<Rol>(
                    "SELECT * FROM TB_ROLES WHERE Id = @rolId OR Codigo = @rolCodigo",
                    new { rolId, rolCodigo = dto.Rol },
                    transaction);

                if (rolDb != null)
                {
                    rolId = rolDb.Id;
                    rolCodigo = rolDb.Codigo;
                }

                // Generar hash de contraseña seguro con BCrypt
                if (string.IsNullOrWhiteSpace(dto.Password))
                {
                    throw new ArgumentException("La contraseña inicial es requerida para registrar el usuario.");
                }
                string passwordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password, 11);

                var sqlUsuario = @"
                    INSERT INTO TB_USUARIOS 
                    (Username, PasswordHash, NombreCompleto, Cedula, Telefono, VehiculoPlaca, CapacidadTanqueLitros, TarifaPorLitro, SueldoBase, FrecuenciaPago, TipoPago, BancoNombre, NumeroCuenta, CedulaPagoMovil, TelefonoPagoMovil, Rol, RolId, PermisoCrearViaje, Activo, IsDeleted, CreatedAt)
                    VALUES 
                    (@Username, @PasswordHash, @NombreCompleto, @Cedula, @Telefono, @VehiculoPlaca, @CapacidadTanqueLitros, @TarifaPorLitro, @SueldoBase, @FrecuenciaPago, @TipoPago, @BancoNombre, @NumeroCuenta, @CedulaPagoMovil, @TelefonoPagoMovil, @Rol, @RolId, @PermisoCrearViaje, @Activo, 0, GETDATE());
                    SELECT CAST(SCOPE_IDENTITY() as int);";

                var usuarioId = await connection.ExecuteScalarAsync<int>(sqlUsuario, new
                {
                    dto.Username,
                    PasswordHash = passwordHash,
                    dto.NombreCompleto,
                    dto.Cedula,
                    dto.Telefono,
                    VehiculoPlaca = dto.Placa ?? "",
                    CapacidadTanqueLitros = (int?)(dto.CapacidadLitros ?? 0),
                    TarifaPorLitro = dto.TarifaPorLitro ?? 0,
                    SueldoBase = dto.SueldoBase ?? 0,
                    FrecuenciaPago = dto.FrecuenciaPago ?? (rolCodigo == "MATERA" ? "Quincenal" : "Semanal"),
                    TipoPago = dto.TipoPago ?? (rolCodigo == "MATERA" ? "Fijo" : "Variado"),
                    dto.BancoNombre,
                    dto.NumeroCuenta,
                    dto.CedulaPagoMovil,
                    dto.TelefonoPagoMovil,
                    Rol = rolCodigo,
                    RolId = rolId,
                    PermisoCrearViaje = dto.PermisoCrearViaje ? 1 : 0,
                    dto.Activo
                }, transaction);

                // Si el rol es CHOFER y se asignó o creó un camión
                if (rolCodigo.ToUpper() == "CHOFER")
                {
                    if (dto.CamionId.HasValue && dto.CamionId.Value > 0)
                    {
                        // Asignar camión existente de la flota al nuevo chofer
                        await connection.ExecuteAsync(
                            "UPDATE TB_CAMIONES SET UsuarioId = @usuarioId WHERE Id = @camionId",
                            new { usuarioId, camionId = dto.CamionId.Value },
                            transaction);

                        await connection.ExecuteAsync(@"
                            UPDATE u
                            SET u.VehiculoPlaca = c.Placa, u.CapacidadTanqueLitros = CAST(c.CapacidadLitros AS int)
                            FROM TB_USUARIOS u
                            INNER JOIN TB_CAMIONES c ON c.Id = @camionId
                            WHERE u.Id = @usuarioId",
                            new { usuarioId, camionId = dto.CamionId.Value },
                            transaction);
                    }
                    else if (!string.IsNullOrWhiteSpace(dto.Placa))
                    {
                        var sqlCamion = @"
                            INSERT INTO TB_CAMIONES 
                            (UsuarioId, Placa, Compartimientos, CapacidadLitros, MarcaModelo, Observaciones, Activo, IsDeleted, CreatedAt)
                            VALUES 
                            (@UsuarioId, @Placa, @Compartimientos, @CapacidadLitros, @MarcaModelo, @Observaciones, 1, 0, GETDATE());";

                        await connection.ExecuteAsync(sqlCamion, new
                        {
                            UsuarioId = usuarioId,
                            Placa = dto.Placa.Trim().ToUpper(),
                            Compartimientos = dto.Compartimientos.HasValue && dto.Compartimientos.Value > 0 ? dto.Compartimientos.Value : 1,
                            CapacidadLitros = dto.CapacidadLitros ?? 0,
                            MarcaModelo = dto.MarcaModelo,
                            Observaciones = dto.ObservacionesCamion
                        }, transaction);
                    }
                }

                transaction.Commit();
                return usuarioId;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> ActualizarUsuarioAsync(int id, EditarUsuarioDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                // Buscar rol si se provee
                string? rolCodigo = dto.Rol;
                int? rolId = dto.RolId;

                if (dto.RolId.HasValue || !string.IsNullOrWhiteSpace(dto.Rol))
                {
                    var rolDb = await connection.QueryFirstOrDefaultAsync<Rol>(
                        "SELECT * FROM TB_ROLES WHERE Id = @rolId OR Codigo = @rolCodigo",
                        new { rolId = dto.RolId ?? 0, rolCodigo = dto.Rol ?? "" },
                        transaction);

                    if (rolDb != null)
                    {
                        rolId = rolDb.Id;
                        rolCodigo = rolDb.Codigo;
                    }
                }

                string? passwordHash = null;
                if (!string.IsNullOrWhiteSpace(dto.Password))
                {
                    passwordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password, 11);
                }

                var sqlUsuario = @"
                    UPDATE TB_USUARIOS
                    SET Username = COALESCE(@Username, Username),
                        NombreCompleto = COALESCE(@NombreCompleto, NombreCompleto),
                        Cedula = COALESCE(@Cedula, Cedula),
                        Telefono = COALESCE(@Telefono, Telefono),
                        Rol = COALESCE(@Rol, Rol),
                        RolId = COALESCE(@RolId, RolId),
                        Activo = COALESCE(@Activo, Activo),
                        VehiculoPlaca = COALESCE(@VehiculoPlaca, VehiculoPlaca),
                        CapacidadTanqueLitros = COALESCE(@CapacidadTanqueLitros, CapacidadTanqueLitros),
                        TarifaPorLitro = COALESCE(@TarifaPorLitro, TarifaPorLitro),
                        SueldoBase = COALESCE(@SueldoBase, SueldoBase),
                        FrecuenciaPago = COALESCE(@FrecuenciaPago, FrecuenciaPago),
                        TipoPago = COALESCE(@TipoPago, TipoPago),
                        BancoNombre = COALESCE(@BancoNombre, BancoNombre),
                        NumeroCuenta = COALESCE(@NumeroCuenta, NumeroCuenta),
                        CedulaPagoMovil = COALESCE(@CedulaPagoMovil, CedulaPagoMovil),
                        TelefonoPagoMovil = COALESCE(@TelefonoPagoMovil, TelefonoPagoMovil),
                        PermisoCrearViaje = COALESCE(@PermisoCrearViaje, PermisoCrearViaje)
                        " + (!string.IsNullOrWhiteSpace(passwordHash) ? ", PasswordHash = @PasswordHash " : "") + @"
                    WHERE Id = @id AND IsDeleted = 0";

                var rows = await connection.ExecuteAsync(sqlUsuario, new
                {
                    id,
                    dto.Username,
                    dto.NombreCompleto,
                    dto.Cedula,
                    dto.Telefono,
                    Rol = rolCodigo,
                    RolId = rolId,
                    dto.Activo,
                    VehiculoPlaca = dto.Placa,
                    CapacidadTanqueLitros = (int?)(dto.CapacidadLitros),
                    dto.TarifaPorLitro,
                    dto.SueldoBase,
                    dto.FrecuenciaPago,
                    dto.TipoPago,
                    dto.BancoNombre,
                    dto.NumeroCuenta,
                    dto.CedulaPagoMovil,
                    dto.TelefonoPagoMovil,
                    PermisoCrearViaje = dto.PermisoCrearViaje.HasValue ? (dto.PermisoCrearViaje.Value ? 1 : 0) : (int?)null,
                    PasswordHash = passwordHash
                }, transaction);

                // Si se proporcionó asignación de camión por ID
                if (dto.CamionId.HasValue)
                {
                    if (dto.CamionId.Value > 0)
                    {
                        // 1. Desasignar cualquier otro camión que tuviera este chofer
                        await connection.ExecuteAsync(
                            "UPDATE TB_CAMIONES SET UsuarioId = NULL WHERE UsuarioId = @usuarioId AND Id <> @camionId",
                            new { usuarioId = id, camionId = dto.CamionId.Value },
                            transaction);

                        // 2. Asignar el nuevo camión al chofer
                        await connection.ExecuteAsync(
                            "UPDATE TB_CAMIONES SET UsuarioId = @usuarioId WHERE Id = @camionId",
                            new { usuarioId = id, camionId = dto.CamionId.Value },
                            transaction);

                        // 3. Sincronizar campos en TB_USUARIOS
                        await connection.ExecuteAsync(@"
                            UPDATE u
                            SET u.VehiculoPlaca = c.Placa, u.CapacidadTanqueLitros = CAST(c.CapacidadLitros AS int)
                            FROM TB_USUARIOS u
                            INNER JOIN TB_CAMIONES c ON c.Id = @camionId
                            WHERE u.Id = @usuarioId",
                            new { usuarioId = id, camionId = dto.CamionId.Value },
                            transaction);
                    }
                    else
                    {
                        // Desasignar camión del chofer
                        await connection.ExecuteAsync(
                            "UPDATE TB_CAMIONES SET UsuarioId = NULL WHERE UsuarioId = @usuarioId",
                            new { usuarioId = id },
                            transaction);

                        await connection.ExecuteAsync(
                            "UPDATE TB_USUARIOS SET VehiculoPlaca = '', CapacidadTanqueLitros = 0 WHERE Id = @usuarioId",
                            new { usuarioId = id },
                            transaction);
                    }
                }
                else if (!string.IsNullOrWhiteSpace(dto.Placa))
                {
                    var camionExistente = await connection.QueryFirstOrDefaultAsync<Camion>(
                        "SELECT TOP 1 * FROM TB_CAMIONES WHERE UsuarioId = @usuarioId AND IsDeleted = 0",
                        new { usuarioId = id },
                        transaction);

                    if (camionExistente != null)
                    {
                        await connection.ExecuteAsync(@"
                            UPDATE TB_CAMIONES
                            SET Placa = @Placa,
                                Compartimientos = COALESCE(@Compartimientos, Compartimientos),
                                CapacidadLitros = COALESCE(@CapacidadLitros, CapacidadLitros),
                                MarcaModelo = COALESCE(@MarcaModelo, MarcaModelo),
                                Observaciones = COALESCE(@Observaciones, Observaciones)
                            WHERE Id = @id",
                            new
                            {
                                id = camionExistente.Id,
                                Placa = dto.Placa.Trim().ToUpper(),
                                dto.Compartimientos,
                                dto.CapacidadLitros,
                                dto.MarcaModelo,
                                Observaciones = dto.ObservacionesCamion
                            }, transaction);
                    }
                    else
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_CAMIONES (UsuarioId, Placa, Compartimientos, CapacidadLitros, MarcaModelo, Observaciones, Activo, IsDeleted, CreatedAt)
                            VALUES (@UsuarioId, @Placa, @Compartimientos, @CapacidadLitros, @MarcaModelo, @Observaciones, 1, 0, GETDATE())",
                            new
                            {
                                UsuarioId = id,
                                Placa = dto.Placa.Trim().ToUpper(),
                                Compartimientos = dto.Compartimientos ?? 1,
                                CapacidadLitros = dto.CapacidadLitros ?? 0,
                                dto.MarcaModelo,
                                Observaciones = dto.ObservacionesCamion
                            }, transaction);
                    }
                }

                transaction.Commit();
                return rows > 0;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> ActualizarPasswordAsync(int id, string nuevaPassword)
        {
            using var connection = new SqlConnection(_connectionString);
            var passwordHash = BCrypt.Net.BCrypt.HashPassword(nuevaPassword, 11);
            var rows = await connection.ExecuteAsync(
                "UPDATE TB_USUARIOS SET PasswordHash = @passwordHash WHERE Id = @id AND IsDeleted = 0",
                new { id, passwordHash });
            return rows > 0;
        }

        public async Task<bool> EliminarUsuarioAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var rows = await connection.ExecuteAsync(
                "UPDATE TB_USUARIOS SET IsDeleted = 1, Activo = 0 WHERE Id = @id",
                new { id });
            return rows > 0;
        }

        public async Task<bool> ActualizarPermisoCrearViajeAsync(int usuarioId, bool habilitado)
        {
            using var connection = new SqlConnection(_connectionString);
            var rows = await connection.ExecuteAsync(
                "UPDATE TB_USUARIOS SET PermisoCrearViaje = @habilitado WHERE Id = @usuarioId AND IsDeleted = 0",
                new { usuarioId, habilitado = habilitado ? 1 : 0 });
            return rows > 0;
        }

        public async Task<PerfilUsuarioDto?> ObtenerPerfilAsync(int userId)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    u.Id, 
                    u.Username, 
                    u.NombreCompleto, 
                    u.Rol, 
                    u.Cedula, 
                    u.Telefono, 
                    u.FotoUrl,
                    ISNULL(u.PermisoCrearViaje, 0) AS PermisoCrearViaje,
                    u.BancoNombre, 
                    u.NumeroCuenta, 
                    u.CedulaPagoMovil, 
                    u.TelefonoPagoMovil, 
                    u.VehiculoPlaca, 
                    u.CreatedAt
                FROM TB_USUARIOS u
                WHERE u.Id = @userId AND u.IsDeleted = 0";
            return await connection.QueryFirstOrDefaultAsync<PerfilUsuarioDto>(sql, new { userId });
        }

        public async Task<(bool success, string message)> ActualizarPerfilAsync(int userId, ActualizarPerfilDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            var user = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT Id, Username, PasswordHash FROM TB_USUARIOS WHERE Id = @userId AND IsDeleted = 0",
                new { userId });

            if (user == null)
            {
                return (false, "Usuario no encontrado.");
            }

            string? nuevoHash = null;
            if (!string.IsNullOrWhiteSpace(dto.NuevoPassword))
            {
                if (string.IsNullOrWhiteSpace(dto.PasswordActual))
                {
                    return (false, "Debe ingresar su contraseña actual para confirmar el cambio.");
                }

                string hashActual = (string)user.PasswordHash;
                bool passValida = false;
                try
                {
                    passValida = BCrypt.Net.BCrypt.Verify(dto.PasswordActual, hashActual);
                }
                catch
                {
                    passValida = (dto.PasswordActual == hashActual);
                }

                if (!passValida)
                {
                    return (false, "La contraseña actual es incorrecta.");
                }

                if (dto.NuevoPassword.Trim().Length < 4)
                {
                    return (false, "La nueva contraseña debe tener al menos 4 caracteres.");
                }

                nuevoHash = BCrypt.Net.BCrypt.HashPassword(dto.NuevoPassword.Trim(), 11);
            }

            var sql = @"
                UPDATE TB_USUARIOS
                SET NombreCompleto = COALESCE(@NombreCompleto, NombreCompleto),
                    Cedula = @Cedula,
                    Telefono = @Telefono,
                    FotoUrl = COALESCE(@FotoUrl, FotoUrl),
                    BancoNombre = @BancoNombre,
                    NumeroCuenta = @NumeroCuenta,
                    CedulaPagoMovil = @CedulaPagoMovil,
                    TelefonoPagoMovil = @TelefonoPagoMovil" +
                    (nuevoHash != null ? ", PasswordHash = @nuevoHash" : "") + @"
                WHERE Id = @userId AND IsDeleted = 0";

            var rows = await connection.ExecuteAsync(sql, new
            {
                userId,
                NombreCompleto = string.IsNullOrWhiteSpace(dto.NombreCompleto) ? null : dto.NombreCompleto.Trim(),
                dto.Cedula,
                dto.Telefono,
                dto.FotoUrl,
                dto.BancoNombre,
                dto.NumeroCuenta,
                dto.CedulaPagoMovil,
                dto.TelefonoPagoMovil,
                nuevoHash
            });

            return (rows > 0, rows > 0 ? "Perfil actualizado exitosamente." : "No se pudo actualizar el perfil.");
        }

        public async Task<IEnumerable<RolDto>> ObtenerRolesAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryAsync<RolDto>(
                "SELECT Id, Codigo, Nombre, Descripcion, Activo FROM TB_ROLES WHERE Activo = 1 ORDER BY Id ASC");
        }

        public async Task<IEnumerable<ChoferDto>> ObtenerChoferesDisponiblesAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT u.Id, u.Username, u.NombreCompleto, u.Cedula, 
                       ISNULL(c.Placa, u.VehiculoPlaca) AS VehiculoPlaca
                FROM TB_USUARIOS u
                OUTER APPLY (
                    SELECT TOP 1 c2.Placa
                    FROM TB_CAMIONES c2
                    WHERE c2.UsuarioId = u.Id AND c2.IsDeleted = 0
                    ORDER BY c2.Activo DESC, c2.Id DESC
                ) c
                WHERE (UPPER(u.Rol) = 'CHOFER' OR UPPER(u.Rol) = 'CONDUCTOR' OR u.RolId = 4)
                  AND u.Activo = 1 
                  AND u.IsDeleted = 0
                ORDER BY u.NombreCompleto ASC";
            return await connection.QueryAsync<ChoferDto>(sql);
        }

        // ==========================================
        // CAMIONES
        // ==========================================
        public async Task<IEnumerable<CamionDto>> ObtenerCamionesAsync(bool soloActivos = false)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT c.Id, c.UsuarioId, u.NombreCompleto AS ChoferNombre, u.Cedula AS ChoferCedula, u.Telefono AS ChoferTelefono,
                       c.Placa, c.Compartimientos, c.CapacidadLitros, c.CapacidadTanqueLitros, c.TipoCombustible, c.OdometroActualKm,
                       c.MarcaModelo, c.Observaciones, ISNULL(c.Estado, CASE WHEN c.Activo = 1 THEN 'ACTIVO' ELSE 'INACTIVO' END) AS Estado, c.Activo, c.CreatedAt
                FROM TB_CAMIONES c
                LEFT JOIN TB_USUARIOS u ON c.UsuarioId = u.Id
                WHERE c.IsDeleted = 0 " + 
                (soloActivos ? " AND c.Activo = 1 " : "") + @"
                ORDER BY c.Placa ASC";
            return await connection.QueryAsync<CamionDto>(sql);
        }

        public async Task<CamionDto?> ObtenerCamionPorIdAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT c.Id, c.UsuarioId, u.NombreCompleto AS ChoferNombre, u.Cedula AS ChoferCedula, u.Telefono AS ChoferTelefono,
                       c.Placa, c.Compartimientos, c.CapacidadLitros, c.CapacidadTanqueLitros, c.TipoCombustible, c.OdometroActualKm,
                       c.MarcaModelo, c.Observaciones, ISNULL(c.Estado, CASE WHEN c.Activo = 1 THEN 'ACTIVO' ELSE 'INACTIVO' END) AS Estado, c.Activo, c.CreatedAt
                FROM TB_CAMIONES c
                LEFT JOIN TB_USUARIOS u ON c.UsuarioId = u.Id
                WHERE c.Id = @id AND c.IsDeleted = 0";
            return await connection.QueryFirstOrDefaultAsync<CamionDto>(sql, new { id });
        }

        public async Task<CamionDto?> ObtenerCamionPorUsuarioIdAsync(int usuarioId)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT c.Id, c.UsuarioId, u.NombreCompleto AS ChoferNombre, u.Cedula AS ChoferCedula, u.Telefono AS ChoferTelefono,
                       c.Placa, c.Compartimientos, c.CapacidadLitros, c.CapacidadTanqueLitros, c.TipoCombustible, c.OdometroActualKm,
                       c.MarcaModelo, c.Observaciones, ISNULL(c.Estado, CASE WHEN c.Activo = 1 THEN 'ACTIVO' ELSE 'INACTIVO' END) AS Estado, c.Activo, c.CreatedAt
                FROM TB_CAMIONES c
                LEFT JOIN TB_USUARIOS u ON c.UsuarioId = u.Id
                WHERE c.UsuarioId = @usuarioId AND c.IsDeleted = 0";
            return await connection.QueryFirstOrDefaultAsync<CamionDto>(sql, new { usuarioId });
        }

        public async Task<int> CrearCamionAsync(CrearCamionDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            string estado = string.IsNullOrWhiteSpace(dto.Estado) ? (dto.Activo ? "ACTIVO" : "INACTIVO") : dto.Estado.ToUpper();
            bool activo = estado == "ACTIVO";

            var sql = @"
                INSERT INTO TB_CAMIONES 
                (UsuarioId, Placa, Compartimientos, CapacidadLitros, CapacidadTanqueLitros, TipoCombustible, OdometroActualKm, MarcaModelo, Observaciones, Estado, Activo, IsDeleted, CreatedAt)
                VALUES 
                (@UsuarioId, @Placa, @Compartimientos, @CapacidadLitros, @CapacidadTanqueLitros, @TipoCombustible, @OdometroActualKm, @MarcaModelo, @Observaciones, @estado, @activo, 0, GETDATE());
                SELECT CAST(SCOPE_IDENTITY() as int);";

            var id = await connection.ExecuteScalarAsync<int>(sql, new
            {
                UsuarioId = dto.UsuarioId.HasValue && dto.UsuarioId.Value > 0 ? dto.UsuarioId : null,
                Placa = dto.Placa.Trim().ToUpper(),
                Compartimientos = dto.Compartimientos > 0 ? dto.Compartimientos : 1,
                dto.CapacidadLitros,
                CapacidadTanqueLitros = dto.CapacidadTanqueLitros,
                TipoCombustible = string.IsNullOrWhiteSpace(dto.TipoCombustible) ? "GASOIL" : dto.TipoCombustible.ToUpper(),
                OdometroActualKm = dto.OdometroActualKm,
                dto.MarcaModelo,
                dto.Observaciones,
                estado,
                activo
            });

            // Sincronizar placa en TB_USUARIOS si se asignó chofer
            if (dto.UsuarioId.HasValue && dto.UsuarioId.Value > 0)
            {
                await connection.ExecuteAsync(
                    "UPDATE TB_USUARIOS SET VehiculoPlaca = @Placa, CapacidadTanqueLitros = @Capacidad WHERE Id = @UsuarioId",
                    new { Placa = dto.Placa.Trim().ToUpper(), Capacidad = (int)dto.CapacidadLitros, dto.UsuarioId });
            }

            return id;
        }

        public async Task<bool> ActualizarCamionAsync(int id, EditarCamionDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            string? estado = !string.IsNullOrWhiteSpace(dto.Estado) ? dto.Estado.ToUpper() : null;
            bool? activo = estado != null ? (estado == "ACTIVO") : dto.Activo;

            var sql = @"
                UPDATE TB_CAMIONES
                SET UsuarioId = @UsuarioId,
                    Placa = COALESCE(@Placa, Placa),
                    Compartimientos = COALESCE(@Compartimientos, Compartimientos),
                    CapacidadLitros = COALESCE(@CapacidadLitros, CapacidadLitros),
                    CapacidadTanqueLitros = COALESCE(@CapacidadTanqueLitros, CapacidadTanqueLitros),
                    TipoCombustible = COALESCE(@TipoCombustible, TipoCombustible),
                    OdometroActualKm = COALESCE(@OdometroActualKm, OdometroActualKm),
                    MarcaModelo = COALESCE(@MarcaModelo, MarcaModelo),
                    Observaciones = COALESCE(@Observaciones, Observaciones),
                    Estado = COALESCE(@estado, Estado),
                    Activo = COALESCE(@activo, Activo)
                WHERE Id = @id AND IsDeleted = 0";

            var rows = await connection.ExecuteAsync(sql, new
            {
                id,
                UsuarioId = dto.UsuarioId.HasValue && dto.UsuarioId.Value > 0 ? dto.UsuarioId : null,
                Placa = dto.Placa?.Trim().ToUpper(),
                dto.Compartimientos,
                dto.CapacidadLitros,
                dto.CapacidadTanqueLitros,
                TipoCombustible = dto.TipoCombustible?.ToUpper(),
                dto.OdometroActualKm,
                dto.MarcaModelo,
                dto.Observaciones,
                estado,
                activo
            });

            var camion = await ObtenerCamionPorIdAsync(id);
            if (camion != null && camion.UsuarioId.HasValue && camion.UsuarioId.Value > 0)
            {
                await connection.ExecuteAsync(
                    "UPDATE TB_USUARIOS SET VehiculoPlaca = @Placa, CapacidadTanqueLitros = @Capacidad WHERE Id = @UsuarioId",
                    new { camion.Placa, Capacidad = (int)camion.CapacidadLitros, UsuarioId = camion.UsuarioId.Value });
            }

            return rows > 0;
        }

        public async Task<bool> ActualizarEstadoCamionAsync(int id, string estado)
        {
            using var connection = new SqlConnection(_connectionString);
            string est = string.IsNullOrWhiteSpace(estado) ? "ACTIVO" : estado.ToUpper();
            bool activo = est == "ACTIVO";
            var rows = await connection.ExecuteAsync(
                "UPDATE TB_CAMIONES SET Estado = @est, Activo = @activo WHERE Id = @id",
                new { id, est, activo });
            return rows > 0;
        }

        public async Task<bool> EliminarCamionAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var rows = await connection.ExecuteAsync(
                "UPDATE TB_CAMIONES SET IsDeleted = 1, Activo = 0 WHERE Id = @id",
                new { id });
            return rows > 0;
        }
    }
}
