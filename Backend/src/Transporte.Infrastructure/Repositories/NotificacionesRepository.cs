using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

namespace Transporte.Infrastructure.Repositories
{
    public interface INotificacionesRepository
    {
        Task<IEnumerable<NotificacionMovilDto>> ObtenerMisNotificacionesAsync(int usuarioId, int limite = 30);
        Task<long> CrearNotificacionAsync(CrearNotificacionMovilDto dto);
        Task<bool> MarcarComoLeidaAsync(long id, int usuarioId);
        Task<bool> MarcarTodasComoLeidasAsync(int usuarioId);
        Task<bool> GuardarSuscripcionPushAsync(int usuarioId, SuscripcionPushDto dto);
        Task EnviarWebPushAsync(int usuarioId, string titulo, string mensaje, string? url = "/movil");
    }

    public class NotificacionesRepository : INotificacionesRepository
    {
        private readonly string _connectionString;
        private readonly Transporte.Core.Interfaces.ITenantService? _tenantService;

        public NotificacionesRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _tenantService = tenantService;
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE")!;
        }

        private IDbConnection CreateConnection()
        {
            var connStr = _tenantService?.GetConnectionString() ?? _connectionString;
            return new SqlConnection(connStr);
        }

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, bool> _ensuredNotifTables = new();

        private async Task EnsureTableAsync(IDbConnection connection)
        {
            var dbKey = connection.Database ?? "default";
            if (_ensuredNotifTables.ContainsKey(dbKey)) return;
            try
            {
                var sql = @"
                    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TB_NOTIFICACIONES_MOVIL')
                    BEGIN
                        CREATE TABLE TB_NOTIFICACIONES_MOVIL (
                            Id BIGINT IDENTITY(1,1) PRIMARY KEY,
                            UsuarioId INT NOT NULL,
                            Tipo NVARCHAR(50) NOT NULL,
                            Titulo NVARCHAR(150) NOT NULL,
                            Mensaje NVARCHAR(500) NOT NULL,
                            FechaOperativa DATE NULL,
                            ReferenciaId BIGINT NULL,
                            Leido BIT NOT NULL DEFAULT 0,
                            CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
                        );
                        CREATE INDEX IX_TB_NOTIFICACIONES_MOVIL_UsuarioId ON TB_NOTIFICACIONES_MOVIL(UsuarioId, Leido, CreatedAt DESC);
                    END
                    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TB_PUSH_SUBSCRIPTIONS')
                    BEGIN
                        CREATE TABLE TB_PUSH_SUBSCRIPTIONS (
                            Id INT IDENTITY(1,1) PRIMARY KEY,
                            UsuarioId INT NOT NULL,
                            Endpoint NVARCHAR(MAX) NOT NULL,
                            P256dh NVARCHAR(500) NOT NULL,
                            Auth NVARCHAR(500) NOT NULL,
                            UserAgent NVARCHAR(500) NULL,
                            Activo BIT NOT NULL DEFAULT 1,
                            CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                            UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
                        );
                        CREATE INDEX IX_TB_PUSH_SUBSCRIPTIONS_UsuarioId ON TB_PUSH_SUBSCRIPTIONS(UsuarioId, Activo);
                    END";
                await connection.ExecuteAsync(sql);
                _ensuredNotifTables[dbKey] = true;
            }
            catch { /* Tolerante */ }
        }

        public async Task<IEnumerable<NotificacionMovilDto>> ObtenerMisNotificacionesAsync(int usuarioId, int limite = 30)
        {
            using var connection = CreateConnection();
            await EnsureTableAsync(connection);
            var sql = @"
                SELECT TOP (@limite)
                    Id, UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt
                FROM TB_NOTIFICACIONES_MOVIL
                WHERE UsuarioId = @usuarioId
                ORDER BY CreatedAt DESC, Id DESC";

            return await connection.QueryAsync<NotificacionMovilDto>(sql, new { usuarioId, limite });
        }

        public async Task<long> CrearNotificacionAsync(CrearNotificacionMovilDto dto)
        {
            using var connection = CreateConnection();
            await EnsureTableAsync(connection);
            var sql = @"
                INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                VALUES (@UsuarioId, @Tipo, @Titulo, @Mensaje, @FechaOperativa, @ReferenciaId, 0, GETDATE());
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

            var id = await connection.ExecuteScalarAsync<long>(sql, dto);

            // Disparar WebPush a nivel de sistema operativo para pantalla apagada / segundo plano
            _ = Task.Run(() => EnviarWebPushAsync(dto.UsuarioId, dto.Titulo, dto.Mensaje));

            return id;
        }

        public async Task<bool> MarcarComoLeidaAsync(long id, int usuarioId)
        {
            using var connection = CreateConnection();
            await EnsureTableAsync(connection);
            var sql = "UPDATE TB_NOTIFICACIONES_MOVIL SET Leido = 1 WHERE Id = @id AND UsuarioId = @usuarioId";
            var rows = await connection.ExecuteAsync(sql, new { id, usuarioId });
            return rows > 0;
        }

        public async Task<bool> MarcarTodasComoLeidasAsync(int usuarioId)
        {
            using var connection = CreateConnection();
            await EnsureTableAsync(connection);
            var sql = "UPDATE TB_NOTIFICACIONES_MOVIL SET Leido = 1 WHERE UsuarioId = @usuarioId AND Leido = 0";
            var rows = await connection.ExecuteAsync(sql, new { usuarioId });
            return rows > 0;
        }

        public async Task<bool> GuardarSuscripcionPushAsync(int usuarioId, SuscripcionPushDto dto)
        {
            using var connection = CreateConnection();
            await EnsureTableAsync(connection);
            var sql = @"
                IF EXISTS (SELECT 1 FROM TB_PUSH_SUBSCRIPTIONS WHERE Endpoint = @Endpoint)
                BEGIN
                    UPDATE TB_PUSH_SUBSCRIPTIONS 
                    SET UsuarioId = @usuarioId, P256dh = @P256dh, Auth = @Auth, UserAgent = @UserAgent, Activo = 1, UpdatedAt = GETDATE()
                    WHERE Endpoint = @Endpoint;
                END
                ELSE
                BEGIN
                    INSERT INTO TB_PUSH_SUBSCRIPTIONS (UsuarioId, Endpoint, P256dh, Auth, UserAgent, Activo, CreatedAt, UpdatedAt)
                    VALUES (@usuarioId, @Endpoint, @P256dh, @Auth, @UserAgent, 1, GETDATE(), GETDATE());
                END";

            var rows = await connection.ExecuteAsync(sql, new
            {
                usuarioId,
                dto.Endpoint,
                dto.P256dh,
                dto.Auth,
                dto.UserAgent
            });
            return rows > 0;
        }

        public async Task EnviarWebPushAsync(int usuarioId, string titulo, string mensaje, string? url = "/movil")
        {
            try
            {
                using var connection = CreateConnection();
                await EnsureTableAsync(connection);
                var sql = "SELECT Endpoint, P256dh, Auth FROM TB_PUSH_SUBSCRIPTIONS WHERE UsuarioId = @usuarioId AND Activo = 1";
                var subs = (await connection.QueryAsync<dynamic>(sql, new { usuarioId })).ToList();
                if (subs.Count == 0) return;

                var vapidSubject = "mailto:admin@transporte-app.com";
                var vapidPublicKey = "BLaD6DOWHSNTZ2TVY91CnRLuOCb8p9NpUv4AGslQ_Cp1vg3oiHA7MIR-qF74ZxzkHKp1ucbg2kVMU61S4IpxRHo";
                var vapidPrivateKey = "ZDe2FHrKmgH8Gk6ijr0FsWmWdQrAqC2LqaQ3K7gSI98";
                var vapidDetails = new WebPush.VapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
                var client = new WebPush.WebPushClient();

                var payload = System.Text.Json.JsonSerializer.Serialize(new
                {
                    titulo,
                    mensaje,
                    url = url ?? "/movil",
                    id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });

                foreach (var s in subs)
                {
                    try
                    {
                        var sub = new WebPush.PushSubscription((string)s.Endpoint, (string)s.P256dh, (string)s.Auth);
                        await client.SendNotificationAsync(sub, payload, vapidDetails);
                    }
                    catch (WebPush.WebPushException ex)
                    {
                        if (ex.StatusCode == System.Net.HttpStatusCode.Gone || ex.StatusCode == System.Net.HttpStatusCode.NotFound)
                        {
                            await connection.ExecuteAsync("UPDATE TB_PUSH_SUBSCRIPTIONS SET Activo = 0, UpdatedAt = GETDATE() WHERE Endpoint = @endpoint", new { endpoint = (string)s.Endpoint });
                        }
                    }
                    catch { /* No interrumpir ciclo de notificaciones */ }
                }
            }
            catch { /* Tolerante */ }
        }
    }
}
