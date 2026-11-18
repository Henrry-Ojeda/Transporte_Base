using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;

namespace Transporte.Infrastructure.Repositories
{
    public interface IMantenimientoCamionesRepository
    {
        Task<IEnumerable<MantenimientoCamionDto>> ObtenerMantenimientosAsync(int? camionId = null, string? tipoEvento = null, string? estado = null);
        Task<MantenimientoCamionDto?> ObtenerPorIdAsync(int id);
        Task<int> CrearMantenimientoAsync(CrearMantenimientoCamionDto dto, int? userId);
        Task<bool> ActualizarMantenimientoAsync(int id, CrearMantenimientoCamionDto dto, int? userId);
        Task<bool> EliminarMantenimientoAsync(int id);
        Task<IEnumerable<dynamic>> ObtenerAlertasPreventivasAsync();
        Task<int> ReportarIncidenteChoferAsync(ReportarIncidenteChoferDto dto, int choferId);
        Task<bool> ActualizarEstadoIncidenteAsync(int id, ActualizarEstadoIncidenteDto dto, int userId);
    }

    public class MantenimientoCamionesRepository : IMantenimientoCamionesRepository
    {
        private readonly string _connectionString;

        public MantenimientoCamionesRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_CV_PROD;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        private IDbConnection CreateConnection() => new SqlConnection(_connectionString);

        public async Task<IEnumerable<MantenimientoCamionDto>> ObtenerMantenimientosAsync(int? camionId = null, string? tipoEvento = null, string? estado = null)
        {
            using var connection = CreateConnection();
            var sql = @"
                SELECT 
                    m.Id,
                    m.CamionId,
                    c.Placa AS CamionPlaca,
                    c.MarcaModelo,
                    m.TipoEvento,
                    m.Titulo,
                    m.Descripcion,
                    m.FechaEvento,
                    m.OdometroKm,
                    m.ProximoKmSugerido,
                    m.ProximaFechaSugerida,
                    m.TallerOMecanico,
                    m.Estado,
                    m.ReportadoPorChoferId,
                    u.NombreCompleto AS ChoferNombre,
                    m.Urgencia,
                    m.FotoUrl,
                    m.CostoTotalUSD,
                    m.CreatedAt
                FROM TB_MANTENIMIENTO_CAMIONES m
                INNER JOIN TB_CAMIONES c ON m.CamionId = c.Id
                LEFT JOIN TB_USUARIOS u ON m.ReportadoPorChoferId = u.Id
                WHERE (@CamionId IS NULL OR m.CamionId = @CamionId)
                  AND (@TipoEvento IS NULL OR m.TipoEvento = @TipoEvento)
                  AND (@Estado IS NULL OR m.Estado = @Estado)
                ORDER BY m.FechaEvento DESC, m.Id DESC";

            return await connection.QueryAsync<MantenimientoCamionDto>(sql, new 
            { 
                CamionId = camionId,
                TipoEvento = string.IsNullOrWhiteSpace(tipoEvento) ? null : tipoEvento,
                Estado = string.IsNullOrWhiteSpace(estado) ? null : estado
            });
        }

        public async Task<MantenimientoCamionDto?> ObtenerPorIdAsync(int id)
        {
            using var connection = CreateConnection();
            var sql = @"
                SELECT 
                    m.Id,
                    m.CamionId,
                    c.Placa AS CamionPlaca,
                    c.MarcaModelo,
                    m.TipoEvento,
                    m.Titulo,
                    m.Descripcion,
                    m.FechaEvento,
                    m.OdometroKm,
                    m.ProximoKmSugerido,
                    m.ProximaFechaSugerida,
                    m.TallerOMecanico,
                    m.Estado,
                    m.ReportadoPorChoferId,
                    u.NombreCompleto AS ChoferNombre,
                    m.Urgencia,
                    m.FotoUrl,
                    m.CostoTotalUSD,
                    m.CreatedAt
                FROM TB_MANTENIMIENTO_CAMIONES m
                INNER JOIN TB_CAMIONES c ON m.CamionId = c.Id
                LEFT JOIN TB_USUARIOS u ON m.ReportadoPorChoferId = u.Id
                WHERE m.Id = @Id";

            return await connection.QueryFirstOrDefaultAsync<MantenimientoCamionDto>(sql, new { Id = id });
        }

        public async Task<int> CrearMantenimientoAsync(CrearMantenimientoCamionDto dto, int? userId)
        {
            using var connection = CreateConnection();
            if (connection.State != ConnectionState.Open) connection.Open();
            using var tx = connection.BeginTransaction();

            try
            {
                var sql = @"
                    INSERT INTO TB_MANTENIMIENTO_CAMIONES (
                        CamionId, TipoEvento, Titulo, Descripcion, FechaEvento,
                        OdometroKm, ProximoKmSugerido, ProximaFechaSugerida,
                        TallerOMecanico, Estado, CostoTotalUSD, CreatedAt, CreatedBy
                    )
                    VALUES (
                        @CamionId, @TipoEvento, @Titulo, @Descripcion, @FechaEvento,
                        @OdometroKm, @ProximoKmSugerido, @ProximaFechaSugerida,
                        @TallerOMecanico, @Estado, @CostoTotalUSD, GETDATE(), @CreatedBy
                    );
                    SELECT CAST(SCOPE_IDENTITY() as int);";

                var newId = await connection.ExecuteScalarAsync<int>(sql, new
                {
                    dto.CamionId,
                    dto.TipoEvento,
                    dto.Titulo,
                    Descripcion = dto.Descripcion ?? string.Empty,
                    dto.FechaEvento,
                    dto.OdometroKm,
                    dto.ProximoKmSugerido,
                    dto.ProximaFechaSugerida,
                    dto.TallerOMecanico,
                    dto.Estado,
                    dto.CostoTotalUSD,
                    CreatedBy = userId
                }, transaction: tx);

                // Si se registró odómetro y es mayor, actualizar camión
                if (dto.OdometroKm.HasValue && dto.OdometroKm.Value > 0)
                {
                    await connection.ExecuteAsync(
                        @"UPDATE TB_CAMIONES 
                          SET OdometroActualKm = CASE 
                                WHEN @Km > ISNULL(OdometroActualKm, 0) THEN @Km 
                                ELSE OdometroActualKm 
                              END 
                          WHERE Id = @CamionId",
                        new { Km = dto.OdometroKm.Value, CamionId = dto.CamionId },
                        transaction: tx);
                }

                // Sincronizar disponibilidad del camión si entra a taller
                var estadoNorm = (dto.Estado ?? "").Trim().ToUpper();
                if (estadoNorm == "EN_TALLER")
                {
                    await connection.ExecuteAsync(
                        "UPDATE TB_CAMIONES SET Estado = 'MANTENIMIENTO', Activo = 0 WHERE Id = @CamionId",
                        new { CamionId = dto.CamionId },
                        transaction: tx);
                }

                tx.Commit();
                return newId;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        public async Task<bool> ActualizarMantenimientoAsync(int id, CrearMantenimientoCamionDto dto, int? userId)
        {
            using var connection = CreateConnection();
            var sql = @"
                UPDATE TB_MANTENIMIENTO_CAMIONES SET
                    CamionId = @CamionId,
                    TipoEvento = @TipoEvento,
                    Titulo = @Titulo,
                    Descripcion = @Descripcion,
                    FechaEvento = @FechaEvento,
                    OdometroKm = @OdometroKm,
                    ProximoKmSugerido = @ProximoKmSugerido,
                    ProximaFechaSugerida = @ProximaFechaSugerida,
                    TallerOMecanico = @TallerOMecanico,
                    Estado = @Estado,
                    CostoTotalUSD = @CostoTotalUSD
                WHERE Id = @Id";

            var rows = await connection.ExecuteAsync(sql, new
            {
                Id = id,
                dto.CamionId,
                dto.TipoEvento,
                dto.Titulo,
                Descripcion = dto.Descripcion ?? string.Empty,
                dto.FechaEvento,
                dto.OdometroKm,
                dto.ProximoKmSugerido,
                dto.ProximaFechaSugerida,
                dto.TallerOMecanico,
                dto.Estado,
                dto.CostoTotalUSD
            });

            if (rows > 0)
            {
                if (dto.OdometroKm.HasValue && dto.OdometroKm.Value > 0)
                {
                    await connection.ExecuteAsync(
                        @"UPDATE TB_CAMIONES 
                          SET OdometroActualKm = CASE 
                                WHEN @Km > ISNULL(OdometroActualKm, 0) THEN @Km 
                                ELSE OdometroActualKm 
                              END 
                          WHERE Id = @CamionId",
                        new { Km = dto.OdometroKm.Value, dto.CamionId });
                }

                var estadoNorm = (dto.Estado ?? "").Trim().ToUpper();
                if (estadoNorm == "EN_TALLER")
                {
                    await connection.ExecuteAsync(
                        "UPDATE TB_CAMIONES SET Estado = 'MANTENIMIENTO', Activo = 0 WHERE Id = @CamionId",
                        new { dto.CamionId });
                }
                else if (estadoNorm == "RESUELTO" || estadoNorm == "COMPLETADO" || estadoNorm == "CANCELADO")
                {
                    var otrosEnTaller = await connection.ExecuteScalarAsync<int>(
                        "SELECT COUNT(*) FROM TB_MANTENIMIENTO_CAMIONES WHERE CamionId = @CamionId AND Estado = 'EN_TALLER' AND Id <> @Id",
                        new { dto.CamionId, Id = id });
                    if (otrosEnTaller == 0)
                    {
                        await connection.ExecuteAsync(
                            "UPDATE TB_CAMIONES SET Estado = 'ACTIVO', Activo = 1 WHERE Id = @CamionId",
                            new { dto.CamionId });
                    }
                }
            }

            return rows > 0;
        }

        public async Task<bool> EliminarMantenimientoAsync(int id)
        {
            using var connection = CreateConnection();
            var mant = await ObtenerPorIdAsync(id);
            if (mant == null) return false;

            var rows = await connection.ExecuteAsync("DELETE FROM TB_MANTENIMIENTO_CAMIONES WHERE Id = @Id", new { Id = id });
            if (rows > 0 && string.Equals(mant.Estado, "EN_TALLER", StringComparison.OrdinalIgnoreCase))
            {
                var otrosEnTaller = await connection.ExecuteScalarAsync<int>(
                    "SELECT COUNT(*) FROM TB_MANTENIMIENTO_CAMIONES WHERE CamionId = @CamionId AND Estado = 'EN_TALLER'",
                    new { mant.CamionId });
                if (otrosEnTaller == 0)
                {
                    await connection.ExecuteAsync(
                        "UPDATE TB_CAMIONES SET Estado = 'ACTIVO', Activo = 1 WHERE Id = @CamionId",
                        new { mant.CamionId });
                }
            }
            return rows > 0;
        }

        public async Task<IEnumerable<dynamic>> ObtenerAlertasPreventivasAsync()
        {
            using var connection = CreateConnection();
            // Buscar los eventos más recientes por camión y comparar con su odómetro actual
            var sql = @"
                SELECT 
                    c.Id AS CamionId,
                    c.Placa,
                    c.MarcaModelo,
                    c.OdometroActualKm,
                    u.NombreCompleto AS ChoferNombre,
                    m.Id AS UltimoMantenimientoId,
                    m.TipoEvento,
                    m.Titulo,
                    m.OdometroKm AS UltimoKmRealizado,
                    m.ProximoKmSugerido,
                    m.ProximaFechaSugerida,
                    CASE 
                        WHEN m.ProximoKmSugerido IS NOT NULL AND m.ProximoKmSugerido > 0 
                        THEN (m.ProximoKmSugerido - c.OdometroActualKm) 
                        ELSE NULL 
                    END AS KmRestantes,
                    CASE 
                        WHEN m.ProximaFechaSugerida IS NOT NULL 
                        THEN DATEDIFF(day, CAST(GETDATE() AS DATE), m.ProximaFechaSugerida) 
                        ELSE NULL 
                    END AS DiasRestantes
                FROM TB_CAMIONES c
                LEFT JOIN TB_USUARIOS u ON c.UsuarioId = u.Id
                OUTER APPLY (
                    SELECT TOP 1 * 
                    FROM TB_MANTENIMIENTO_CAMIONES sub 
                    WHERE sub.CamionId = c.Id AND sub.TipoEvento IN ('CAMBIO_ACEITE', 'CAUCHOS', 'PREVENTIVO')
                    ORDER BY sub.FechaEvento DESC, sub.Id DESC
                ) m
                WHERE c.Activo = 1
                ORDER BY c.Placa ASC";

            return await connection.QueryAsync<dynamic>(sql);
        }
        public async Task<int> ReportarIncidenteChoferAsync(ReportarIncidenteChoferDto dto, int choferId)
        {
            using var connection = CreateConnection();
            var sql = @"
                INSERT INTO TB_MANTENIMIENTO_CAMIONES (
                    CamionId, TipoEvento, Titulo, Descripcion, FechaEvento,
                    OdometroKm, Estado, Urgencia, FotoUrl, ReportadoPorChoferId, CostoTotalUSD, CreatedAt, CreatedBy
                )
                VALUES (
                    @CamionId, 'INCIDENTE', @Titulo, @Descripcion, CAST(GETDATE() AS DATE),
                    @OdometroKm, 'PENDIENTE', @Urgencia, @FotoUrl, @choferId, 0, GETDATE(), @choferId
                );
                SELECT CAST(SCOPE_IDENTITY() as int);";

            var id = await connection.ExecuteScalarAsync<int>(sql, new
            {
                dto.CamionId,
                dto.Titulo,
                dto.Descripcion,
                dto.OdometroKm,
                Urgencia = string.IsNullOrWhiteSpace(dto.Urgencia) ? "MEDIA" : dto.Urgencia.ToUpper(),
                dto.FotoUrl,
                choferId
            });

            if (dto.OdometroKm.HasValue && dto.OdometroKm.Value > 0)
            {
                await connection.ExecuteAsync(
                    "UPDATE TB_CAMIONES SET OdometroActualKm = @km WHERE Id = @CamionId AND ISNULL(OdometroActualKm, 0) < @km",
                    new { km = dto.OdometroKm.Value, dto.CamionId });
            }

            return id;
        }

        public async Task<bool> ActualizarEstadoIncidenteAsync(int id, ActualizarEstadoIncidenteDto dto, int userId)
        {
            using var connection = CreateConnection();
            var mant = await ObtenerPorIdAsync(id);
            if (mant == null) return false;

            string nuevoEstado = dto.Estado.Trim().ToUpper();
            var sql = @"
                UPDATE TB_MANTENIMIENTO_CAMIONES
                SET Estado = @nuevoEstado,
                    TallerOMecanico = COALESCE(@TallerOMecanico, TallerOMecanico),
                    CostoTotalUSD = COALESCE(@CostoTotalUSD, CostoTotalUSD),
                    Descripcion = CASE WHEN @SolucionAplicada IS NOT NULL AND @SolucionAplicada <> '' 
                                       THEN Descripcion + ' | Solución: ' + @SolucionAplicada 
                                       ELSE Descripcion END
                WHERE Id = @id";

            var rows = await connection.ExecuteAsync(sql, new
            {
                id,
                nuevoEstado,
                dto.TallerOMecanico,
                dto.CostoTotalUSD,
                dto.SolucionAplicada
            });

            if (nuevoEstado == "EN_TALLER")
            {
                await connection.ExecuteAsync(
                    "UPDATE TB_CAMIONES SET Estado = 'MANTENIMIENTO', Activo = 0 WHERE Id = @camionId",
                    new { camionId = mant.CamionId });
            }
            else if (nuevoEstado == "RESUELTO" || nuevoEstado == "COMPLETADO" || nuevoEstado == "CANCELADO")
            {
                var otrosEnTaller = await connection.ExecuteScalarAsync<int>(
                    "SELECT COUNT(*) FROM TB_MANTENIMIENTO_CAMIONES WHERE CamionId = @camionId AND Estado = 'EN_TALLER' AND Id <> @id",
                    new { camionId = mant.CamionId, id });
                if (otrosEnTaller == 0)
                {
                    await connection.ExecuteAsync(
                        "UPDATE TB_CAMIONES SET Estado = 'ACTIVO', Activo = 1 WHERE Id = @camionId",
                        new { camionId = mant.CamionId });
                }
            }

            return rows > 0;
        }
    }
}