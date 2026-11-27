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
    public interface IRepuestosRepository
    {
        Task<IEnumerable<RepuestoDto>> ObtenerRepuestosAsync(string? categoria = null, bool soloActivos = true);
        Task<RepuestoDto?> ObtenerRepuestoPorIdAsync(int id);
        Task<int> CrearRepuestoAsync(GuardarRepuestoDto dto);
        Task<bool> ActualizarRepuestoAsync(int id, GuardarRepuestoDto dto);
        Task<bool> EliminarRepuestoAsync(int id);
        Task<IEnumerable<MovimientoRepuestoDto>> ObtenerMovimientosAsync(int? repuestoId = null, int? camionId = null, int top = 100);
        Task<bool> RegistrarMovimientoAsync(RegistrarMovimientoRepuestoDto dto, int? userId);
    }

    public class RepuestosRepository : IRepuestosRepository
    {
        private readonly string _connectionString;

        public RepuestosRepository(IConfiguration configuration, TrazaLac.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_CV_PROD;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        private IDbConnection CreateConnection() => new SqlConnection(_connectionString);

        public async Task<IEnumerable<RepuestoDto>> ObtenerRepuestosAsync(string? categoria = null, bool soloActivos = true)
        {
            using var connection = CreateConnection();
            var sql = @"
                SELECT 
                    Id,
                    Codigo,
                    Nombre,
                    Categoria,
                    StockActual,
                    StockMinimo,
                    CostoUnitarioUSD,
                    UbicacionAlmacen,
                    Activo,
                    CreatedAt
                FROM TB_INVENTARIO_REPUESTOS
                WHERE (@SoloActivos = 0 OR Activo = 1)
                  AND (@Categoria IS NULL OR Categoria = @Categoria)
                ORDER BY Nombre ASC";

            return await connection.QueryAsync<RepuestoDto>(sql, new 
            { 
                SoloActivos = soloActivos ? 1 : 0,
                Categoria = string.IsNullOrWhiteSpace(categoria) ? null : categoria
            });
        }

        public async Task<RepuestoDto?> ObtenerRepuestoPorIdAsync(int id)
        {
            using var connection = CreateConnection();
            var sql = "SELECT * FROM TB_INVENTARIO_REPUESTOS WHERE Id = @Id";
            return await connection.QueryFirstOrDefaultAsync<RepuestoDto>(sql, new { Id = id });
        }

        public async Task<int> CrearRepuestoAsync(GuardarRepuestoDto dto)
        {
            using var connection = CreateConnection();
            var existe = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM TB_INVENTARIO_REPUESTOS WHERE Codigo = @Codigo AND Activo = 1",
                new { dto.Codigo });
            if (existe > 0)
                throw new InvalidOperationException($"Ya existe un repuesto activo con el código '{dto.Codigo}'.");

            var sql = @"
                INSERT INTO TB_INVENTARIO_REPUESTOS (
                    Codigo, Nombre, Categoria, StockActual, StockMinimo,
                    CostoUnitarioUSD, UbicacionAlmacen, Activo, CreatedAt
                )
                VALUES (
                    @Codigo, @Nombre, @Categoria, @StockActual, @StockMinimo,
                    @CostoUnitarioUSD, @UbicacionAlmacen, @Activo, GETDATE()
                );
                SELECT CAST(SCOPE_IDENTITY() as int);";

            return await connection.ExecuteScalarAsync<int>(sql, new
            {
                dto.Codigo,
                dto.Nombre,
                Categoria = string.IsNullOrWhiteSpace(dto.Categoria) ? "OTROS" : dto.Categoria,
                dto.StockActual,
                dto.StockMinimo,
                dto.CostoUnitarioUSD,
                dto.UbicacionAlmacen,
                dto.Activo
            });
        }

        public async Task<bool> ActualizarRepuestoAsync(int id, GuardarRepuestoDto dto)
        {
            using var connection = CreateConnection();
            var existe = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM TB_INVENTARIO_REPUESTOS WHERE Codigo = @Codigo AND Activo = 1 AND Id <> @Id",
                new { dto.Codigo, Id = id });
            if (existe > 0)
                throw new InvalidOperationException($"Ya existe otro repuesto activo con el código '{dto.Codigo}'.");

            var sql = @"
                UPDATE TB_INVENTARIO_REPUESTOS SET
                    Codigo = @Codigo,
                    Nombre = @Nombre,
                    Categoria = @Categoria,
                    StockActual = @StockActual,
                    StockMinimo = @StockMinimo,
                    CostoUnitarioUSD = @CostoUnitarioUSD,
                    UbicacionAlmacen = @UbicacionAlmacen,
                    Activo = @Activo
                WHERE Id = @Id";

            var rows = await connection.ExecuteAsync(sql, new
            {
                Id = id,
                dto.Codigo,
                dto.Nombre,
                Categoria = string.IsNullOrWhiteSpace(dto.Categoria) ? "OTROS" : dto.Categoria,
                dto.StockActual,
                dto.StockMinimo,
                dto.CostoUnitarioUSD,
                dto.UbicacionAlmacen,
                dto.Activo
            });

            return rows > 0;
        }

        public async Task<bool> EliminarRepuestoAsync(int id)
        {
            using var connection = CreateConnection();
            // Marcar como inactivo
            var rows = await connection.ExecuteAsync("UPDATE TB_INVENTARIO_REPUESTOS SET Activo = 0 WHERE Id = @Id", new { Id = id });
            return rows > 0;
        }

        public async Task<IEnumerable<MovimientoRepuestoDto>> ObtenerMovimientosAsync(int? repuestoId = null, int? camionId = null, int top = 100)
        {
            using var connection = CreateConnection();
            var sql = @"
                SELECT TOP (@Top)
                    m.Id,
                    m.RepuestoId,
                    r.Codigo AS RepuestoCodigo,
                    r.Nombre AS RepuestoNombre,
                    m.TipoMovimiento,
                    m.Cantidad,
                    m.CostoUnitarioUSD,
                    m.MantenimientoId,
                    m.CamionId,
                    c.Placa AS CamionPlaca,
                    m.Fecha,
                    m.Observaciones,
                    m.CreatedAt
                FROM TB_MOVIMIENTOS_REPUESTOS m
                INNER JOIN TB_INVENTARIO_REPUESTOS r ON m.RepuestoId = r.Id
                LEFT JOIN TB_CAMIONES c ON m.CamionId = c.Id
                WHERE (@RepuestoId IS NULL OR m.RepuestoId = @RepuestoId)
                  AND (@CamionId IS NULL OR m.CamionId = @CamionId)
                ORDER BY m.Fecha DESC, m.Id DESC";

            return await connection.QueryAsync<MovimientoRepuestoDto>(sql, new 
            { 
                Top = top,
                RepuestoId = repuestoId,
                CamionId = camionId
            });
        }

        public async Task<bool> RegistrarMovimientoAsync(RegistrarMovimientoRepuestoDto dto, int? userId)
        {
            using var connection = CreateConnection();
            if (connection.State != ConnectionState.Open) connection.Open();
            using var tx = connection.BeginTransaction();

            try
            {
                var repuesto = await connection.QueryFirstOrDefaultAsync<RepuestoDto>(
                    "SELECT * FROM TB_INVENTARIO_REPUESTOS WHERE Id = @Id",
                    new { Id = dto.RepuestoId },
                    transaction: tx);

                if (repuesto == null)
                {
                    throw new InvalidOperationException("El repuesto especificado no existe.");
                }

                int factor = 1;
                if (dto.TipoMovimiento == "SALIDA_MANTENIMIENTO" || dto.TipoMovimiento == "SALIDA_AJUSTE")
                {
                    factor = -1;
                    if (repuesto.StockActual < dto.Cantidad)
                    {
                        throw new InvalidOperationException($"Stock insuficiente para {repuesto.Nombre}. Disponible: {repuesto.StockActual}, Solicitado: {dto.Cantidad}.");
                    }
                }

                int nuevoStock = repuesto.StockActual + (factor * dto.Cantidad);

                // Actualizar stock y costo si es compra
                var updateSql = @"
                    UPDATE TB_INVENTARIO_REPUESTOS 
                    SET StockActual = @NuevoStock,
                        CostoUnitarioUSD = CASE WHEN @Costo > 0 AND @Tipo = 'ENTRADA_COMPRA' THEN @Costo ELSE CostoUnitarioUSD END
                    WHERE Id = @Id";

                await connection.ExecuteAsync(updateSql, new
                {
                    NuevoStock = nuevoStock,
                    Costo = dto.CostoUnitarioUSD,
                    Tipo = dto.TipoMovimiento,
                    Id = dto.RepuestoId
                }, transaction: tx);

                // Insertar movimiento
                var insertSql = @"
                    INSERT INTO TB_MOVIMIENTOS_REPUESTOS (
                        RepuestoId, TipoMovimiento, Cantidad, CostoUnitarioUSD,
                        MantenimientoId, CamionId, Fecha, Observaciones, CreatedAt, CreatedBy
                    )
                    VALUES (
                        @RepuestoId, @TipoMovimiento, @Cantidad, @CostoUnitarioUSD,
                        @MantenimientoId, @CamionId, @Fecha, @Observaciones, GETDATE(), @CreatedBy
                    )";

                await connection.ExecuteAsync(insertSql, new
                {
                    dto.RepuestoId,
                    dto.TipoMovimiento,
                    dto.Cantidad,
                    dto.CostoUnitarioUSD,
                    dto.MantenimientoId,
                    dto.CamionId,
                    dto.Fecha,
                    dto.Observaciones,
                    CreatedBy = userId
                }, transaction: tx);

                tx.Commit();
                return true;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }
    }
}
