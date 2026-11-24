using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

namespace Transporte.Infrastructure.Repositories
{
    public interface IBcvRepository
    {
        Task<HistorialBcv?> ObtenerTasaHoyAsync(DateTime fecha);
        Task<HistorialBcv?> ObtenerTasaFechaAsync(DateTime fecha);
        Task<HistorialBcv?> ObtenerUltimaTasaAsync();
        Task<IEnumerable<HistorialBcv>> ObtenerHistorialAsync(int top = 1000);
        Task<int> RegistrarTasaAsync(RegistrarBcvDto dto, int? usuarioId = null);
        Task<int> GuardarTasaAsync(RegistrarBcvDto dto, int? usuarioId = null);
        Task<bool> EditarTasaAsync(int id, EditarBcvDto dto, int? usuarioId = null);
        Task<bool> EliminarTasaAsync(int id);
    }

    public class BcvRepository : IBcvRepository
    {
        private readonly string _connectionString;
        public BcvRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        public async Task<HistorialBcv?> ObtenerTasaHoyAsync(DateTime fecha)
        {
            return await ObtenerTasaFechaAsync(fecha);
        }

        public async Task<HistorialBcv?> ObtenerTasaFechaAsync(DateTime fecha)
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryFirstOrDefaultAsync<HistorialBcv>(
                "SELECT TOP 1 * FROM TB_HISTORIAL_BCV WHERE CAST(Fecha AS DATE) = @fecha ORDER BY Id DESC, CreatedAt DESC", 
                new { fecha = fecha.Date });
        }

        public async Task<HistorialBcv?> ObtenerUltimaTasaAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryFirstOrDefaultAsync<HistorialBcv>(
                "SELECT TOP 1 * FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC, CreatedAt DESC");
        }

        public async Task<IEnumerable<HistorialBcv>> ObtenerHistorialAsync(int top = 1000)
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryAsync<HistorialBcv>(
                "SELECT TOP (@top) * FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC, CreatedAt DESC", 
                new { top });
        }

        public async Task<int> RegistrarTasaAsync(RegistrarBcvDto dto, int? usuarioId = null)
        {
            return await GuardarTasaAsync(dto, usuarioId);
        }

        public async Task<int> GuardarTasaAsync(RegistrarBcvDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                MERGE TB_HISTORIAL_BCV AS target
                USING (SELECT @fecha AS Fecha) AS source
                ON (CAST(target.Fecha AS DATE) = CAST(source.Fecha AS DATE))
                WHEN MATCHED THEN
                    UPDATE SET TasaDolarBs = @tasaDolarBs, Fuente = @fuente, Observacion = @observacion, CreatedBy = @usuarioId, CreatedAt = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (Fecha, TasaDolarBs, Fuente, Observacion, CreatedBy, CreatedAt)
                    VALUES (@fecha, @tasaDolarBs, @fuente, @observacion, @usuarioId, GETDATE());
                SELECT TOP 1 Id FROM TB_HISTORIAL_BCV WHERE CAST(Fecha AS DATE) = @fecha;";

            var resId = await connection.ExecuteScalarAsync<int>(sql, new
            {
                fecha = dto.Fecha.Date,
                tasaDolarBs = dto.TasaDolarBs,
                fuente = dto.Fuente ?? "OFICIAL_BCV",
                observacion = dto.Observacion,
                usuarioId
            });

            // Actualizar automÃ¡ticamente todas las cuotas pendientes de adelantos activos al nuevo valor del dÃ³lar
            try
            {
                var sqlAdelantos = @"
                    UPDATE c
                    SET c.TasaBcvAplicada = @tasaDolarBs,
                        c.ModifiedAt = GETDATE(),
                        c.ModifiedBy = @usuarioId
                    FROM TB_ADELANTOS_CUOTAS c
                    INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                    WHERE a.Estado != 'PAGADO'
                      AND a.MontoPendienteUSD > 0.001
                      AND c.Estado != 'COBRADO'
                      AND c.Estado != 'ANULADA';";
                await connection.ExecuteAsync(sqlAdelantos, new { tasaDolarBs = dto.TasaDolarBs, usuarioId });
            }
            catch { }

            return resId;
        }

        public async Task<bool> EditarTasaAsync(int id, EditarBcvDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                UPDATE TB_HISTORIAL_BCV
                SET 
                    Fecha = COALESCE(@fecha, Fecha),
                    TasaDolarBs = COALESCE(@tasaDolarBs, TasaDolarBs),
                    Fuente = COALESCE(@fuente, Fuente),
                    Observacion = COALESCE(@observacion, Observacion),
                    CreatedBy = COALESCE(@usuarioId, CreatedBy)
                WHERE Id = @id";

            var rows = await connection.ExecuteAsync(sql, new
            {
                id,
                fecha = dto.Fecha?.Date,
                tasaDolarBs = dto.TasaDolarBs,
                fuente = dto.Fuente,
                observacion = dto.Observacion,
                usuarioId
            });

            if (dto.TasaDolarBs.HasValue && dto.TasaDolarBs.Value > 0)
            {
                try
                {
                    var sqlAdelantos = @"
                        UPDATE c
                        SET c.TasaBcvAplicada = @tasaDolarBs,
                            c.ModifiedAt = GETDATE(),
                            c.ModifiedBy = @usuarioId
                        FROM TB_ADELANTOS_CUOTAS c
                        INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                        WHERE a.Estado != 'PAGADO'
                          AND a.MontoPendienteUSD > 0.001
                          AND c.Estado != 'COBRADO'
                          AND c.Estado != 'ANULADA';";
                    await connection.ExecuteAsync(sqlAdelantos, new { tasaDolarBs = dto.TasaDolarBs.Value, usuarioId });
                }
                catch { }
            }

            return rows > 0;
        }

        public async Task<bool> EliminarTasaAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = "DELETE FROM TB_HISTORIAL_BCV WHERE Id = @id";
            var rows = await connection.ExecuteAsync(sql, new { id });
            return rows > 0;
        }
    }

}
