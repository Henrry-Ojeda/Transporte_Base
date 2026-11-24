using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Interfaces;

namespace Transporte.Infrastructure.Repositories
{
    public interface IExamenesLecheRepository
    {
        // Parámetros de Calidad (CRUD + Parámetro Principal único)
        Task<IEnumerable<ParametroCalidadLecheDto>> ObtenerParametrosAsync();
        Task<ParametroCalidadLecheDto?> ObtenerParametroPrincipalAsync();
        Task<int> CrearParametroAsync(GuardarParametroCalidadLecheDto dto, int userId);
        Task<bool> ActualizarParametroAsync(int id, GuardarParametroCalidadLecheDto dto, int userId);
        Task<bool> MarcarParametroPrincipalAsync(int id, int userId);
        Task<bool> EliminarParametroAsync(int id, int userId);

        // Exámenes de Calidad (CRUD + Consultas por Ticket y Finca)
        Task<IEnumerable<ExamenLecheDto>> ObtenerHistorialAsync(
            DateTime? fechaInicio = null,
            DateTime? fechaFin = null,
            string? nivelPrueba = null,
            int? fincaId = null,
            int? choferId = null,
            long? controlRutaId = null,
            string? resultado = null,
            bool? soloFueraDeRango = null);
        Task<IEnumerable<ExamenLecheDto>> ObtenerPorTicketAsync(long controlRutaId);
        Task<IEnumerable<HistorialIntegralFincaItemDto>> ObtenerHistorialIntegralFincaAsync(
            int fincaId,
            DateTime? fechaInicio = null,
            DateTime? fechaFin = null);
        Task<long> CrearExamenAsync(GuardarExamenLecheDto dto, int userId);
        Task<bool> ActualizarExamenAsync(long id, GuardarExamenLecheDto dto, int userId);
        Task<bool> EliminarExamenAsync(long id, int userId);
    }

    public class ExamenesLecheRepository : IExamenesLecheRepository
    {
        private readonly string _connectionString;

        public ExamenesLecheRepository(IConfiguration configuration, ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString()
                ?? configuration.GetConnectionString("DefaultConnection")
                ?? configuration.GetConnectionString("BD_TRANSPORTE")
                ?? string.Empty;
        }

        // =====================================================================
        // PARÁMETROS DE CALIDAD DE LECHE (CRUD + CHECK PRINCIPAL ÚNICO)
        // =====================================================================

        public async Task<IEnumerable<ParametroCalidadLecheDto>> ObtenerParametrosAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            const string sql = @"
                SELECT Id, Nombre, TipoLeche, EsPrincipal, Activo,
                       GrasaMin, GrasaMax, SngMin, SngMax, DensidadMin, DensidadMax,
                       LactosaMin, LactosaMax, SalesMin, SalesMax, ProteinaMin, ProteinaMax,
                       SolidosTotalesMin, SolidosTotalesMax, AguaAdicionadaMin, AguaAdicionadaMax,
                       TemperaturaMin, TemperaturaMax, PuntoCongelacionMin, PuntoCongelacionMax,
                       PhMin, PhMax, ConductividadMin, ConductividadMax,
                       Observacion, CreatedAt, ModifiedAt
                FROM TB_PARAMETROS_CALIDAD_LECHE
                WHERE IsDeleted = 0
                ORDER BY EsPrincipal DESC, Activo DESC, Id DESC;";
            return await connection.QueryAsync<ParametroCalidadLecheDto>(sql);
        }

        public async Task<ParametroCalidadLecheDto?> ObtenerParametroPrincipalAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            const string sql = @"
                SELECT TOP 1 Id, Nombre, TipoLeche, EsPrincipal, Activo,
                       GrasaMin, GrasaMax, SngMin, SngMax, DensidadMin, DensidadMax,
                       LactosaMin, LactosaMax, SalesMin, SalesMax, ProteinaMin, ProteinaMax,
                       SolidosTotalesMin, SolidosTotalesMax, AguaAdicionadaMin, AguaAdicionadaMax,
                       TemperaturaMin, TemperaturaMax, PuntoCongelacionMin, PuntoCongelacionMax,
                       PhMin, PhMax, ConductividadMin, ConductividadMax,
                       Observacion, CreatedAt, ModifiedAt
                FROM TB_PARAMETROS_CALIDAD_LECHE
                WHERE IsDeleted = 0 AND EsPrincipal = 1
                ORDER BY Id DESC;";
            return await connection.QueryFirstOrDefaultAsync<ParametroCalidadLecheDto>(sql);
        }

        public async Task<int> CrearParametroAsync(GuardarParametroCalidadLecheDto dto, int userId)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var tx = connection.BeginTransaction();
            try
            {
                if (dto.EsPrincipal)
                {
                    await connection.ExecuteAsync(
                        "UPDATE TB_PARAMETROS_CALIDAD_LECHE SET EsPrincipal = 0, ModifiedAt = GETDATE(), ModifiedBy = @userId WHERE EsPrincipal = 1 AND IsDeleted = 0;",
                        new { userId }, tx);
                }

                const string sql = @"
                    INSERT INTO TB_PARAMETROS_CALIDAD_LECHE (
                        Nombre, TipoLeche, EsPrincipal, Activo,
                        GrasaMin, GrasaMax, SngMin, SngMax, DensidadMin, DensidadMax,
                        LactosaMin, LactosaMax, SalesMin, SalesMax, ProteinaMin, ProteinaMax,
                        SolidosTotalesMin, SolidosTotalesMax, AguaAdicionadaMin, AguaAdicionadaMax,
                        TemperaturaMin, TemperaturaMax, PuntoCongelacionMin, PuntoCongelacionMax,
                        PhMin, PhMax, ConductividadMin, ConductividadMax,
                        Observacion, IsDeleted, CreatedAt, CreatedBy
                    ) VALUES (
                        @Nombre, @TipoLeche, @EsPrincipal, @Activo,
                        @GrasaMin, @GrasaMax, @SngMin, @SngMax, @DensidadMin, @DensidadMax,
                        @LactosaMin, @LactosaMax, @SalesMin, @SalesMax, @ProteinaMin, @ProteinaMax,
                        @SolidosTotalesMin, @SolidosTotalesMax, @AguaAdicionadaMin, @AguaAdicionadaMax,
                        @TemperaturaMin, @TemperaturaMax, @PuntoCongelacionMin, @PuntoCongelacionMax,
                        @PhMin, @PhMax, @ConductividadMin, @ConductividadMax,
                        @Observacion, 0, GETDATE(), @userId
                    );
                    SELECT CAST(SCOPE_IDENTITY() AS INT);";

                var id = await connection.ExecuteScalarAsync<int>(sql, new
                {
                    Nombre = dto.Nombre.Trim(),
                    TipoLeche = string.IsNullOrWhiteSpace(dto.TipoLeche) ? "VACA" : dto.TipoLeche.Trim().ToUpperInvariant(),
                    dto.EsPrincipal,
                    Activo = dto.EsPrincipal || dto.Activo,
                    dto.GrasaMin, dto.GrasaMax, dto.SngMin, dto.SngMax, dto.DensidadMin, dto.DensidadMax,
                    dto.LactosaMin, dto.LactosaMax, dto.SalesMin, dto.SalesMax, dto.ProteinaMin, dto.ProteinaMax,
                    dto.SolidosTotalesMin, dto.SolidosTotalesMax, dto.AguaAdicionadaMin, dto.AguaAdicionadaMax,
                    dto.TemperaturaMin, dto.TemperaturaMax, dto.PuntoCongelacionMin, dto.PuntoCongelacionMax,
                    dto.PhMin, dto.PhMax, dto.ConductividadMin, dto.ConductividadMax,
                    Observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? null : dto.Observacion.Trim(),
                    userId
                }, tx);

                tx.Commit();
                return id;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        public async Task<bool> ActualizarParametroAsync(int id, GuardarParametroCalidadLecheDto dto, int userId)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var tx = connection.BeginTransaction();
            try
            {
                if (dto.EsPrincipal)
                {
                    await connection.ExecuteAsync(
                        "UPDATE TB_PARAMETROS_CALIDAD_LECHE SET EsPrincipal = 0, ModifiedAt = GETDATE(), ModifiedBy = @userId WHERE EsPrincipal = 1 AND Id <> @id AND IsDeleted = 0;",
                        new { id, userId }, tx);
                }

                const string sql = @"
                    UPDATE TB_PARAMETROS_CALIDAD_LECHE
                    SET Nombre = @Nombre,
                        TipoLeche = @TipoLeche,
                        EsPrincipal = @EsPrincipal,
                        Activo = @Activo,
                        GrasaMin = @GrasaMin, GrasaMax = @GrasaMax,
                        SngMin = @SngMin, SngMax = @SngMax,
                        DensidadMin = @DensidadMin, DensidadMax = @DensidadMax,
                        LactosaMin = @LactosaMin, LactosaMax = @LactosaMax,
                        SalesMin = @SalesMin, SalesMax = @SalesMax,
                        ProteinaMin = @ProteinaMin, ProteinaMax = @ProteinaMax,
                        SolidosTotalesMin = @SolidosTotalesMin, SolidosTotalesMax = @SolidosTotalesMax,
                        AguaAdicionadaMin = @AguaAdicionadaMin, AguaAdicionadaMax = @AguaAdicionadaMax,
                        TemperaturaMin = @TemperaturaMin, TemperaturaMax = @TemperaturaMax,
                        PuntoCongelacionMin = @PuntoCongelacionMin, PuntoCongelacionMax = @PuntoCongelacionMax,
                        PhMin = @PhMin, PhMax = @PhMax,
                        ConductividadMin = @ConductividadMin, ConductividadMax = @ConductividadMax,
                        Observacion = @Observacion,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @userId
                    WHERE Id = @id AND IsDeleted = 0;";

                var rows = await connection.ExecuteAsync(sql, new
                {
                    id,
                    Nombre = dto.Nombre.Trim(),
                    TipoLeche = string.IsNullOrWhiteSpace(dto.TipoLeche) ? "VACA" : dto.TipoLeche.Trim().ToUpperInvariant(),
                    dto.EsPrincipal,
                    Activo = dto.EsPrincipal || dto.Activo,
                    dto.GrasaMin, dto.GrasaMax, dto.SngMin, dto.SngMax, dto.DensidadMin, dto.DensidadMax,
                    dto.LactosaMin, dto.LactosaMax, dto.SalesMin, dto.SalesMax, dto.ProteinaMin, dto.ProteinaMax,
                    dto.SolidosTotalesMin, dto.SolidosTotalesMax, dto.AguaAdicionadaMin, dto.AguaAdicionadaMax,
                    dto.TemperaturaMin, dto.TemperaturaMax, dto.PuntoCongelacionMin, dto.PuntoCongelacionMax,
                    dto.PhMin, dto.PhMax, dto.ConductividadMin, dto.ConductividadMax,
                    Observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? null : dto.Observacion.Trim(),
                    userId
                }, tx);

                tx.Commit();
                return rows > 0;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        public async Task<bool> MarcarParametroPrincipalAsync(int id, int userId)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var tx = connection.BeginTransaction();
            try
            {
                await connection.ExecuteAsync(
                    "UPDATE TB_PARAMETROS_CALIDAD_LECHE SET EsPrincipal = 0, ModifiedAt = GETDATE(), ModifiedBy = @userId WHERE EsPrincipal = 1 AND Id <> @id AND IsDeleted = 0;",
                    new { id, userId }, tx);

                var rows = await connection.ExecuteAsync(
                    "UPDATE TB_PARAMETROS_CALIDAD_LECHE SET EsPrincipal = 1, Activo = 1, ModifiedAt = GETDATE(), ModifiedBy = @userId WHERE Id = @id AND IsDeleted = 0;",
                    new { id, userId }, tx);

                tx.Commit();
                return rows > 0;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        public async Task<bool> EliminarParametroAsync(int id, int userId)
        {
            using var connection = new SqlConnection(_connectionString);
            var rows = await connection.ExecuteAsync(
                "UPDATE TB_PARAMETROS_CALIDAD_LECHE SET IsDeleted = 1, EsPrincipal = 0, Activo = 0, ModifiedAt = GETDATE(), ModifiedBy = @userId WHERE Id = @id AND IsDeleted = 0;",
                new { id, userId });
            return rows > 0;
        }

        // =====================================================================
        // EVALUACIÓN DINÁMICA CONTRA PARÁMETRO PRINCIPAL (CERO HARDCODEO)
        // =====================================================================

        private static bool EstaFueraDeRango(decimal? valor, decimal? min, decimal? max)
        {
            if (!valor.HasValue) return false;
            if (min.HasValue && valor.Value < min.Value) return true;
            if (max.HasValue && valor.Value > max.Value) return true;
            return false;
        }

        private static bool EvaluarFueraDeRango(GuardarExamenLecheDto dto, ParametroCalidadLecheDto? p)
        {
            if (p == null) return false;
            return EstaFueraDeRango(dto.GrasaPct, p.GrasaMin, p.GrasaMax)
                || EstaFueraDeRango(dto.SngPct, p.SngMin, p.SngMax)
                || EstaFueraDeRango(dto.Densidad, p.DensidadMin, p.DensidadMax)
                || EstaFueraDeRango(dto.LactosaPct, p.LactosaMin, p.LactosaMax)
                || EstaFueraDeRango(dto.SalesPct, p.SalesMin, p.SalesMax)
                || EstaFueraDeRango(dto.ProteinaPct, p.ProteinaMin, p.ProteinaMax)
                || EstaFueraDeRango(dto.SolidosTotalesPct, p.SolidosTotalesMin, p.SolidosTotalesMax)
                || EstaFueraDeRango(dto.AguaAdicionadaPct, p.AguaAdicionadaMin, p.AguaAdicionadaMax)
                || EstaFueraDeRango(dto.TemperaturaC, p.TemperaturaMin, p.TemperaturaMax)
                || EstaFueraDeRango(dto.PuntoCongelacion, p.PuntoCongelacionMin, p.PuntoCongelacionMax)
                || EstaFueraDeRango(dto.Ph, p.PhMin, p.PhMax)
                || EstaFueraDeRango(dto.Conductividad, p.ConductividadMin, p.ConductividadMax);
        }

        // =====================================================================
        // EXÁMENES DE CALIDAD DE LECHE (CRUD + HISTORIAL)
        // =====================================================================

        public async Task<IEnumerable<ExamenLecheDto>> ObtenerHistorialAsync(
            DateTime? fechaInicio = null,
            DateTime? fechaFin = null,
            string? nivelPrueba = null,
            int? fincaId = null,
            int? choferId = null,
            long? controlRutaId = null,
            string? resultado = null,
            bool? soloFueraDeRango = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT e.Id, e.Fecha, e.HoraPrueba, e.NivelPrueba,
                       e.ControlRutaId, e.ControlCompaniaId, e.RutaRecoleccionId,
                       e.FincaId, f.Nombre AS FincaNombre,
                       e.CamionId, c.Placa AS CamionPlaca,
                       e.ChoferId, u.NombreCompleto AS NombreChofer,
                       e.ParametroCalidadId, p.Nombre AS ParametroCalidadNombre,
                       e.LitrosAsociados, e.TipoLeche,
                       e.Equipo, e.NumeroSerial, e.Calibracion,
                       e.GrasaPct, e.SngPct, e.Densidad, e.LactosaPct, e.SalesPct, e.ProteinaPct,
                       e.SolidosTotalesPct, e.AguaAdicionadaPct, e.TemperaturaC, e.PuntoCongelacion,
                       e.Ph, e.Conductividad,
                       e.Resultado, e.FueraDeRango,
                       e.ImagenExamen, e.ImagenRecibo, e.Observacion,
                       e.CreatedAt, uc.NombreCompleto AS CreadoPorNombre
                FROM TB_EXAMENES_LECHE e
                LEFT JOIN TB_FINCAS f ON e.FincaId = f.Id
                LEFT JOIN TB_CAMIONES c ON e.CamionId = c.Id
                LEFT JOIN TB_USUARIOS u ON e.ChoferId = u.Id
                LEFT JOIN TB_USUARIOS uc ON e.CreatedBy = uc.Id
                LEFT JOIN TB_PARAMETROS_CALIDAD_LECHE p ON e.ParametroCalidadId = p.Id
                WHERE e.IsDeleted = 0 ";

            var parameters = new DynamicParameters();

            if (fechaInicio.HasValue)
            {
                sql += " AND e.Fecha >= @fechaInicio ";
                parameters.Add("fechaInicio", fechaInicio.Value.Date);
            }
            if (fechaFin.HasValue)
            {
                sql += " AND e.Fecha <= @fechaFin ";
                parameters.Add("fechaFin", fechaFin.Value.Date);
            }
            if (!string.IsNullOrWhiteSpace(nivelPrueba) && !nivelPrueba.Equals("TODOS", StringComparison.OrdinalIgnoreCase))
            {
                sql += " AND e.NivelPrueba = @nivelPrueba ";
                parameters.Add("nivelPrueba", nivelPrueba.Trim().ToUpperInvariant());
            }
            if (fincaId.HasValue && fincaId.Value > 0)
            {
                sql += " AND e.FincaId = @fincaId ";
                parameters.Add("fincaId", fincaId.Value);
            }
            if (choferId.HasValue && choferId.Value > 0)
            {
                sql += " AND e.ChoferId = @choferId ";
                parameters.Add("choferId", choferId.Value);
            }
            if (controlRutaId.HasValue && controlRutaId.Value > 0)
            {
                sql += " AND e.ControlRutaId = @controlRutaId ";
                parameters.Add("controlRutaId", controlRutaId.Value);
            }
            if (!string.IsNullOrWhiteSpace(resultado) && !resultado.Equals("TODOS", StringComparison.OrdinalIgnoreCase))
            {
                sql += " AND e.Resultado = @resultado ";
                parameters.Add("resultado", resultado.Trim().ToUpperInvariant());
            }
            if (soloFueraDeRango == true)
            {
                sql += " AND e.FueraDeRango = 1 ";
            }

            sql += " ORDER BY e.Fecha DESC, e.Id DESC;";
            return await connection.QueryAsync<ExamenLecheDto>(sql, parameters);
        }

        public async Task<IEnumerable<ExamenLecheDto>> ObtenerPorTicketAsync(long controlRutaId)
        {
            return await ObtenerHistorialAsync(controlRutaId: controlRutaId);
        }

        public async Task<IEnumerable<HistorialIntegralFincaItemDto>> ObtenerHistorialIntegralFincaAsync(
            int fincaId,
            DateTime? fechaInicio = null,
            DateTime? fechaFin = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                -- 1. Recolecciones reales de la finca + examen individual de finca o examen general del ticket
                SELECT
                    CAST(r.Fecha AS DATE) AS Fecha,
                    COALESCE(ef.HoraPrueba, et.HoraPrueba) AS HoraPrueba,
                    r.ControlRutaId,
                    r.Id AS RutaRecoleccionId,
                    r.FincaId,
                    f.Nombre AS FincaNombre,
                    r.Litros AS LitrosRecogidos,
                    ISNULL(r.TipoLeche, 'VACA') AS TipoLeche,
                    ISNULL(r.EsAcida, 0) AS EsAcida,
                    r.UsuarioId AS ChoferId,
                    u.NombreCompleto AS NombreChofer,
                    cr.CamionId,
                    cam.Placa AS CamionPlaca,
                    r.Observacion AS ObservacionRecoleccion,

                    COALESCE(ef.Id, et.Id) AS ExamenId,
                    CASE
                        WHEN ef.Id IS NOT NULL THEN 'FINCA'
                        WHEN et.Id IS NOT NULL THEN 'TICKET'
                        ELSE 'SIN_EXAMEN'
                    END AS NivelPrueba,
                    COALESCE(ef.Equipo, et.Equipo) AS Equipo,
                    COALESCE(ef.NumeroSerial, et.NumeroSerial) AS NumeroSerial,
                    COALESCE(ef.Calibracion, et.Calibracion) AS Calibracion,

                    COALESCE(ef.GrasaPct, et.GrasaPct) AS GrasaPct,
                    COALESCE(ef.SngPct, et.SngPct) AS SngPct,
                    COALESCE(ef.Densidad, et.Densidad) AS Densidad,
                    COALESCE(ef.LactosaPct, et.LactosaPct) AS LactosaPct,
                    COALESCE(ef.SalesPct, et.SalesPct) AS SalesPct,
                    COALESCE(ef.ProteinaPct, et.ProteinaPct) AS ProteinaPct,
                    COALESCE(ef.SolidosTotalesPct, et.SolidosTotalesPct) AS SolidosTotalesPct,
                    COALESCE(ef.AguaAdicionadaPct, et.AguaAdicionadaPct) AS AguaAdicionadaPct,
                    COALESCE(ef.TemperaturaC, et.TemperaturaC) AS TemperaturaC,
                    COALESCE(ef.PuntoCongelacion, et.PuntoCongelacion) AS PuntoCongelacion,
                    COALESCE(ef.Ph, et.Ph) AS Ph,
                    COALESCE(ef.Conductividad, et.Conductividad) AS Conductividad,

                    COALESCE(ef.Resultado, et.Resultado) AS Resultado,
                    CAST(ISNULL(COALESCE(ef.FueraDeRango, et.FueraDeRango), 0) AS BIT) AS FueraDeRango,
                    COALESCE(ef.ImagenExamen, et.ImagenExamen, cr.FotoExamenLeche) AS ImagenExamen,
                    COALESCE(ef.ImagenRecibo, et.ImagenRecibo, cr.FotoReciboReceptoria) AS ImagenRecibo,
                    COALESCE(ef.Observacion, et.Observacion) AS ObservacionExamen
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                LEFT JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON r.ControlRutaId = cr.Id
                LEFT JOIN TB_CAMIONES cam ON cr.CamionId = cam.Id
                OUTER APPLY (
                    SELECT TOP 1 *
                    FROM TB_EXAMENES_LECHE ex
                    WHERE ex.IsDeleted = 0
                      AND ex.NivelPrueba = 'FINCA'
                      AND ex.FincaId = r.FincaId
                      AND (
                          ex.RutaRecoleccionId = r.Id
                          OR (ex.ControlRutaId IS NOT NULL AND ex.ControlRutaId = r.ControlRutaId)
                          OR (ex.RutaRecoleccionId IS NULL AND ex.ControlRutaId IS NULL AND ex.Fecha = CAST(r.Fecha AS DATE))
                      )
                    ORDER BY CASE WHEN ex.RutaRecoleccionId = r.Id THEN 0 ELSE 1 END, ex.Id DESC
                ) ef
                OUTER APPLY (
                    SELECT TOP 1 *
                    FROM TB_EXAMENES_LECHE ex2
                    WHERE ex2.IsDeleted = 0
                      AND ex2.NivelPrueba = 'TICKET'
                      AND r.ControlRutaId IS NOT NULL
                      AND ex2.ControlRutaId = r.ControlRutaId
                    ORDER BY ex2.Id DESC
                ) et
                WHERE r.FincaId = @fincaId
                  AND r.Litros > 0
                  AND (@fechaInicio IS NULL OR CAST(r.Fecha AS DATE) >= @fechaInicio)
                  AND (@fechaFin IS NULL OR CAST(r.Fecha AS DATE) <= @fechaFin)

                UNION ALL

                -- 2. Exámenes puntuales de la finca sin recolección asociada ese día
                SELECT
                    e.Fecha,
                    e.HoraPrueba,
                    e.ControlRutaId,
                    e.RutaRecoleccionId,
                    e.FincaId,
                    f.Nombre AS FincaNombre,
                    ISNULL(e.LitrosAsociados, 0) AS LitrosRecogidos,
                    ISNULL(e.TipoLeche, 'VACA') AS TipoLeche,
                    CAST(CASE WHEN e.Resultado = 'ACIDA' THEN 1 ELSE 0 END AS BIT) AS EsAcida,
                    e.ChoferId,
                    u.NombreCompleto AS NombreChofer,
                    e.CamionId,
                    cam.Placa AS CamionPlaca,
                    NULL AS ObservacionRecoleccion,

                    e.Id AS ExamenId,
                    e.NivelPrueba,
                    e.Equipo,
                    e.NumeroSerial,
                    e.Calibracion,
                    e.GrasaPct, e.SngPct, e.Densidad, e.LactosaPct, e.SalesPct, e.ProteinaPct,
                    e.SolidosTotalesPct, e.AguaAdicionadaPct, e.TemperaturaC, e.PuntoCongelacion,
                    e.Ph, e.Conductividad,
                    e.Resultado,
                    e.FueraDeRango,
                    e.ImagenExamen,
                    e.ImagenRecibo,
                    e.Observacion AS ObservacionExamen
                FROM TB_EXAMENES_LECHE e
                INNER JOIN TB_FINCAS f ON e.FincaId = f.Id
                LEFT JOIN TB_USUARIOS u ON e.ChoferId = u.Id
                LEFT JOIN TB_CAMIONES cam ON e.CamionId = cam.Id
                WHERE e.IsDeleted = 0
                  AND e.FincaId = @fincaId
                  AND e.RutaRecoleccionId IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM TB_RUTAS_RECOLECCION r2
                      WHERE r2.FincaId = e.FincaId
                        AND r2.Litros > 0
                        AND (
                            (e.ControlRutaId IS NOT NULL AND r2.ControlRutaId = e.ControlRutaId)
                            OR (e.ControlRutaId IS NULL AND CAST(r2.Fecha AS DATE) = e.Fecha)
                        )
                  )
                  AND (@fechaInicio IS NULL OR e.Fecha >= @fechaInicio)
                  AND (@fechaFin IS NULL OR e.Fecha <= @fechaFin)

                ORDER BY Fecha DESC, ControlRutaId DESC, ExamenId DESC;";

            return await connection.QueryAsync<HistorialIntegralFincaItemDto>(sql, new
            {
                fincaId,
                fechaInicio = fechaInicio?.Date,
                fechaFin = fechaFin?.Date
            });
        }

        public async Task<long> CrearExamenAsync(GuardarExamenLecheDto dto, int userId)
        {
            using var connection = new SqlConnection(_connectionString);

            // Auto-completar ChoferId, CamionId y Litros si viene ControlRutaId y faltan
            int? choferId = dto.ChoferId;
            int? camionId = dto.CamionId;
            int? litros = dto.LitrosAsociados;
            DateTime fecha = (dto.Fecha ?? DateTime.Now).Date;

            if (dto.ControlRutaId.HasValue && dto.ControlRutaId.Value > 0)
            {
                var cr = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT Fecha, UsuarioId, CamionId, TotalLitrosFinca, LitrosRecibidosReceptoria FROM TB_CONTROL_RUTAS WHERE Id = @id",
                    new { id = dto.ControlRutaId.Value });
                if (cr != null)
                {
                    if (!dto.Fecha.HasValue && cr.Fecha != null) fecha = ((DateTime)cr.Fecha).Date;
                    if (!choferId.HasValue && cr.UsuarioId != null) choferId = (int)cr.UsuarioId;
                    if (!camionId.HasValue && cr.CamionId != null) camionId = (int)cr.CamionId;
                    if (!litros.HasValue && !dto.FincaId.HasValue)
                        litros = (int?)(cr.LitrosRecibidosReceptoria ?? cr.TotalLitrosFinca);
                }
            }

            if (dto.RutaRecoleccionId.HasValue && dto.RutaRecoleccionId.Value > 0 && !litros.HasValue)
            {
                litros = await connection.ExecuteScalarAsync<int?>(
                    "SELECT Litros FROM TB_RUTAS_RECOLECCION WHERE Id = @id",
                    new { id = dto.RutaRecoleccionId.Value });
            }

            var parametroPrincipal = await ObtenerParametroPrincipalAsync();
            int? parametroId = dto.ParametroCalidadId ?? parametroPrincipal?.Id;
            bool fueraDeRango = EvaluarFueraDeRango(dto, parametroPrincipal);

            string nivel = string.IsNullOrWhiteSpace(dto.NivelPrueba)
                ? (dto.FincaId.HasValue && dto.FincaId.Value > 0 ? "FINCA" : "TICKET")
                : dto.NivelPrueba.Trim().ToUpperInvariant();

            string resultado = string.IsNullOrWhiteSpace(dto.Resultado)
                ? (fueraDeRango ? "OBSERVADA" : "APROBADA")
                : dto.Resultado.Trim().ToUpperInvariant();

            const string sql = @"
                INSERT INTO TB_EXAMENES_LECHE (
                    Fecha, HoraPrueba, NivelPrueba, ControlRutaId, ControlCompaniaId, RutaRecoleccionId,
                    FincaId, CamionId, ChoferId, ParametroCalidadId, LitrosAsociados, TipoLeche,
                    Equipo, NumeroSerial, Calibracion,
                    GrasaPct, SngPct, Densidad, LactosaPct, SalesPct, ProteinaPct,
                    SolidosTotalesPct, AguaAdicionadaPct, TemperaturaC, PuntoCongelacion, Ph, Conductividad,
                    Resultado, FueraDeRango, ImagenExamen, ImagenRecibo, Observacion,
                    IsDeleted, CreatedAt, CreatedBy
                ) VALUES (
                    @fecha, @HoraPrueba, @nivel, @ControlRutaId, @ControlCompaniaId, @RutaRecoleccionId,
                    @FincaId, @camionId, @choferId, @parametroId, @litros, @TipoLeche,
                    @Equipo, @NumeroSerial, @Calibracion,
                    @GrasaPct, @SngPct, @Densidad, @LactosaPct, @SalesPct, @ProteinaPct,
                    @SolidosTotalesPct, @AguaAdicionadaPct, @TemperaturaC, @PuntoCongelacion, @Ph, @Conductividad,
                    @resultado, @fueraDeRango, @ImagenExamen, @ImagenRecibo, @Observacion,
                    0, GETDATE(), @userId
                );
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

            var newId = await connection.ExecuteScalarAsync<long>(sql, new
            {
                fecha,
                dto.HoraPrueba,
                nivel,
                dto.ControlRutaId,
                dto.ControlCompaniaId,
                dto.RutaRecoleccionId,
                dto.FincaId,
                camionId,
                choferId,
                parametroId,
                litros,
                TipoLeche = string.IsNullOrWhiteSpace(dto.TipoLeche) ? "VACA" : dto.TipoLeche.Trim().ToUpperInvariant(),
                dto.Equipo,
                dto.NumeroSerial,
                dto.Calibracion,
                dto.GrasaPct,
                dto.SngPct,
                dto.Densidad,
                dto.LactosaPct,
                dto.SalesPct,
                dto.ProteinaPct,
                dto.SolidosTotalesPct,
                dto.AguaAdicionadaPct,
                dto.TemperaturaC,
                dto.PuntoCongelacion,
                dto.Ph,
                dto.Conductividad,
                resultado,
                fueraDeRango,
                dto.ImagenExamen,
                dto.ImagenRecibo,
                Observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? null : dto.Observacion.Trim(),
                userId
            });

            // Sincronizar fotos a TB_CONTROL_RUTAS si es examen nivel TICKET
            if (nivel == "TICKET" && dto.ControlRutaId.HasValue && dto.ControlRutaId.Value > 0 &&
                (!string.IsNullOrWhiteSpace(dto.ImagenExamen) || !string.IsNullOrWhiteSpace(dto.ImagenRecibo)))
            {
                try
                {
                    await connection.ExecuteAsync(@"
                        UPDATE TB_CONTROL_RUTAS
                        SET FotoExamenLeche = COALESCE(@imgEx, FotoExamenLeche),
                            FotoReciboReceptoria = COALESCE(@imgRec, FotoReciboReceptoria)
                        WHERE Id = @controlRutaId;",
                        new
                        {
                            imgEx = string.IsNullOrWhiteSpace(dto.ImagenExamen) ? null : dto.ImagenExamen,
                            imgRec = string.IsNullOrWhiteSpace(dto.ImagenRecibo) ? null : dto.ImagenRecibo,
                            controlRutaId = dto.ControlRutaId.Value
                        });
                }
                catch { /* Tolerante */ }
            }

            return newId;
        }

        public async Task<bool> ActualizarExamenAsync(long id, GuardarExamenLecheDto dto, int userId)
        {
            using var connection = new SqlConnection(_connectionString);
            var parametroPrincipal = await ObtenerParametroPrincipalAsync();
            bool fueraDeRango = EvaluarFueraDeRango(dto, parametroPrincipal);

            string nivel = string.IsNullOrWhiteSpace(dto.NivelPrueba)
                ? (dto.FincaId.HasValue && dto.FincaId.Value > 0 ? "FINCA" : "TICKET")
                : dto.NivelPrueba.Trim().ToUpperInvariant();

            string resultado = string.IsNullOrWhiteSpace(dto.Resultado)
                ? (fueraDeRango ? "OBSERVADA" : "APROBADA")
                : dto.Resultado.Trim().ToUpperInvariant();

            const string sql = @"
                UPDATE TB_EXAMENES_LECHE
                SET Fecha = COALESCE(@Fecha, Fecha),
                    HoraPrueba = @HoraPrueba,
                    NivelPrueba = @nivel,
                    ControlRutaId = @ControlRutaId,
                    ControlCompaniaId = @ControlCompaniaId,
                    RutaRecoleccionId = @RutaRecoleccionId,
                    FincaId = @FincaId,
                    CamionId = @CamionId,
                    ChoferId = @ChoferId,
                    LitrosAsociados = @LitrosAsociados,
                    TipoLeche = @TipoLeche,
                    Equipo = @Equipo,
                    NumeroSerial = @NumeroSerial,
                    Calibracion = @Calibracion,
                    GrasaPct = @GrasaPct,
                    SngPct = @SngPct,
                    Densidad = @Densidad,
                    LactosaPct = @LactosaPct,
                    SalesPct = @SalesPct,
                    ProteinaPct = @ProteinaPct,
                    SolidosTotalesPct = @SolidosTotalesPct,
                    AguaAdicionadaPct = @AguaAdicionadaPct,
                    TemperaturaC = @TemperaturaC,
                    PuntoCongelacion = @PuntoCongelacion,
                    Ph = @Ph,
                    Conductividad = @Conductividad,
                    Resultado = @resultado,
                    FueraDeRango = @fueraDeRango,
                    ImagenExamen = CASE WHEN @ImagenExamen IS NOT NULL THEN @ImagenExamen ELSE ImagenExamen END,
                    ImagenRecibo = CASE WHEN @ImagenRecibo IS NOT NULL THEN @ImagenRecibo ELSE ImagenRecibo END,
                    Observacion = @Observacion,
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @userId
                WHERE Id = @id AND IsDeleted = 0;";

            var rows = await connection.ExecuteAsync(sql, new
            {
                id,
                Fecha = dto.Fecha?.Date,
                dto.HoraPrueba,
                nivel,
                dto.ControlRutaId,
                dto.ControlCompaniaId,
                dto.RutaRecoleccionId,
                dto.FincaId,
                dto.CamionId,
                dto.ChoferId,
                dto.LitrosAsociados,
                TipoLeche = string.IsNullOrWhiteSpace(dto.TipoLeche) ? "VACA" : dto.TipoLeche.Trim().ToUpperInvariant(),
                dto.Equipo,
                dto.NumeroSerial,
                dto.Calibracion,
                dto.GrasaPct,
                dto.SngPct,
                dto.Densidad,
                dto.LactosaPct,
                dto.SalesPct,
                dto.ProteinaPct,
                dto.SolidosTotalesPct,
                dto.AguaAdicionadaPct,
                dto.TemperaturaC,
                dto.PuntoCongelacion,
                dto.Ph,
                dto.Conductividad,
                resultado,
                fueraDeRango,
                dto.ImagenExamen,
                dto.ImagenRecibo,
                Observacion = string.IsNullOrWhiteSpace(dto.Observacion) ? null : dto.Observacion.Trim(),
                userId
            });

            return rows > 0;
        }

        public async Task<bool> EliminarExamenAsync(long id, int userId)
        {
            using var connection = new SqlConnection(_connectionString);
            var rows = await connection.ExecuteAsync(
                "UPDATE TB_EXAMENES_LECHE SET IsDeleted = 1, ModifiedAt = GETDATE(), ModifiedBy = @userId WHERE Id = @id AND IsDeleted = 0;",
                new { id, userId });
            return rows > 0;
        }
    }
}
