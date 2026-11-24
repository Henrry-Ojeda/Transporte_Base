using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

namespace Transporte.Infrastructure.Repositories
{
    public interface IReportesRepository
    {
        Task<ReporteDiariosDto> ObtenerReporteDiariosAsync(DateTime fechaInicio, DateTime fechaFin);
        Task<List<ReporteEntidadResumenDto>> ObtenerReporteReceptoriasAsync(DateTime fechaInicio, DateTime fechaFin, int? companiaId = null);
        Task<List<ReporteEntidadResumenDto>> ObtenerReporteFincasAsync(DateTime fechaInicio, DateTime fechaFin, List<int>? fincaIds = null);
        Task<List<ReporteEntidadResumenDto>> ObtenerReporteChoferesAsync(DateTime fechaInicio, DateTime fechaFin, int? choferId = null);
        Task<List<ReporteBancoFincaDto>> ObtenerReporteBancosFincasAsync(DateTime fechaInicio, DateTime fechaFin, int? bancoId = null, int? cicloId = null, decimal? tasaBcvManual = null);
        Task<List<ReporteRelacionCompaniaDto>> ObtenerReporteRelacionCompaniasAsync(DateTime fechaInicio, DateTime fechaFin, int? companiaId = null, int? cicloId = null, decimal? tasaBcvManual = null);
        Task<List<ReporteRelacionChoferDto>> ObtenerReporteRelacionChoferesAsync(DateTime fechaInicio, DateTime fechaFin);
        Task<DashboardAvanzadoDto> ObtenerDashboardAvanzadoAsync(int semanas = 8, int? usuarioId = null);
    }

    public class ReportesRepository : IReportesRepository
    {
        private readonly string _connectionString;
        private readonly ICatalogosRepository _catalogosRepository;

        public ReportesRepository(IConfiguration configuration, ICatalogosRepository catalogosRepository, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection")!;
            _catalogosRepository = catalogosRepository;
        }

        private async Task<decimal> ObtenerTasaActualAsync(SqlConnection connection)
        {
            var tasa = await connection.QueryFirstOrDefaultAsync<decimal?>(
                "SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC, CreatedAt DESC");
            return tasa ?? 791.3248m;
        }

        public async Task<ReporteDiariosDto> ObtenerReporteDiariosAsync(DateTime fechaInicio, DateTime fechaFin)
        {
            using var connection = new SqlConnection(_connectionString);

            var sqlRutas = @"
                SELECT CONVERT(varchar(10), Fecha, 120) AS Fecha, ISNULL(SUM(Litros), 0) AS Litros
                FROM TB_RUTAS_RECOLECCION
                WHERE Fecha >= @fechaInicio AND Fecha <= @fechaFin
                GROUP BY Fecha
                ORDER BY Fecha";

            var sqlReceptorias = @"
                WITH EntregasUnificadas AS (
                    -- Solo ENTRADAS a receptorÃ­a (EsPrincipal = 1 o despachos directos con ControlRutaId) para evitar sumar doblemente salidas a plantas externas
                    SELECT 
                        cc.Fecha, 
                        COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0) AS Litros,
                        c.TipoServicioId
                    FROM TB_CONTROL_COMPANIAS cc
                    INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                    WHERE cc.Fecha >= @fechaInicio AND cc.Fecha <= @fechaFin
                      AND (cc.LitrosDespachados > 0 OR cc.LitrosRecibidosCompania > 0)
                      AND (ISNULL(c.EsPrincipal, 0) = 1 OR cc.ControlRutaId IS NOT NULL)
                    UNION ALL
                    SELECT 
                        e.Fecha, 
                        e.Litros,
                        c.TipoServicioId
                    FROM TB_ENTREGAS_COMPANIA e
                    INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                    WHERE e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin
                      AND e.Litros > 0
                      AND (ISNULL(c.EsPrincipal, 0) = 1 OR e.ControlRutaId IS NOT NULL)
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.Fecha >= @fechaInicio AND cc2.Fecha <= @fechaFin
                            AND cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE) AND cc2.UsuarioId = e.UsuarioId)
                            )
                      )
                )
                SELECT CONVERT(varchar(10), Fecha, 120) AS Fecha, ISNULL(SUM(Litros), 0) AS Litros
                FROM EntregasUnificadas
                GROUP BY Fecha
                ORDER BY Fecha";

            var sqlTranspRutas = @"
                SELECT CONVERT(varchar(10), r.Fecha, 120) AS Fecha, ISNULL(SUM(r.Litros), 0) AS Litros
                FROM TB_RUTAS_RECOLECCION r
                LEFT JOIN TB_FINCAS f ON r.FincaId = f.Id
                WHERE r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin
                  AND f.TipoServicioId = 2
                GROUP BY r.Fecha
                ORDER BY r.Fecha";

            var sqlTranspReceptorias = @"
                WITH EntregasUnificadas AS (
                    SELECT 
                        cc.Fecha, 
                        COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0) AS Litros,
                        CASE 
                            WHEN cc.ControlRutaId IS NOT NULL AND (
                                SELECT ISNULL(SUM(CASE WHEN ISNULL(ff.TipoServicioId, 1) = 2 THEN rr.Litros ELSE 0 END), 0)
                                FROM TB_RUTAS_RECOLECCION rr
                                INNER JOIN TB_FINCAS ff ON rr.FincaId = ff.Id
                                WHERE rr.ControlRutaId = cc.ControlRutaId
                            ) = COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0)
                            THEN 2
                            ELSE c.TipoServicioId
                        END AS TipoServicioEfectivo
                    FROM TB_CONTROL_COMPANIAS cc
                    INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                    WHERE cc.Fecha >= @fechaInicio AND cc.Fecha <= @fechaFin
                      AND (cc.LitrosDespachados > 0 OR cc.LitrosRecibidosCompania > 0)
                      AND (ISNULL(c.EsPrincipal, 0) = 1 OR cc.ControlRutaId IS NOT NULL)
                    UNION ALL
                    SELECT 
                        e.Fecha, 
                        e.Litros,
                        CASE 
                            WHEN e.ControlRutaId IS NOT NULL AND (
                                SELECT ISNULL(SUM(CASE WHEN ISNULL(ff.TipoServicioId, 1) = 2 THEN rr.Litros ELSE 0 END), 0)
                                FROM TB_RUTAS_RECOLECCION rr
                                INNER JOIN TB_FINCAS ff ON rr.FincaId = ff.Id
                                WHERE rr.ControlRutaId = e.ControlRutaId
                            ) = e.Litros
                            THEN 2
                            ELSE c.TipoServicioId
                        END AS TipoServicioEfectivo
                    FROM TB_ENTREGAS_COMPANIA e
                    INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                    WHERE e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin
                      AND e.Litros > 0
                      AND (ISNULL(c.EsPrincipal, 0) = 1 OR e.ControlRutaId IS NOT NULL)
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.Fecha >= @fechaInicio AND cc2.Fecha <= @fechaFin
                            AND cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE) AND cc2.UsuarioId = e.UsuarioId)
                            )
                      )
                )
                SELECT CONVERT(varchar(10), Fecha, 120) AS Fecha, ISNULL(SUM(Litros), 0) AS Litros
                FROM EntregasUnificadas
                WHERE TipoServicioEfectivo = 2
                GROUP BY Fecha
                ORDER BY Fecha";

            var rutas = (await connection.QueryAsync<ReporteDiarioRowDto>(sqlRutas, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
            var receptorias = (await connection.QueryAsync<ReporteDiarioRowDto>(sqlReceptorias, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
            var transpRutas = (await connection.QueryAsync<ReporteDiarioRowDto>(sqlTranspRutas, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
            var transpReceptorias = (await connection.QueryAsync<ReporteDiarioRowDto>(sqlTranspReceptorias, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();

            return new ReporteDiariosDto
            {
                DiarioRutas = rutas,
                TotalDiarioRutas = rutas.Sum(x => x.Litros),
                DiarioReceptorias = receptorias,
                TotalDiarioReceptorias = receptorias.Sum(x => x.Litros),
                DiarioTransporteRutas = transpRutas,
                TotalDiarioTransporteRutas = transpRutas.Sum(x => x.Litros),
                DiarioTransporteReceptorias = transpReceptorias,
                TotalDiarioTransporteReceptorias = transpReceptorias.Sum(x => x.Litros)
            };
        }

        public async Task<List<ReporteEntidadResumenDto>> ObtenerReporteReceptoriasAsync(DateTime fechaInicio, DateTime fechaFin, int? companiaId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            decimal tasaActual = await ObtenerTasaActualAsync(connection);

            var sqlCompanias = @"
                WITH EntregasUnificadas AS (
                    -- 1. Despachos y entregas directas desde TB_CONTROL_COMPANIAS (fuente principal con tipo de leche exacto)
                    SELECT 
                        cc.Id,
                        cc.CompaniaId,
                        cc.Fecha,
                        COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0) AS Litros,
                        ISNULL(cc.TipoLeche, 'VACA') AS TipoLeche,
                        cc.Observacion,
                        cc.UsuarioId
                    FROM TB_CONTROL_COMPANIAS cc
                    INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                    WHERE cc.Fecha >= @fechaInicio AND cc.Fecha <= @fechaFin
                      AND (cc.LitrosDespachados > 0 OR cc.LitrosRecibidosCompania > 0)
                    UNION ALL
                    -- 2. Entregas independientes de TB_ENTREGAS_COMPANIA no asociadas a un ControlCompaniaId ni a un viaje desglosado
                    SELECT 
                        e.Id,
                        e.CompaniaId,
                        e.Fecha,
                        e.Litros,
                        ISNULL(e.TipoLeche, 'VACA') AS TipoLeche,
                        e.Observacion,
                        e.UsuarioId
                    FROM TB_ENTREGAS_COMPANIA e
                    INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                    WHERE e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin
                      AND e.Litros > 0
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE) AND cc2.UsuarioId = e.UsuarioId)
                            )
                      )
                )
                SELECT DISTINCT 
                    c.Id, 
                    c.Nombre, 
                    c.Encargado AS Propietario, 
                    ISNULL(c.PrecioCompraLitroUSD, 0) AS PrecioLitroUSD,
                    ISNULL(c.PrecioBufalaLitroUSD, ISNULL(c.PrecioCompraLitroUSD, 0)) AS PrecioBufalaLitroUSD,
                    ISNULL(c.PrecioAcidaLitroUSD, 0) AS PrecioLitroAcidaUSD
                FROM TB_COMPANIAS c
                INNER JOIN EntregasUnificadas u ON c.Id = u.CompaniaId
                WHERE (@companiaId IS NULL OR c.Id = @companiaId)
                ORDER BY c.Nombre";

            var companias = (await connection.QueryAsync<dynamic>(sqlCompanias, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date, companiaId })).ToList();
            var resultado = new List<ReporteEntidadResumenDto>();

            var sqlDetalle = @"
                WITH EntregasUnificadas AS (
                    -- 1. Despachos y entregas directas desde TB_CONTROL_COMPANIAS (fuente principal con tipo de leche exacto)
                    SELECT 
                        cc.Id,
                        cc.CompaniaId,
                        cc.Fecha,
                        COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0) AS Litros,
                        ISNULL(cc.TipoLeche, 'VACA') AS TipoLeche,
                        cc.Observacion,
                        cc.UsuarioId
                    FROM TB_CONTROL_COMPANIAS cc
                    WHERE cc.Fecha >= @fechaInicio AND cc.Fecha <= @fechaFin
                      AND (cc.LitrosDespachados > 0 OR cc.LitrosRecibidosCompania > 0)
                    UNION ALL
                    -- 2. Entregas independientes de TB_ENTREGAS_COMPANIA no asociadas a un ControlCompaniaId ni a un viaje desglosado
                    SELECT 
                        e.Id,
                        e.CompaniaId,
                        e.Fecha,
                        e.Litros,
                        ISNULL(e.TipoLeche, 'VACA') AS TipoLeche,
                        e.Observacion,
                        e.UsuarioId
                    FROM TB_ENTREGAS_COMPANIA e
                    WHERE e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin
                      AND e.Litros > 0
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE) AND cc2.UsuarioId = e.UsuarioId)
                            )
                      )
                )
                SELECT 
                    CONVERT(varchar(10), u.Fecha, 120) AS Fecha,
                    u.Litros AS Litros,
                    ISNULL(u.TipoLeche, 'VACA') AS TipoLeche,
                    ISNULL(u.Observacion, '') AS Observacion,
                    ISNULL(usr.NombreCompleto, usr.Username) AS ChoferNombre,
                    c.Nombre AS EntidadNombre
                FROM EntregasUnificadas u
                INNER JOIN TB_COMPANIAS c ON u.CompaniaId = c.Id
                LEFT JOIN TB_USUARIOS usr ON u.UsuarioId = usr.Id
                WHERE u.CompaniaId = @id
                  AND u.Litros > 0
                  AND u.Fecha >= @fechaInicio AND u.Fecha <= @fechaFin
                ORDER BY u.Fecha, u.TipoLeche";

            foreach (var comp in companias)
            {
                int id = (int)comp.Id;
                string nombre = (string)comp.Nombre;
                string? prop = (string?)comp.Propietario;
                decimal precio = (decimal)comp.PrecioLitroUSD;
                decimal precioBufala = (decimal)comp.PrecioBufalaLitroUSD;
                decimal precioAcida = (decimal)comp.PrecioLitroAcidaUSD;

                var detalle = (await connection.QueryAsync<ReporteDetalleItemDto>(sqlDetalle, new { id, fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
                
                var detalleBufala = detalle.Where(d => (d.TipoLeche ?? "").ToUpper() == "BUFALA" || (d.Observacion ?? "").ToUpper().Contains("BUFAL")).ToList();
                var detalleVaca = detalle.Where(d => (d.TipoLeche ?? "VACA").ToUpper() != "BUFALA" && !(d.Observacion ?? "").ToUpper().Contains("BUFAL")).ToList();

                bool tieneDosTipos = detalleVaca.Any() && detalleBufala.Any();

                if (tieneDosTipos)
                {
                    // 1. TABLA / CARD DE VACA
                    int totalLitrosV = detalleVaca.Sum(d => d.Litros);
                    decimal totalUSDV = totalLitrosV * precio;
                    decimal totalBsV = totalUSDV * tasaActual;

                    resultado.Add(new ReporteEntidadResumenDto
                    {
                        Id = id,
                        Nombre = $"{nombre} (Vaca)",
                        Propietario = prop,
                        PrecioLitroUSD = precio,
                        PrecioBufalaLitroUSD = precioBufala,
                        PrecioLitroAcidaUSD = precioAcida,
                        TasaBcv = tasaActual,
                        Detalle = detalleVaca,
                        TotalLitros = totalLitrosV,
                        TotalLitrosVaca = totalLitrosV,
                        TotalLitrosBufala = 0,
                        TotalUSDVaca = totalUSDV,
                        TotalUSDBufala = 0,
                        TieneBufala = false,
                        TieneVaca = true,
                        TotalUSD = totalUSDV,
                        TotalBs = totalBsV
                    });

                    // 2. TABLA / CARD DE BÃšFALA
                    int totalLitrosB = detalleBufala.Sum(d => d.Litros);
                    decimal pB = precioBufala > 0 ? precioBufala : precio;
                    decimal totalUSDB = totalLitrosB * pB;
                    decimal totalBsB = totalUSDB * tasaActual;

                    resultado.Add(new ReporteEntidadResumenDto
                    {
                        Id = id,
                        Nombre = $"{nombre} (BÃºfala)",
                        Propietario = prop,
                        PrecioLitroUSD = pB,
                        PrecioBufalaLitroUSD = pB,
                        PrecioLitroAcidaUSD = precioAcida,
                        TasaBcv = tasaActual,
                        Detalle = detalleBufala,
                        TotalLitros = totalLitrosB,
                        TotalLitrosVaca = 0,
                        TotalLitrosBufala = totalLitrosB,
                        TotalUSDVaca = 0,
                        TotalUSDBufala = totalUSDB,
                        TieneBufala = true,
                        TieneVaca = false,
                        TotalUSD = totalUSDB,
                        TotalBs = totalBsB
                    });
                }
                else
                {
                    int totalLitros = detalle.Sum(d => d.Litros);
                    bool esSoloBufala = detalleBufala.Any() && !detalleVaca.Any();
                    decimal pAplicado = esSoloBufala ? (precioBufala > 0 ? precioBufala : precio) : precio;
                    decimal totalUSD = totalLitros * pAplicado;
                    decimal totalBs = totalUSD * tasaActual;

                    resultado.Add(new ReporteEntidadResumenDto
                    {
                        Id = id,
                        Nombre = esSoloBufala ? $"{nombre} (BÃºfala)" : nombre,
                        Propietario = prop,
                        PrecioLitroUSD = pAplicado,
                        PrecioBufalaLitroUSD = precioBufala,
                        PrecioLitroAcidaUSD = precioAcida,
                        TasaBcv = tasaActual,
                        Detalle = detalle,
                        TotalLitros = totalLitros,
                        TotalLitrosVaca = esSoloBufala ? 0 : totalLitros,
                        TotalLitrosBufala = esSoloBufala ? totalLitros : 0,
                        TotalUSDVaca = esSoloBufala ? 0 : totalUSD,
                        TotalUSDBufala = esSoloBufala ? totalUSD : 0,
                        TieneBufala = esSoloBufala,
                        TieneVaca = !esSoloBufala,
                        TotalUSD = totalUSD,
                        TotalBs = totalBs
                    });
                }
            }

            return resultado;
        }

        public async Task<List<ReporteEntidadResumenDto>> ObtenerReporteFincasAsync(DateTime fechaInicio, DateTime fechaFin, List<int>? fincaIds = null)
        {
            using var connection = new SqlConnection(_connectionString);
            decimal tasaActual = await ObtenerTasaActualAsync(connection);

            int cIdActivo = await connection.ExecuteScalarAsync<int?>(
                "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC") ?? 0;

            int? cicloIdFiltro = await connection.ExecuteScalarAsync<int?>(
                "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaInicio >= CAST(FechaInicio AS DATE) AND @fechaInicio <= CAST(FechaFin AS DATE)",
                new { fechaInicio = fechaInicio.Date });
            if (!cicloIdFiltro.HasValue || cicloIdFiltro.Value <= 0)
            {
                cicloIdFiltro = cIdActivo;
            }

            bool esRangoHistorico = (fechaFin.Date - fechaInicio.Date).TotalDays > 7;
            int targetCicloId = (!esRangoHistorico && cicloIdFiltro.HasValue && cicloIdFiltro.Value > 0) ? cicloIdFiltro.Value : (esRangoHistorico ? 0 : cIdActivo);

            var sqlFincas = @"
                SELECT DISTINCT f.Id, f.Nombre, f.Propietario, f.CedulaRIF, f.PrecioLitroUSD, ISNULL(f.PrecioLitroAcidaUSD, 0) AS PrecioLitroAcidaUSD,
                       ISNULL(f.TieneDosTiposLeche, 0) AS TieneDosTiposLeche, ISNULL(f.PrecioBufalaLitroUSD, 0) AS PrecioBufalaLitroUSD,
                       ISNULL(f.TipoServicioId, 1) AS TipoServicioId, ISNULL(ts.Nombre, 'RUTA') AS TipoServicioNombre
                FROM TB_FINCAS f
                LEFT JOIN TB_TIPO_SERVICIO ts ON f.TipoServicioId = ts.Id
                INNER JOIN TB_RUTAS_RECOLECCION r ON f.Id = r.FincaId
                WHERE f.Id != 68
                  AND (@tieneFincas = 0 OR f.Id IN @fincaIds)
                  AND CAST(r.Fecha AS DATE) >= @fechaInicio
                  AND CAST(r.Fecha AS DATE) <= @fechaFin
                ORDER BY f.Nombre";

            bool tieneFincas = fincaIds != null && fincaIds.Any();
            var fincas = (await connection.QueryAsync<dynamic>(sqlFincas, new { 
                targetCicloId,
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date, 
                tieneFincas = tieneFincas ? 1 : 0, 
                fincaIds = tieneFincas ? fincaIds : new List<int> { 0 } 
            })).ToList();

            if (tieneFincas && fincas.Count > 1)
            {
                var dictOrder = fincaIds!.Select((id, idx) => new { id, idx }).ToDictionary(x => x.id, x => x.idx);
                fincas = fincas.OrderBy(f => dictOrder.ContainsKey((int)f.Id) ? dictOrder[(int)f.Id] : 999).ToList();
            }

            var resultado = new List<ReporteEntidadResumenDto>();

            var sqlDetalle = @"
                SELECT 
                    r.FincaId,
                    CONVERT(varchar(10), r.Fecha, 120) AS Fecha,
                    r.Litros AS Litros,
                    r.EsAcida AS EsAcida,
                    ISNULL(r.TipoLeche, 'VACA') AS TipoLeche,
                    CASE 
                        WHEN r.EsAcida = 1 THEN ISNULL(f.PrecioLitroAcidaUSD, 0) 
                        WHEN ISNULL(r.TipoLeche, 'VACA') = 'BUFALA' AND (ISNULL(f.TieneDosTiposLeche, 0) = 1 OR ISNULL(f.PrecioBufalaLitroUSD, 0) > 0) THEN f.PrecioBufalaLitroUSD
                        WHEN r.PrecioLitroUSDAplicado IS NOT NULL AND r.PrecioLitroUSDAplicado > 0 THEN r.PrecioLitroUSDAplicado
                        ELSE f.PrecioLitroUSD 
                    END AS PrecioLitroUSDAplicado,
                    ISNULL(r.Observacion, '') AS Observacion,
                    ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                    f.Nombre AS EntidadNombre
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                LEFT JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                WHERE f.Id != 68
                  AND (@tieneFincas = 0 OR r.FincaId IN @fincaIds)
                  AND CAST(r.Fecha AS DATE) >= @fechaInicio
                  AND CAST(r.Fecha AS DATE) <= @fechaFin
                ORDER BY r.Fecha";

            var todosDetallesRaw = (await connection.QueryAsync<dynamic>(sqlDetalle, new { 
                targetCicloId, 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date, 
                tieneFincas = tieneFincas ? 1 : 0, 
                fincaIds = tieneFincas ? fincaIds : new List<int> { 0 } 
            })).ToList();

            var detallesPorFinca = todosDetallesRaw
                .Where(d => d.FincaId != null)
                .GroupBy(d => Convert.ToInt32(d.FincaId))
                .ToDictionary(g => g.Key, g => g.Select(d => new ReporteDetalleItemDto
                {
                    Fecha = d.Fecha != null ? Convert.ToString(d.Fecha)! : "",
                    Litros = d.Litros != null ? Convert.ToInt32(d.Litros) : 0,
                    EsAcida = d.EsAcida != null && Convert.ToBoolean(d.EsAcida),
                    TipoLeche = d.TipoLeche != null ? Convert.ToString(d.TipoLeche)! : "VACA",
                    PrecioLitroUSDAplicado = d.PrecioLitroUSDAplicado != null ? Convert.ToDecimal(d.PrecioLitroUSDAplicado) : 0m,
                    Observacion = d.Observacion != null ? Convert.ToString(d.Observacion) : "",
                    ChoferNombre = d.ChoferNombre != null ? Convert.ToString(d.ChoferNombre) : "",
                    EntidadNombre = d.EntidadNombre != null ? Convert.ToString(d.EntidadNombre) : ""
                }).ToList());

            var sqlPagosMap = @"
                SELECT FincaId, Id AS PagoId, FechaPago, TasaBcv, TotalBrutoBs, TotalAdelantosBs, TotalNetoBs
                FROM TB_PAGOS_LIQUIDACION
                WHERE EstadoPago = 'PAGADO' AND (@targetCicloId = 0 OR CicloId = @targetCicloId)";

            var pagosRaw = (await connection.QueryAsync<dynamic>(sqlPagosMap, new { targetCicloId })).ToList();
            var pagosMap = pagosRaw
                .Where(x => x.FincaId != null)
                .GroupBy(x => Convert.ToInt32(x.FincaId))
                .ToDictionary(g => g.Key, g => {
                    var items = g.ToList();
                    var ultimo = items.OrderByDescending(x => (DateTime?)x.FechaPago).FirstOrDefault();
                    decimal totalBruto = 0m;
                    decimal totalAdelantos = 0m;
                    decimal totalNeto = 0m;
                    foreach (var it in items)
                    {
                        if (it.TotalBrutoBs != null) totalBruto += Convert.ToDecimal(it.TotalBrutoBs);
                        if (it.TotalAdelantosBs != null) totalAdelantos += Convert.ToDecimal(it.TotalAdelantosBs);
                        if (it.TotalNetoBs != null) totalNeto += Convert.ToDecimal(it.TotalNetoBs);
                    }
                    return new { 
                        PagoId = ultimo != null && ultimo.PagoId != null ? Convert.ToInt32(ultimo.PagoId) : 0, 
                        FechaPago = ultimo != null ? (DateTime?)ultimo.FechaPago : null,
                        TasaBcv = ultimo != null && ultimo.TasaBcv != null ? (decimal?)Convert.ToDecimal(ultimo.TasaBcv) : null,
                        TotalBrutoBs = totalBruto,
                        TotalAdelantosBs = totalAdelantos,
                        TotalNetoBs = totalNeto
                    };
                });

            var sqlAdelantosFincas = @"
                SELECT 
                    a.EntidadId AS FincaId,
                    ISNULL(SUM(CASE WHEN c.Estado = 'COBRADO' AND ISNULL(c.MontoCobradoBs, 0) > 0 THEN c.MontoCobradoBs ELSE (c.MontoCuotaUSD * @tasaActual) END), 0) AS TotalAdelantosBs,
                    ISNULL(SUM(c.MontoCuotaUSD), 0) AS TotalAdelantosUSD,
                    MAX(CONCAT('Cuota ', c.NumeroCuota, ' de ', a.NumeroCuotas)) AS CuotasDetalle
                FROM TB_ADELANTOS a
                INNER JOIN TB_ADELANTOS_CUOTAS c ON a.Id = c.AdelantoId
                WHERE a.TipoEntidad = 'FINCA' 
                  AND c.Estado <> 'POSPUESTO'
                  AND c.Estado <> 'ANULADA'
                  AND (
                    (@targetCicloId > 0 AND c.SemanaOperativaId = @targetCicloId)
                    OR (
                        @targetCicloId <= 0 
                        AND EXISTS (
                            SELECT 1 FROM TB_CICLOS_OPERATIVOS co 
                            WHERE co.Id = c.SemanaOperativaId 
                              AND co.FechaInicio >= @fechaInicio AND co.FechaFin <= @fechaFin
                        )
                    )
                  )
                GROUP BY a.EntidadId";

            var adelantosRaw = (await connection.QueryAsync<dynamic>(sqlAdelantosFincas, new { 
                targetCicloId, 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date, 
                tasaActual 
            })).ToList();
            var adelantosFincasMap = adelantosRaw
                .Where(x => x.FincaId != null)
                .GroupBy(x => Convert.ToInt32(x.FincaId))
                .ToDictionary(
                    g => g.Key, 
                    g => {
                        var items = g.ToList();
                        decimal totalBs = 0m;
                        decimal totalUsd = 0m;
                        string? cuotasDet = null;
                        foreach (var it in items)
                        {
                            if (it.TotalAdelantosBs != null) totalBs += Convert.ToDecimal(it.TotalAdelantosBs);
                            if (it.TotalAdelantosUSD != null) totalUsd += Convert.ToDecimal(it.TotalAdelantosUSD);
                            if (cuotasDet == null && it.CuotasDetalle != null) cuotasDet = Convert.ToString(it.CuotasDetalle);
                        }
                        return new { 
                            TotalAdelantosBs = totalBs, 
                            TotalAdelantosUSD = totalUsd, 
                            CuotasDetalle = cuotasDet 
                        };
                    });

            foreach (var finca in fincas)
            {
                int id = Convert.ToInt32(finca.Id);
                string nombre = Convert.ToString(finca.Nombre) ?? "";
                string? prop = Convert.ToString(finca.Propietario);
                string? rif = Convert.ToString(finca.CedulaRIF);
                decimal precio = Convert.ToDecimal(finca.PrecioLitroUSD ?? 0m);
                decimal precioAcida = Convert.ToDecimal(finca.PrecioLitroAcidaUSD ?? 0m);
                bool tieneDosTipos = finca.TieneDosTiposLeche != null && Convert.ToBoolean(finca.TieneDosTiposLeche);
                decimal precioBufala = Convert.ToDecimal(finca.PrecioBufalaLitroUSD ?? 0m);

                var detalle = detallesPorFinca.ContainsKey(id) ? detallesPorFinca[id] : new List<ReporteDetalleItemDto>();

                bool esPagado = pagosMap.ContainsKey(id);
                int? pagoId = esPagado ? pagosMap[id].PagoId : null;
                DateTime? fechaPago = esPagado ? pagosMap[id].FechaPago : null;
                decimal tasaAplicada = (esPagado && pagosMap[id].TasaBcv.HasValue && pagosMap[id].TasaBcv.Value > 0)
                    ? pagosMap[id].TasaBcv.Value
                    : tasaActual;

                decimal adelantoUSD = adelantosFincasMap.ContainsKey(id) ? adelantosFincasMap[id].TotalAdelantosUSD : 0;
                decimal adelantoBs = (esPagado && pagosMap[id].TotalAdelantosBs > 0)
                    ? pagosMap[id].TotalAdelantosBs
                    : (adelantosFincasMap.ContainsKey(id) ? adelantosFincasMap[id].TotalAdelantosBs : (adelantoUSD * tasaAplicada));
                string? cuotasDet = adelantosFincasMap.ContainsKey(id) ? adelantosFincasMap[id].CuotasDetalle : null;

                if (tieneDosTipos)
                {
                    var detalleVaca = detalle.Where(d => (d.TipoLeche ?? "VACA").ToUpper() != "BUFALA").ToList();
                    var detalleBufala = detalle.Where(d => (d.TipoLeche ?? "VACA").ToUpper() == "BUFALA").ToList();

                    if (detalleVaca.Any() || !detalleBufala.Any())
                    {
                        int totalLitrosV = detalleVaca.Sum(d => d.Litros);
                        decimal totalUSDV = detalleVaca.Sum(d => d.Litros * d.PrecioLitroUSDAplicado);
                        decimal totalBsV = (esPagado && pagosMap[id].TotalBrutoBs > 0 && !detalleBufala.Any())
                            ? pagosMap[id].TotalBrutoBs
                            : (totalUSDV * tasaAplicada);

                        resultado.Add(new ReporteEntidadResumenDto
                        {
                            Id = id,
                            Nombre = $"{nombre} (Vaca)",
                            Propietario = prop,
                            CedulaRIF = rif,
                            TipoServicioId = finca.TipoServicioId != null ? Convert.ToInt32(finca.TipoServicioId) : 1,
                            TipoServicioNombre = finca.TipoServicioNombre != null ? Convert.ToString(finca.TipoServicioNombre)! : "RUTA",
                            PrecioLitroUSD = precio,
                            PrecioLitroAcidaUSD = precioAcida,
                            TasaBcv = tasaAplicada,
                            Detalle = detalleVaca,
                            TotalLitros = totalLitrosV,
                            TotalUSD = totalUSDV,
                            TotalBs = totalBsV,
                            TotalAdelantosUSD = adelantoUSD,
                            TotalAdelantosBs = adelantoBs,
                            CuotasDetalle = cuotasDet,
                            EsPagado = esPagado,
                            PagoId = pagoId,
                            FechaPago = fechaPago
                        });
                    }

                    if (detalleBufala.Any())
                    {
                        int totalLitrosB = detalleBufala.Sum(d => d.Litros);
                        decimal totalUSDB = detalleBufala.Sum(d => d.Litros * d.PrecioLitroUSDAplicado);
                        decimal totalBsB = totalUSDB * tasaAplicada;

                        resultado.Add(new ReporteEntidadResumenDto
                        {
                            Id = id,
                            Nombre = $"{nombre} (BÃºfala)",
                            Propietario = prop,
                            CedulaRIF = rif,
                            TipoServicioId = finca.TipoServicioId != null ? Convert.ToInt32(finca.TipoServicioId) : 1,
                            TipoServicioNombre = finca.TipoServicioNombre != null ? Convert.ToString(finca.TipoServicioNombre)! : "RUTA",
                            PrecioLitroUSD = precioBufala > 0 ? precioBufala : precio,
                            PrecioLitroAcidaUSD = precioAcida,
                            TasaBcv = tasaAplicada,
                            Detalle = detalleBufala,
                            TotalLitros = totalLitrosB,
                            TotalUSD = totalUSDB,
                            TotalBs = totalBsB,
                            TotalAdelantosUSD = 0,
                            TotalAdelantosBs = 0,
                            CuotasDetalle = null,
                            EsPagado = esPagado,
                            PagoId = pagoId,
                            FechaPago = fechaPago
                        });
                    }
                }
                else
                {
                    int totalLitros = detalle.Sum(d => d.Litros);
                    decimal totalUSD = detalle.Sum(d => d.Litros * d.PrecioLitroUSDAplicado);
                    decimal totalBs = (esPagado && pagosMap[id].TotalBrutoBs > 0)
                        ? pagosMap[id].TotalBrutoBs
                        : (totalUSD * tasaAplicada);

                    resultado.Add(new ReporteEntidadResumenDto
                    {
                        Id = id,
                        Nombre = nombre,
                        Propietario = prop,
                        CedulaRIF = rif,
                        TipoServicioId = finca.TipoServicioId != null ? Convert.ToInt32(finca.TipoServicioId) : 1,
                        TipoServicioNombre = finca.TipoServicioNombre != null ? Convert.ToString(finca.TipoServicioNombre)! : "RUTA",
                        PrecioLitroUSD = precio,
                        PrecioLitroAcidaUSD = precioAcida,
                        TasaBcv = tasaAplicada,
                        Detalle = detalle,
                        TotalLitros = totalLitros,
                        TotalUSD = totalUSD,
                        TotalBs = totalBs,
                        TotalAdelantosUSD = adelantoUSD,
                        TotalAdelantosBs = adelantoBs,
                        CuotasDetalle = cuotasDet,
                        EsPagado = esPagado,
                        PagoId = pagoId,
                        FechaPago = fechaPago
                    });
                }
            }

            return resultado;
        }

        public async Task<List<ReporteEntidadResumenDto>> ObtenerReporteChoferesAsync(DateTime fechaInicio, DateTime fechaFin, int? choferId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            decimal tasaActual = await ObtenerTasaActualAsync(connection);

            var sqlChoferes = @"
                SELECT DISTINCT u.Id, ISNULL(u.NombreCompleto, u.Username) AS Nombre, u.Username
                FROM TB_USUARIOS u
                WHERE (@choferId IS NULL OR u.Id = @choferId)
                  AND (
                    EXISTS (
                        SELECT 1 FROM TB_CONTROL_RUTAS cr
                        WHERE cr.UsuarioId = u.Id AND cr.Fecha >= @fechaInicio AND cr.Fecha <= @fechaFin
                    ) OR EXISTS (
                        SELECT 1 FROM TB_RUTAS_RECOLECCION r
                        WHERE r.UsuarioId = u.Id AND r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin
                    )
                  )
                ORDER BY Nombre";

            var choferes = (await connection.QueryAsync<dynamic>(sqlChoferes, new { fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date, choferId })).ToList();

            if (!choferes.Any() && choferId.HasValue)
            {
                var sqlChoferSingle = @"
                    SELECT u.Id, ISNULL(u.NombreCompleto, u.Username) AS Nombre, u.Username
                    FROM TB_USUARIOS u
                    WHERE u.Id = @choferId";
                choferes = (await connection.QueryAsync<dynamic>(sqlChoferSingle, new { choferId })).ToList();
            }

            var resultado = new List<ReporteEntidadResumenDto>();

            var sqlDetalleControl = @"
                SELECT 
                    CONVERT(varchar(10), cr.Fecha, 120) AS Fecha,
                    cr.Id AS TicketId,
                    (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0)) AS TotalLitrosFinca,
                    (CASE 
                        WHEN cr.TipoDestino IN ('COMPANIA_DIRECTA', 'DIRECTO', 'RECEPTORIA_Y_COMPANIA') THEN ISNULL(cr.LitrosEntregadosCompania, (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0)))
                        ELSE ISNULL(cr.TotalLitrosReceptoria, (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0)))
                     END) AS LitrosEntregados,
                    -- Balance Neto del Chofer: Entregado - (Finca + CargadoAdicional) (Negativo = Falta/PÃ©rdida, Positivo = Ganancia/Sobrante)
                    ((CASE 
                        WHEN cr.TipoDestino IN ('COMPANIA_DIRECTA', 'DIRECTO', 'RECEPTORIA_Y_COMPANIA') THEN ISNULL(cr.LitrosEntregadosCompania, (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0)))
                        ELSE ISNULL(cr.TotalLitrosReceptoria, (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0)))
                     END) - (ISNULL(cr.TotalLitrosFinca, 0) + ISNULL(cr.LitrosCargadosAdicional, 0))) AS Litros,
                    ISNULL(cr.MermaTotalLitros, ISNULL(cr.DiferenciaLitros, 0)) AS MermaLitros,
                    ISNULL(cr.PorcentajeMerma, 0) AS PorcentajeMerma,
                    cr.TipoDestino AS TipoDestino,
                    ISNULL(c.Nombre, 'RECEPTORIA') AS DestinoNombre,
                    COALESCE(
                        NULLIF(LTRIM(RTRIM(cr.Observacion)), ''),
                        'Ticket #' + CAST(cr.Id AS varchar(20)) + ' (' + 
                        CASE WHEN cr.TipoDestino IN ('COMPANIA_DIRECTA', 'DIRECTO', 'RECEPTORIA_Y_COMPANIA') THEN 'Directo Planta: ' + ISNULL(c.Nombre, 'CompaÃ±Ã­a') 
                             ELSE 'ReceptorÃ­a' END + ')'
                    ) AS Observacion,
                    ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                    'CONTROL DE VIAJES' AS EntidadNombre
                FROM TB_CONTROL_RUTAS cr
                LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cr.CompaniaDestinoId = c.Id
                WHERE cr.UsuarioId = @id
                  AND cr.Fecha >= @fechaInicio AND cr.Fecha <= @fechaFin
                  AND cr.ProcesoActualId >= 2
                ORDER BY cr.Fecha, cr.Id";

            foreach (var ch in choferes)
            {
                int id = (int)ch.Id;
                string nombre = (string)ch.Nombre;

                var detalle = (await connection.QueryAsync<ReporteDetalleItemDto>(sqlDetalleControl, new { id, fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
                if (!detalle.Any())
                {
                    var sqlFallbackDetalle = @"
                        SELECT 
                            CONVERT(varchar(10), r.Fecha, 120) AS Fecha,
                            NULL AS TicketId,
                            ISNULL(SUM(r.Litros), 0) AS TotalLitrosFinca,
                            ISNULL(SUM(r.Litros), 0) AS LitrosEntregados,
                            0 AS MermaLitros,
                            0 AS PorcentajeMerma,
                            ISNULL(SUM(r.Litros), 0) AS Litros,
                            'RUTA' AS TipoDestino,
                            'RUTA TRADICIONAL' AS DestinoNombre,
                            ISNULL(MAX(r.Observacion), '') AS Observacion,
                            ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                            'CHOFERES' AS EntidadNombre
                        FROM TB_RUTAS_RECOLECCION r
                        INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                        LEFT JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                        WHERE r.UsuarioId = @id
                          AND r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin
                          AND (r.FincaId = 68 OR f.Nombre LIKE '%CHOFER%')
                          AND r.Litros <> 0
                        GROUP BY CONVERT(varchar(10), r.Fecha, 120), u.NombreCompleto, u.Username
                        ORDER BY Fecha";
                    detalle = (await connection.QueryAsync<ReporteDetalleItemDto>(sqlFallbackDetalle, new { id, fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
                }

                if (!detalle.Any() && !choferId.HasValue)
                {
                    // Si no se filtrÃ³ por un chofer en especÃ­fico y este chofer no tiene registros de falta/ganancia, no lo incluimos
                    continue;
                }

                int totalBalanceLitros = detalle.Sum(d => d.Litros);
                int sumFinca = detalle.Sum(d => d.TotalLitrosFinca > 0 ? d.TotalLitrosFinca : Math.Abs(d.Litros));
                int sumEntregados = detalle.Sum(d => d.LitrosEntregados);
                int sumMerma = detalle.Sum(d => d.MermaLitros);
                decimal pctGlobal = sumFinca > 0 ? Math.Round(((decimal)Math.Abs(totalBalanceLitros) / (decimal)sumFinca) * 100m, 2) : 0m;

                resultado.Add(new ReporteEntidadResumenDto
                {
                    Id = id,
                    Nombre = nombre,
                    PrecioLitroUSD = 0,
                    TasaBcv = tasaActual,
                    Detalle = detalle,
                    TotalLitros = totalBalanceLitros,
                    TotalLitrosFinca = sumFinca,
                    TotalLitrosEntregados = sumEntregados,
                    TotalMermaLitros = totalBalanceLitros,
                    PorcentajeMermaGlobal = pctGlobal,
                    TotalUSD = 0,
                    TotalBs = 0
                });
            }

            return resultado;
        }

        public async Task<List<ReporteBancoFincaDto>> ObtenerReporteBancosFincasAsync(DateTime fechaInicio, DateTime fechaFin, int? bancoId = null, int? cicloId = null, decimal? tasaBcvManual = null)
        {
            using var connection = new SqlConnection(_connectionString);
            decimal tasaActual = tasaBcvManual ?? await ObtenerTasaActualAsync(connection);

            int cId = cicloId ?? 0;
            if (cId <= 0)
            {
                cId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaInicio >= FechaInicio AND @fechaInicio <= FechaFin", 
                    new { fechaInicio = fechaInicio.Date }) ?? 0;

                if (cId <= 0)
                {
                    cId = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC") ?? 0;
                }
            }

            var preliqList = (await _catalogosRepository.ObtenerPreLiquidacionSemanaAsync(cId)).ToList();

            var rows = preliqList
                .Where(p => !bancoId.HasValue || p.BancoId == bancoId)
                .Select(p => new ReporteBancoFincaDto
                {
                    FincaId = p.FincaId,
                    FincaNombre = p.FincaNombre,
                    Propietario = p.Propietario,
                    CedulaRIF = string.IsNullOrWhiteSpace(p.CedulaRIF) ? "N/A" : p.CedulaRIF,
                    BancoId = p.BancoId,
                    BancoNombre = string.IsNullOrWhiteSpace(p.BancoNombre) ? "SIN BANCO ASIGNADO" : p.BancoNombre,
                    NumeroCuenta = string.IsNullOrWhiteSpace(p.NumeroCuenta) ? "N/A" : p.NumeroCuenta,
                    PrecioLitroUSD = p.PrecioLitroUSD,
                    TotalLitros = p.TotalLitros,
                    TotalUSD = p.TotalUSD,
                    TotalAdelantosUSD = p.TotalAdelantosUSD,
                    TotalAdelantosBs = p.TotalAdelantosBs + p.OtrasDeduccionesBs,
                    TasaBcv = p.PaidTasaBcv ?? tasaActual,
                    TotalNetoBs = p.TotalNetoBs,
                    EsPagado = p.EsPagado,
                    PagoId = p.PagoId > 0 ? p.PagoId : null,
                    FechaPago = p.FechaPago
                })
                .OrderBy(r => r.BancoNombre)
                .ThenBy(r => r.FincaNombre)
                .ToList();

            return rows;
        }

        public async Task<List<ReporteRelacionCompaniaDto>> ObtenerReporteRelacionCompaniasAsync(DateTime fechaInicio, DateTime fechaFin, int? companiaId = null, int? cicloId = null, decimal? tasaBcvManual = null)
        {
            using var connection = new SqlConnection(_connectionString);
            decimal tasaActual = tasaBcvManual ?? await ObtenerTasaActualAsync(connection);

            int cId = cicloId ?? 0;
            if (cId <= 0)
            {
                cId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fechaInicio >= FechaInicio AND @fechaInicio <= FechaFin", 
                    new { fechaInicio = fechaInicio.Date }) ?? 0;

                if (cId <= 0)
                {
                    cId = await connection.ExecuteScalarAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY FechaInicio DESC, Id DESC") ?? 0;
                }
            }

            var sqlEntregas = @"
                WITH EntregasUnificadas AS (
                    -- 1. Control compaÃ±Ã­as (desglose exacto de litros y tipo de leche)
                    SELECT 
                        cc.Id,
                        cc.CompaniaId,
                        c.Nombre AS CompaniaNombre,
                        ISNULL(c.Encargado, '') AS Encargado,
                        c.Telefono,
                        c.PrecioCompraLitroUSD,
                        cc.Fecha,
                        COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0) AS Litros,
                        ISNULL(cc.TipoLeche, 'VACA') AS TipoLeche,
                        ISNULL(cc.Observacion, '') AS Observacion,
                        ISNULL(u.NombreCompleto, ISNULL(u.Username, ISNULL(uRuta.NombreCompleto, ISNULL(uRuta.Username, 'OTROS')))) AS ChoferNombre
                    FROM TB_CONTROL_COMPANIAS cc
                    INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                    LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                    LEFT JOIN TB_CONTROL_RUTAS cr ON cc.ControlRutaId = cr.Id
                    LEFT JOIN TB_USUARIOS uRuta ON cr.UsuarioId = uRuta.Id
                    WHERE cc.Fecha >= @fechaInicio AND cc.Fecha <= @fechaFin
                      AND UPPER(c.Nombre) NOT LIKE '%RECEPTORIA%'
                      AND UPPER(c.Nombre) NOT LIKE '%RECEPTORÃA%'
                      AND (cc.LitrosDespachados > 0 OR cc.LitrosRecibidosCompania > 0)
                      AND (@companiaId IS NULL OR cc.CompaniaId = @companiaId)

                    UNION ALL

                    -- 2. Entregas independientes en TB_ENTREGAS_COMPANIA no asociadas a un ControlCompaniaId ni a un viaje desglosado
                    SELECT 
                        e.Id,
                        e.CompaniaId,
                        c.Nombre AS CompaniaNombre,
                        ISNULL(c.Encargado, '') AS Encargado,
                        c.Telefono,
                        c.PrecioCompraLitroUSD,
                        e.Fecha,
                        e.Litros,
                        ISNULL(e.TipoLeche, 'VACA') AS TipoLeche,
                        ISNULL(e.Observacion, '') AS Observacion,
                        ISNULL(u.NombreCompleto, ISNULL(u.Username, ISNULL(uRuta.NombreCompleto, ISNULL(uRuta.Username, 'OTROS')))) AS ChoferNombre
                    FROM TB_ENTREGAS_COMPANIA e
                    INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                    LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                    LEFT JOIN TB_CONTROL_RUTAS cr ON e.ControlRutaId = cr.Id
                    LEFT JOIN TB_USUARIOS uRuta ON cr.UsuarioId = uRuta.Id
                    WHERE e.Fecha >= @fechaInicio AND e.Fecha <= @fechaFin
                      AND e.Litros > 0
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND UPPER(c.Nombre) NOT LIKE '%RECEPTORIA%'
                      AND UPPER(c.Nombre) NOT LIKE '%RECEPTORÃA%'
                      AND (@companiaId IS NULL OR e.CompaniaId = @companiaId)
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE) AND cc2.UsuarioId = e.UsuarioId)
                            )
                      )
                )
                SELECT * FROM EntregasUnificadas
                ORDER BY CompaniaNombre, Fecha, Id";

            var entregas = (await connection.QueryAsync<dynamic>(sqlEntregas, new { 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date, 
                companiaId 
            })).ToList();

            var companiasIds = entregas.Select(x => (int)x.CompaniaId).Distinct().ToList();
            if (companiaId.HasValue && !companiasIds.Contains(companiaId.Value))
            {
                companiasIds.Add(companiaId.Value);
            }

            var sqlCompanias = @"
                SELECT c.Id, c.Nombre, ISNULL(c.Encargado, '') AS Encargado, c.Telefono, 
                       ISNULL(c.PrecioCompraLitroUSD, 0) AS PrecioCompraLitroUSD,
                       ISNULL(c.PrecioBufalaLitroUSD, c.PrecioCompraLitroUSD) AS PrecioBufalaLitroUSD,
                       ISNULL(c.PrecioAcidaLitroUSD, 0) AS PrecioAcidaLitroUSD,
                       ISNULL(c.DiaAperturaSemana, 'Martes') AS DiaAperturaSemana,
                       ISNULL(c.DiaCierreSemana, 'Lunes') AS DiaCierreSemana,
                       ISNULL(c.TipoServicioId, 1) AS TipoServicioId, ISNULL(ts.Nombre, 'RUTA') AS TipoServicioNombre
                FROM TB_COMPANIAS c
                LEFT JOIN TB_TIPO_SERVICIO ts ON c.TipoServicioId = ts.Id
                WHERE (c.Id IN @companiasIds OR (@companiaId IS NOT NULL AND c.Id = @companiaId))
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORIA%'
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORÃA%'
                  AND c.IsDeleted = 0";

            var companias = companiasIds.Any()
                ? (await connection.QueryAsync<dynamic>(sqlCompanias, new { companiasIds, companiaId })).ToList()
                : new List<dynamic>();

            var sqlAbonos = @"
                SELECT 
                    a.EntidadId AS CompaniaId,
                    ISNULL(SUM(CASE WHEN c.MontoCobradoUSD > 0 THEN c.MontoCobradoUSD ELSE c.MontoCuotaUSD END), 0) AS TotalAbonosUSD,
                    ISNULL(SUM(c.MontoCobradoBs), 0) AS TotalAbonosBs
                FROM TB_ADELANTOS a
                INNER JOIN TB_ADELANTOS_CUOTAS c ON a.Id = c.AdelantoId
                WHERE a.TipoEntidad IN ('COMPANIA', 'RECEPTORIA')
                  AND (
                    (@cId > 0 AND c.SemanaOperativaId = @cId)
                    OR (@cId <= 0 AND (c.CreatedAt >= @fechaInicio AND c.CreatedAt <= @fechaFin))
                  )
                  AND c.Estado != 'ANULADA'
                GROUP BY a.EntidadId";

            var abonos = (await connection.QueryAsync<dynamic>(sqlAbonos, new { cId, fechaInicio = fechaInicio.Date, fechaFin = fechaFin.Date })).ToList();
            var abonosMap = abonos.ToDictionary(x => (int)x.CompaniaId, x => new { 
                USD = (decimal)x.TotalAbonosUSD, 
                Bs = (decimal)x.TotalAbonosBs 
            });

            var entregasGrouped = entregas.GroupBy(x => (int)x.CompaniaId).ToDictionary(g => g.Key, g => g.ToList());

            var resultado = new List<ReporteRelacionCompaniaDto>();

            foreach (var comp in companias)
            {
                int cIdComp = (int)comp.Id;
                string cNom = (string)comp.Nombre;
                string enc = (string)comp.Encargado;
                string? tel = (string?)comp.Telefono;
                decimal precioVaca = (decimal)comp.PrecioCompraLitroUSD;
                decimal precioBufala = comp.PrecioBufalaLitroUSD != null ? (decimal)comp.PrecioBufalaLitroUSD : precioVaca;
                decimal precioAcida = comp.PrecioAcidaLitroUSD != null ? (decimal)comp.PrecioAcidaLitroUSD : 0m;
                string diaApertura = comp.DiaAperturaSemana != null ? (string)comp.DiaAperturaSemana : "Martes";
                string diaCierre = comp.DiaCierreSemana != null ? (string)comp.DiaCierreSemana : "Lunes";
                int tipoServId = comp.TipoServicioId != null ? (int)comp.TipoServicioId : 1;
                string tipoServNom = comp.TipoServicioNombre != null ? (string)comp.TipoServicioNombre : "RUTA";

                var det = entregasGrouped.ContainsKey(cIdComp) ? entregasGrouped[cIdComp] : new List<dynamic>();
                int totLitros = 0;
                decimal totUSD = 0;

                var detalleList = new List<EntregaItemDto>();
                foreach (var d in det)
                {
                    int dLitros = (int)d.Litros;
                    string dTipo = ((string)(d.TipoLeche ?? "VACA")).ToUpper();
                    string dObs = ((string)(d.Observacion ?? "")).ToUpper();

                    decimal dPrecio = precioVaca;
                    if (dTipo.Contains("BUFAL"))
                    {
                        dPrecio = precioBufala;
                    }
                    else if (dTipo.Contains("ACID") || dTipo.Contains("ÃCID") || dTipo.Contains("MALA") || (dTipo != "VACA" && (dObs.Contains("[ACIDA]") || dObs.Contains("[LECHE ÃCIDA]"))))
                    {
                        dPrecio = precioAcida;
                    }

                    totLitros += dLitros;
                    totUSD += (dLitros * dPrecio);

                    detalleList.Add(new EntregaItemDto
                    {
                        Id = (int)d.Id,
                        CompaniaId = cIdComp,
                        CompaniaNombre = cNom,
                        Fecha = (DateTime)d.Fecha,
                        Litros = dLitros,
                        TipoLeche = (string)(d.TipoLeche ?? "VACA"),
                        PrecioVentaUSD = dPrecio,
                        SubtotalUSD = Math.Round(dLitros * dPrecio, 2),
                        Observacion = (string)d.Observacion,
                        ConductorNombre = (string)d.ChoferNombre,
                        ChoferNombre = (string)d.ChoferNombre
                    });
                }
                totUSD = Math.Round(totUSD, 2);

                decimal abonoUSD = 0;
                decimal abonoBs = 0;
                if (abonosMap.TryGetValue(cIdComp, out var abonoData))
                {
                    abonoUSD = abonoData.USD;
                    abonoBs = abonoData.Bs;
                }

                decimal totBrutoBs = Math.Round(totUSD * tasaActual, 2);
                decimal deduccionesTotalBs = abonoBs + (abonoUSD * tasaActual);
                decimal totNetoBs = Math.Round(totBrutoBs - deduccionesTotalBs, 2);
                decimal totNetoUSD = tasaActual > 0 ? Math.Round(totNetoBs / tasaActual, 2) : totUSD - abonoUSD;

                resultado.Add(new ReporteRelacionCompaniaDto
                {
                    CompaniaId = cIdComp,
                    CompaniaNombre = cNom,
                    Encargado = enc,
                    Telefono = tel,
                    CedulaRIF = "N/A",
                    BancoNombre = "N/A",
                    NumeroCuenta = "N/A",
                    PrecioLitroUSD = precioVaca,
                    PrecioBufalaLitroUSD = precioBufala,
                    PrecioAcidaLitroUSD = precioAcida,
                    DiaAperturaSemana = diaApertura,
                    DiaCierreSemana = diaCierre,
                    TipoServicioId = tipoServId,
                    TipoServicioNombre = tipoServNom,
                    TotalLitros = totLitros,
                    TotalUSD = totUSD,
                    TotalAbonosUSD = abonoUSD,
                    TotalAbonosBs = abonoBs,
                    TasaBcv = tasaActual,
                    TotalBrutoBs = totBrutoBs,
                    TotalNetoBs = totNetoBs,
                    TotalNetoUSD = totNetoUSD,
                    EsPagado = false,
                    PagoId = null,
                    FechaPago = null,
                    EntregasDetalle = detalleList
                });
            }

            return resultado.OrderBy(r => r.CompaniaNombre).ToList();
        }

        public async Task<List<ReporteRelacionChoferDto>> ObtenerReporteRelacionChoferesAsync(DateTime fechaInicio, DateTime fechaFin)
        {
            using var connection = new SqlConnection(_connectionString);

            var sql = @"
                SELECT 
                    c.UsuarioId,
                    ISNULL(u.NombreCompleto, u.Username) AS Chofer,
                    SUM(c.TotalLitrosFinca) AS LitrosRuta,
                    SUM(c.TotalLitrosReceptoria + ISNULL(c.LitrosEntregadosCompania, 0)) AS LitrosQuesera
                FROM TB_CONTROL_RUTAS c
                LEFT JOIN TB_USUARIOS u ON c.UsuarioId = u.Id
                WHERE CAST(c.Fecha AS DATE) >= @fechaInicio AND CAST(c.Fecha AS DATE) <= @fechaFin
                GROUP BY c.UsuarioId, u.NombreCompleto, u.Username
                ORDER BY Chofer";

            var rows = (await connection.QueryAsync<ReporteRelacionChoferDto>(sql, new { 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date 
            })).ToList();

            if (!rows.Any())
            {
                var sqlFallback = @"
                    WITH RutasPorChofer AS (
                        SELECT 
                            r.UsuarioId,
                            ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                            SUM(r.Litros) AS LitrosRuta
                        FROM TB_RUTAS_RECOLECCION r
                        LEFT JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                        WHERE CAST(r.Fecha AS DATE) >= @fechaInicio AND CAST(r.Fecha AS DATE) <= @fechaFin
                        GROUP BY r.UsuarioId, u.NombreCompleto, u.Username
                    ),
                    EntregasPorChofer AS (
                        SELECT 
                            e.UsuarioId,
                            ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                            SUM(e.Litros) AS LitrosQuesera
                        FROM TB_ENTREGAS_COMPANIA e
                        LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                        WHERE CAST(e.Fecha AS DATE) >= @fechaInicio AND CAST(e.Fecha AS DATE) <= @fechaFin
                          AND e.Litros > 0
                        GROUP BY e.UsuarioId, u.NombreCompleto, u.Username
                    )
                    SELECT 
                        COALESCE(r.UsuarioId, e.UsuarioId, 0) AS UsuarioId,
                        COALESCE(r.ChoferNombre, e.ChoferNombre, 'OTROS') AS Chofer,
                        ISNULL(r.LitrosRuta, 0) AS LitrosRuta,
                        ISNULL(e.LitrosQuesera, 0) AS LitrosQuesera
                    FROM RutasPorChofer r
                    FULL OUTER JOIN EntregasPorChofer e ON r.UsuarioId = e.UsuarioId
                    ORDER BY Chofer";

                rows = (await connection.QueryAsync<ReporteRelacionChoferDto>(sqlFallback, new { 
                    fechaInicio = fechaInicio.Date, 
                    fechaFin = fechaFin.Date 
                })).ToList();
            }

            // Consultar detalle completo de fincas recogidas por fecha, chofer y observaciones
            var sqlDetalleFincas = @"
                SELECT 
                    r.Id,
                    r.Fecha,
                    r.UsuarioId,
                    r.FincaId,
                    ISNULL(f.Nombre, 'FINCA ' + CAST(r.FincaId AS varchar(10))) AS FincaNombre,
                    ISNULL(f.Propietario, '') AS Propietario,
                    ISNULL(r.Litros, 0) AS Litros,
                    ISNULL(r.TipoLeche, 'VACA') AS TipoLeche,
                    ISNULL(r.Observacion, '') AS Observacion,
                    ISNULL(r.ControlRutaId, 0) AS TicketControlId
                FROM TB_RUTAS_RECOLECCION r
                LEFT JOIN TB_FINCAS f ON r.FincaId = f.Id
                WHERE CAST(r.Fecha AS DATE) >= @fechaInicio AND CAST(r.Fecha AS DATE) <= @fechaFin
                  AND r.Litros > 0
                ORDER BY r.Fecha DESC, r.Id DESC";

            var detalleFincas = (await connection.QueryAsync<ReporteRelacionChoferDetalleDto>(sqlDetalleFincas, new { 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date 
            })).ToList();

            var sqlDetalleDiario = @"
                SELECT 
                    c.UsuarioId,
                    CONVERT(varchar(10), c.Fecha, 120) AS Fecha,
                    c.Id AS TicketId,
                    ISNULL(c.TotalLitrosFinca, 0) AS LitrosRuta,
                    ISNULL(CASE WHEN c.TipoDestino IN ('COMPANIA_DIRECTA', 'DIRECTO', 'RECEPTORIA_Y_COMPANIA') 
                                THEN ISNULL(c.LitrosEntregadosCompania, c.TotalLitrosReceptoria) 
                                ELSE c.TotalLitrosReceptoria END, 0) AS LitrosQuesera,
                    ISNULL(c.Observacion, '') AS Observacion,
                    ISNULL(c.TipoDestino, 'RECEPTORIA') AS Destino
                FROM TB_CONTROL_RUTAS c
                WHERE CAST(c.Fecha AS DATE) >= @fechaInicio AND CAST(c.Fecha AS DATE) <= @fechaFin
                ORDER BY c.Fecha DESC, c.Id DESC";

            var detalleDiario = (await connection.QueryAsync<ReporteRelacionChoferDiarioDto>(sqlDetalleDiario, new { 
                fechaInicio = fechaInicio.Date, 
                fechaFin = fechaFin.Date 
            })).ToList();

            foreach (var ch in rows)
            {
                ch.DetalleFincas = detalleFincas.Where(d => d.UsuarioId == ch.UsuarioId).ToList();
                ch.DetalleDiario = detalleDiario.Where(d => d.UsuarioId == ch.UsuarioId).ToList();
            }

            return rows;
        }

        public async Task<DashboardAvanzadoDto> ObtenerDashboardAvanzadoAsync(int semanas = 8, int? usuarioId = null)
        {
            if (semanas <= 0) semanas = 8;
            using var connection = new SqlConnection(_connectionString);
            var res = new DashboardAvanzadoDto();

            // 1. Tendencia N Semanas (Solo semanas abiertas o con datos operativos reales, ordenadas cronolÃ³gicamente ASC)
            var sqlSemanas = @"
                WITH UltimosCiclos AS (
                    SELECT TOP (@semanas) c.Id AS CicloId, c.Codigo AS Semana
                    FROM TB_CICLOS_OPERATIVOS c
                    WHERE (c.Estado = 'ABIERTO'
                           OR EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION r WHERE r.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_RUTAS cr WHERE cr.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc WHERE cc.CicloId = c.Id))
                    ORDER BY c.Id DESC
                )
                SELECT uc.CicloId, uc.Semana,
                    ISNULL((
                        SELECT SUM(r.Litros) 
                        FROM TB_RUTAS_RECOLECCION r 
                        WHERE r.CicloId = uc.CicloId
                          AND (@usuarioId IS NULL OR r.UsuarioId = @usuarioId)
                    ), 0) AS Recolectado,
                    ISNULL((
                        SELECT SUM(
                            CASE 
                                WHEN cr.TipoDestino = 'COMPANIA_DIRECTA' THEN ISNULL(NULLIF(cr.LitrosEntregadosCompania, 0), cr.TotalLitrosFinca)
                                ELSE ISNULL(NULLIF(cr.LitrosRecibidosReceptoria, 0), ISNULL(NULLIF(cr.TotalLitrosReceptoria, 0), cr.TotalLitrosFinca))
                            END
                        ) 
                        FROM TB_CONTROL_RUTAS cr 
                        WHERE cr.CicloId = uc.CicloId
                          AND (cr.ProcesoActualId = 4 OR UPPER(ISNULL(cr.Estado, '')) IN ('FINALIZADO', 'CUADRADO', 'CERRADO'))
                          AND (@usuarioId IS NULL OR cr.UsuarioId = @usuarioId)
                    ), 0) AS Entregado
                FROM UltimosCiclos uc
                ORDER BY uc.CicloId ASC";
            res.TendenciaSemanas = (await connection.QueryAsync<TendenciaSemanaItemDto>(sqlSemanas, new { semanas, usuarioId })).ToList();

            // 2. DesempeÃ±o Conductores (en las N semanas)
            var sqlChoferes = @"
                WITH UltimosCiclos AS (
                    SELECT DISTINCT TOP (@semanas) c.Id AS CicloId
                    FROM TB_CICLOS_OPERATIVOS c
                    WHERE (c.Estado IN ('ABIERTO', 'CERRADO') 
                           OR EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION r WHERE r.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_RUTAS cr WHERE cr.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc WHERE cc.CicloId = c.Id))
                    ORDER BY c.Id DESC
                )
                SELECT TOP 10 u.NombreCompleto AS Conductor,
                    SUM(cr.TotalLitrosFinca) AS Litros,
                    COUNT(cr.Id) AS Viajes,
                    ISNULL((
                        SELECT COUNT(DISTINCT r.FincaId)
                        FROM TB_RUTAS_RECOLECCION r
                        WHERE r.UsuarioId = u.Id
                          AND r.CicloId IN (SELECT CicloId FROM UltimosCiclos)
                    ), 0) AS Fincas
                FROM TB_CONTROL_RUTAS cr
                INNER JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                WHERE cr.CicloId IN (SELECT CicloId FROM UltimosCiclos)
                  AND (@usuarioId IS NULL OR cr.UsuarioId = @usuarioId)
                GROUP BY u.NombreCompleto, u.Id
                ORDER BY Litros DESC";
            res.DesempenoConductores = (await connection.QueryAsync<DesempenoConductorItemDto>(sqlChoferes, new { semanas, usuarioId })).ToList();

            // 3. Leche Ãcida por Finca
            var sqlAcida = @"
                SELECT TOP 10 f.Nombre AS Finca,
                    SUM(r.Litros) AS LitrosAcidos
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                WHERE r.EsAcida = 1
                  AND r.CicloId IN (
                      SELECT TOP (@semanas) c.Id 
                      FROM TB_CICLOS_OPERATIVOS c 
                      WHERE (c.Estado IN ('ABIERTO', 'CERRADO') 
                             OR EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION r0 WHERE r0.CicloId = c.Id)
                             OR EXISTS (SELECT 1 FROM TB_CONTROL_RUTAS cr0 WHERE cr0.CicloId = c.Id)
                             OR EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.CicloId = c.Id))
                      ORDER BY c.Id DESC
                  )
                  AND (@usuarioId IS NULL OR r.UsuarioId = @usuarioId)
                GROUP BY f.Nombre, f.Id
                ORDER BY LitrosAcidos DESC";
            res.LecheAcidaFincas = (await connection.QueryAsync<LecheAcidaFincaItemDto>(sqlAcida, new { semanas, usuarioId })).ToList();

            // 4. Entregas y Salidas a CompaÃ±Ã­as / Queseras (en las N semanas)
            var sqlPlantas = @"
                WITH UltimosCiclos AS (
                    SELECT DISTINCT TOP (@semanas) c.Id AS CicloId
                    FROM TB_CICLOS_OPERATIVOS c
                    WHERE (c.Estado IN ('ABIERTO', 'CERRADO') 
                           OR EXISTS (SELECT 1 FROM TB_RUTAS_RECOLECCION r WHERE r.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_RUTAS cr WHERE cr.CicloId = c.Id)
                           OR EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc WHERE cc.CicloId = c.Id))
                    ORDER BY c.Id DESC
                ),
                SalidasCombined AS (
                    SELECT cc.CompaniaId, ISNULL(cc.LitrosRecibidosCompania, cc.LitrosDespachados) AS Litros, cc.CicloId, cc.UsuarioId
                    FROM TB_CONTROL_COMPANIAS cc
                    UNION ALL
                    SELECT e.CompaniaId, e.Litros, e.CicloId, e.UsuarioId
                    FROM TB_ENTREGAS_COMPANIA e
                    WHERE e.Litros > 0
                      AND (e.ControlCompaniaId IS NULL OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc0 WHERE cc0.Id = e.ControlCompaniaId))
                      AND NOT EXISTS (
                          SELECT 1 FROM TB_CONTROL_COMPANIAS cc2 
                          WHERE cc2.CompaniaId = e.CompaniaId
                            AND (
                                (e.ControlCompaniaId IS NOT NULL AND cc2.Id = e.ControlCompaniaId)
                                OR (e.ControlRutaId IS NOT NULL AND cc2.ControlRutaId IS NOT NULL AND e.ControlRutaId = cc2.ControlRutaId)
                                OR e.Observacion LIKE '%#' + CAST(cc2.Id AS VARCHAR) + '%'
                                OR (cc2.CicloId = e.CicloId AND (cc2.UsuarioId = e.UsuarioId OR CAST(cc2.Fecha AS DATE) = CAST(e.Fecha AS DATE)))
                            )
                      )
                )
                SELECT TOP 10 cp.Nombre AS Planta,
                    SUM(sc.Litros) AS Litros
                FROM SalidasCombined sc
                INNER JOIN TB_COMPANIAS cp ON sc.CompaniaId = cp.Id
                WHERE ISNULL(cp.EsPrincipal, 0) = 0
                WHERE sc.CicloId IN (SELECT CicloId FROM UltimosCiclos)
                  AND ISNULL(cp.EsPrincipal, 0) = 0
                  AND UPPER(ISNULL(cp.Nombre, '')) NOT LIKE '%RECEPTORIA%'
                  AND UPPER(ISNULL(cp.Nombre, '')) NOT LIKE '%RECEPTORÃA%'
                  AND UPPER(ISNULL(cp.Nombre, '')) NOT LIKE '%PLANTA PRINCIPAL%'
                  AND (@usuarioId IS NULL OR sc.UsuarioId = @usuarioId)
                GROUP BY cp.Nombre, cp.Id
                ORDER BY Litros DESC";
            var plantasList = (await connection.QueryAsync<EntregaPlantaItemDto>(sqlPlantas, new { semanas, usuarioId })).ToList();

            decimal totalPl = plantasList.Sum(x => x.Litros);
            if (totalPl > 0)
            {
                plantasList.ForEach(p => p.Porcentaje = Math.Round((p.Litros / totalPl) * 100, 2));
            }
            res.EntregasPlantas = plantasList;

            // 5. Adelantos Riesgo Financiero (Exclusivo para ADMIN, Chofer nunca ve adelantos)
            if (!usuarioId.HasValue)
            {
                var sqlAdelantos = @"
                    SELECT TOP 10 f.Nombre AS Beneficiario,
                        a.MontoPendienteUSD,
                        a.MontoTotalUSD
                    FROM TB_ADELANTOS a
                    INNER JOIN TB_FINCAS f ON a.EntidadId = f.Id
                    WHERE a.Estado = 'ACTIVO' AND a.MontoPendienteUSD > 0
                    ORDER BY a.MontoPendienteUSD DESC";
                res.AdelantosRiesgo = (await connection.QueryAsync<AdelantoRiesgoItemDto>(sqlAdelantos)).ToList();
            }
            else
            {
                res.AdelantosRiesgo = new List<AdelantoRiesgoItemDto>();
            }

            return res;
        }
    }

    // =========================================================================
    // REPOSITORIO DE ADELANTOS Y CUOTAS POR CICLOS OPERATIVOS
    // =========================================================================

}

