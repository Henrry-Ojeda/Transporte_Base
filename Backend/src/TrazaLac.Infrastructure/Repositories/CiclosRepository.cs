using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using TrazaLac.Core.DTOs;
using TrazaLac.Core.Entities;

namespace TrazaLac.Infrastructure.Repositories
{
    public interface ICiclosRepository
    {
        Task<IEnumerable<SemanaDetalleDto>> ObtenerSemanasAsync();
        Task<SemanaDetalleDto?> ObtenerCicloActivoAsync();
        Task<int> CrearSemanaAsync(CrearCicloDto dto);
        Task<bool> EditarSemanaAsync(int id, EditarCicloDto dto);
        Task<int> Generar52SemanasAsync(Generar52SemanasDto dto);
        Task<int> Completar52SemanasAsync(int? anio = null);
        Task<bool> ActivarSemanaAsync(int id, decimal? stockInicialPersonalizado = null);
        Task<bool> CerrarSemanaAsync(int id, decimal? stockFinalTanques = null);
        Task<decimal> ObtenerBalanceTanqueCicloAsync(int cicloId);
        Task<ResumenCierreCicloDto> ObtenerResumenCierreAsync(int cicloId);
        Task<ValidacionActivacionCicloDto> ValidarActivacionCicloAsync(int cicloId);
        Task<bool> ReabrirSemanaAsync(int id, string motivo, int usuarioId, string usuarioNombre);
        Task<bool> ActualizarStockInicialAsync(int cicloId, decimal stockInicial);
    }

    public class CiclosRepository : ICiclosRepository
    {
        private readonly string _connectionString;
        public CiclosRepository(IConfiguration configuration, TrazaLac.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        
        public async Task<SemanaDetalleDto?> ObtenerCicloActivoAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT TOP 1 
                    c.Id,
                    CASE 
                        WHEN c.Codigo IS NULL OR c.Codigo = '' OR c.Codigo LIKE '%(%)%' OR c.Codigo LIKE '%# ()%' OR c.Codigo LIKE '%()%'
                        THEN 'Semana ' + CAST(DATEPART(isowk, c.FechaInicio) AS varchar) + ' (' + CAST(YEAR(c.FechaInicio) AS varchar) + ')'
                        ELSE c.Codigo 
                    END AS Codigo,
                    c.FechaInicio,
                    c.FechaFin,
                    c.Estado,
                    DATEPART(isowk, c.FechaInicio) AS NumeroSemana,
                    YEAR(c.FechaInicio) AS Anio,
                    ISNULL(SUM(r.Litros), 0) AS TotalLitros,
                    ISNULL(SUM(r.Litros * ISNULL(r.PrecioLitroUSDAplicado, 0)), 0) AS TotalMontoUSD,
                    ISNULL(SUM(r.Litros * ISNULL(r.PrecioLitroUSDAplicado, 0) * ISNULL(r.TasaDolarBsAplicada, 0)), 0) AS TotalBrutoBs,
                    COUNT(DISTINCT r.FincaId) AS TotalFincasParticipantes,
                    0 AS TotalCompaniasParticipantes,
                    c.Observaciones AS Observaciones,
                    ISNULL(c.StockInicialTanques, 0) AS StockInicialTanques,
                    c.StockFinalTanques AS StockFinalTanques
                FROM TB_CICLOS_OPERATIVOS c
                LEFT JOIN TB_RUTAS_RECOLECCION r ON c.Id = r.CicloId
                WHERE c.Estado = 'ABIERTO'
                GROUP BY c.Id, c.Codigo, c.FechaInicio, c.FechaFin, c.Estado, c.Observaciones, c.StockInicialTanques, c.StockFinalTanques
                ORDER BY c.FechaInicio DESC, c.Id DESC";

            return await connection.QueryFirstOrDefaultAsync<SemanaDetalleDto>(sql);
        }

        public async Task<IEnumerable<SemanaDetalleDto>> ObtenerSemanasAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                WITH RecoleccionesPorCiclo AS (
                    SELECT 
                        CicloId,
                        SUM(Litros) AS TotalLitros,
                        SUM(Litros * ISNULL(PrecioLitroUSDAplicado, 0)) AS TotalMontoUSD,
                        SUM(Litros * ISNULL(PrecioLitroUSDAplicado, 0) * ISNULL(TasaDolarBsAplicada, 0)) AS TotalBrutoBs,
                        COUNT(DISTINCT FincaId) AS TotalFincasParticipantes
                    FROM TB_RUTAS_RECOLECCION
                    WHERE CicloId IS NOT NULL
                    GROUP BY CicloId
                )
                SELECT 
                    c.Id,
                    CASE 
                        WHEN c.Codigo IS NULL OR c.Codigo = '' OR c.Codigo LIKE '%(%)%' OR c.Codigo LIKE '%# ()%' OR c.Codigo LIKE '%()%'
                        THEN 'Semana ' + CAST(DATEPART(isowk, c.FechaInicio) AS varchar) + ' (' + CAST(YEAR(c.FechaInicio) AS varchar) + ')'
                        ELSE c.Codigo 
                    END AS Codigo,
                    c.FechaInicio,
                    c.FechaFin,
                    c.Estado,
                    DATEPART(isowk, c.FechaInicio) AS NumeroSemana,
                    YEAR(c.FechaInicio) AS Anio,
                    ISNULL(r.TotalLitros, 0) AS TotalLitros,
                    ISNULL(r.TotalMontoUSD, 0) AS TotalMontoUSD,
                    ISNULL(r.TotalBrutoBs, 0) AS TotalBrutoBs,
                    ISNULL(r.TotalFincasParticipantes, 0) AS TotalFincasParticipantes,
                    0 AS TotalCompaniasParticipantes,
                    c.Observaciones AS Observaciones,
                    ISNULL(c.StockInicialTanques, 0) AS StockInicialTanques,
                    c.StockFinalTanques AS StockFinalTanques
                FROM TB_CICLOS_OPERATIVOS c
                LEFT JOIN RecoleccionesPorCiclo r ON c.Id = r.CicloId
                ORDER BY CASE WHEN c.Estado = 'ABIERTO' THEN 0 ELSE 1 END, c.FechaInicio DESC";

            return await connection.QueryAsync<SemanaDetalleDto>(sql);
        }

        public async Task<bool> EditarSemanaAsync(int id, EditarCicloDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            var semana = await connection.QueryFirstOrDefaultAsync<CicloOperativo>("SELECT * FROM TB_CICLOS_OPERATIVOS WHERE Id = @id", new { id });
            if (semana == null || semana.Estado == "CERRADO") return false;

            var sql = @"
                UPDATE TB_CICLOS_OPERATIVOS 
                SET Codigo = @codigo, 
                    FechaInicio = @fechaInicio, 
                    FechaFin = @fechaFin, 
                    Observaciones = @observaciones,
                    UpdatedAt = GETDATE()
                WHERE Id = @id";

            var rows = await connection.ExecuteAsync(sql, new
            {
                id,
                codigo = dto.Codigo,
                fechaInicio = dto.FechaInicio.Date,
                fechaFin = dto.FechaFin.Date,
                observaciones = dto.Observaciones
            });

            return rows > 0;
        }

        public async Task<int> CrearSemanaAsync(CrearCicloDto dto)
        {
            using var connection = new SqlConnection(_connectionString);

            decimal stockIni = dto.StockInicialTanques ?? 0m;
            if (stockIni == 0m)
            {
                stockIni = await connection.ExecuteScalarAsync<decimal?>(
                    "SELECT TOP 1 ISNULL(StockFinalTanques, 0) FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'CERRADO' ORDER BY Id DESC") ?? 0m;
            }

            var sql = @"
                INSERT INTO TB_CICLOS_OPERATIVOS (Codigo, FechaInicio, FechaFin, Estado, StockInicialTanques, Observaciones, CreatedAt)
                VALUES (@codigo, @fechaInicio, @fechaFin, 'PROGRAMADO', @stockIni, @observaciones, GETDATE());
                SELECT CAST(SCOPE_IDENTITY() as int);";

            return await connection.ExecuteScalarAsync<int>(sql, new
            {
                codigo = dto.Codigo,
                fechaInicio = dto.FechaInicio.Date,
                fechaFin = dto.FechaFin.Date,
                stockIni,
                observaciones = dto.Observaciones
            });
        }

        public async Task<int> Generar52SemanasAsync(Generar52SemanasDto dto)
        {
            using var connection = new SqlConnection(_connectionString);
            DateTime cursor;
            if (dto.FechaPrimerInicio.HasValue)
            {
                cursor = dto.FechaPrimerInicio.Value.Date;
            }
            else
            {
                cursor = new DateTime(dto.Anio, 1, 1);
                int diff = ((int)dto.DiaInicio - (int)cursor.DayOfWeek + 7) % 7;
                cursor = cursor.AddDays(diff);
            }

            bool yaHayAbierta = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO'") > 0;

            int creadas = 0;
            for (int semanaNum = 1; semanaNum <= 52; semanaNum++)
            {
                DateTime fIni = cursor;
                DateTime fFin = cursor.AddDays(6);
                string codigo = $"Semana {semanaNum:D2} ({dto.Anio})";

                var existe = await connection.ExecuteScalarAsync<int>(
                    "SELECT COUNT(1) FROM TB_CICLOS_OPERATIVOS WHERE (FechaInicio = @fIni AND FechaFin = @fFin) OR Codigo = @codigo",
                    new { fIni, fFin, codigo });

                if (existe == 0)
                {
                    string estado = (!yaHayAbierta && semanaNum == 1) ? "ABIERTO" : "PROGRAMADO";
                    var sql = @"
                        INSERT INTO TB_CICLOS_OPERATIVOS (Codigo, FechaInicio, FechaFin, Estado, Observaciones, CreatedAt)
                        VALUES (@codigo, @fIni, @fFin, @estado, @obs, GETDATE());";

                    await connection.ExecuteAsync(sql, new
                    {
                        codigo,
                        fIni,
                        fFin,
                        estado,
                        obs = $"Semana generada automÃ¡ticamente para el aÃ±o {dto.Anio}"
                    });
                    creadas++;
                }

                cursor = cursor.AddDays(7);
            }

            return creadas;
        }

        public async Task<int> Completar52SemanasAsync(int? anio = null)
        {
            using var connection = new SqlConnection(_connectionString);

            var ultima = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT TOP 1 Id, Codigo, FechaInicio, FechaFin
                  FROM TB_CICLOS_OPERATIVOS
                  WHERE (@anio IS NULL OR YEAR(FechaInicio) = @anio OR YEAR(FechaFin) = @anio)
                  ORDER BY FechaFin DESC, Id DESC",
                new { anio });

            int anioObjetivo = anio ?? (ultima != null ? ((DateTime)ultima.FechaInicio).Year : DateTime.Now.Year);

            if (ultima == null)
            {
                return await Generar52SemanasAsync(new Generar52SemanasDto { Anio = anioObjetivo, DiaInicio = 2, DiaFin = 1 });
            }

            int existentes = await connection.ExecuteScalarAsync<int>(
                @"SELECT COUNT(1) FROM TB_CICLOS_OPERATIVOS
                  WHERE YEAR(FechaInicio) = @anioObjetivo OR Codigo LIKE @patron",
                new { anioObjetivo, patron = $"%({anioObjetivo})%" });

            // Extraer nÃºmero de semana de la Ãºltima semana si existe (ej. "Semana 45" -> 45)
            int ultimaNum = existentes;
            string ultCodigo = Convert.ToString(ultima.Codigo ?? "") ?? "";
            var match = System.Text.RegularExpressions.Regex.Match(ultCodigo, @"\b(\d{1,2})\b");
            if (match.Success && int.TryParse(match.Groups[1].Value, out int parsedNum) && parsedNum >= 1 && parsedNum <= 52)
            {
                ultimaNum = Math.Max(ultimaNum, parsedNum);
            }

            if (ultimaNum >= 52) return 0;

            bool yaHayAbierta = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO'") > 0;

            DateTime cursor = ((DateTime)ultima.FechaFin).Date.AddDays(1);
            int creadas = 0;

            for (int semanaNum = ultimaNum + 1; semanaNum <= 52; semanaNum++)
            {
                DateTime fIni = cursor;
                DateTime fFin = cursor.AddDays(6);
                string codigo = $"Semana {semanaNum:D2} ({anioObjetivo})";

                var existe = await connection.ExecuteScalarAsync<int>(
                    "SELECT COUNT(1) FROM TB_CICLOS_OPERATIVOS WHERE (FechaInicio = @fIni AND FechaFin = @fFin) OR Codigo = @codigo",
                    new { fIni, fFin, codigo });

                if (existe == 0)
                {
                    string estado = (!yaHayAbierta && creadas == 0) ? "ABIERTO" : "PROGRAMADO";
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_CICLOS_OPERATIVOS (Codigo, FechaInicio, FechaFin, Estado, Observaciones, CreatedAt)
                        VALUES (@codigo, @fIni, @fFin, @estado, @obs, GETDATE());",
                        new
                        {
                            codigo,
                            fIni,
                            fFin,
                            estado,
                            obs = $"Semana completada automÃ¡ticamente hasta la semana 52 ({anioObjetivo})"
                        });
                    creadas++;
                }

                cursor = cursor.AddDays(7);
            }

            return creadas;
        }

        public async Task<bool> ActivarSemanaAsync(int id, decimal? stockInicialPersonalizado = null)
        {
            using var connection = new SqlConnection(_connectionString);
            
            // Verificar cuÃ¡ntas semanas estÃ¡n actualmente ABIERTAS (distintas a la actual)
            int abiertas = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' AND Id != @id", new { id });
            
            if (abiertas >= 3)
            {
                throw new InvalidOperationException("No se pueden tener mÃ¡s de 3 semanas operativas abiertas simultÃ¡neamente. Por favor cierre alguna semana antes de abrir otra.");
            }

            var sql = @"
                DECLARE @fIniActual DATE = (SELECT FechaInicio FROM TB_CICLOS_OPERATIVOS WHERE Id = @id);
                DECLARE @stockPrevio DECIMAL(18,2) = (
                    SELECT TOP 1 ISNULL(StockFinalTanques, 0) 
                    FROM TB_CICLOS_OPERATIVOS 
                    WHERE Estado = 'CERRADO' AND FechaFin <= @fIniActual 
                    ORDER BY FechaFin DESC
                );
                
                UPDATE TB_CICLOS_OPERATIVOS 
                SET Estado = 'ABIERTO',
                    StockInicialTanques = CASE 
                        WHEN @stockInicialPersonalizado IS NOT NULL THEN @stockInicialPersonalizado
                        WHEN (StockInicialTanques IS NULL OR StockInicialTanques = 0) AND @stockPrevio IS NOT NULL AND @stockPrevio > 0 
                        THEN @stockPrevio 
                        ELSE StockInicialTanques 
                    END
                WHERE Id = @id;";

            var rows = await connection.ExecuteAsync(sql, new { id, stockInicialPersonalizado });
            return rows > 0;
        }

        public async Task<ResumenCierreCicloDto> ObtenerResumenCierreAsync(int cicloId)
        {
            using var connection = new SqlConnection(_connectionString);

            var ciclo = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                "SELECT * FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloId", new { cicloId });

            if (ciclo == null)
            {
                throw new InvalidOperationException("El ciclo operativo especificado no existe.");
            }

            decimal stockInicial = ciclo.StockInicialTanques ?? 0m;

            // RecolecciÃ³n en Fincas
            decimal recolectadoFincas = await connection.ExecuteScalarAsync<decimal>(
                "SELECT ISNULL(SUM(Litros), 0) FROM TB_RUTAS_RECOLECCION WHERE CicloId = @cicloId", new { cicloId });

            // Entradas a ReceptorÃ­a
            var sqlEntradas = @"
                SELECT ISNULL(SUM(e.Litros), 0)
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                WHERE e.CicloId = @cicloId
                  AND (UPPER(c.Nombre) LIKE '%RECEPTORIA%' OR UPPER(c.Nombre) LIKE '%RECEPTORÃA%')";
            decimal entradasReceptoria = await connection.ExecuteScalarAsync<decimal>(sqlEntradas, new { cicloId });

            // Despachos a CompaÃ±Ã­as
            var sqlSalidas = @"
                SELECT ISNULL(SUM(COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0)), 0)
                FROM TB_CONTROL_COMPANIAS cc
                INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE cc.CicloId = @cicloId
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORIA%'
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORÃA%'";
            decimal salidasCompanias = await connection.ExecuteScalarAsync<decimal>(sqlSalidas, new { cicloId });

            // Merma de Rutas
            decimal merma = await connection.ExecuteScalarAsync<decimal>(
                "SELECT ISNULL(SUM(DiferenciaLitros), 0) FROM TB_CONTROL_RUTAS WHERE CicloId = @cicloId", new { cicloId });

            decimal balance = stockInicial + entradasReceptoria - salidasCompanias;
            if (balance < 0) balance = 0m;

            // Identificar el siguiente ciclo cronolÃ³gico
            var nextCiclo = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                "SELECT TOP 1 * FROM TB_CICLOS_OPERATIVOS WHERE FechaInicio > @FechaFin ORDER BY FechaInicio ASC",
                new { ciclo.FechaFin });

            if (nextCiclo == null)
            {
                nextCiclo = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                    "SELECT TOP 1 * FROM TB_CICLOS_OPERATIVOS WHERE Id > @Id ORDER BY Id ASC",
                    new { ciclo.Id });
            }

            return new ResumenCierreCicloDto
            {
                CicloId = ciclo.Id,
                Codigo = ciclo.Codigo,
                FechaInicio = ciclo.FechaInicio,
                FechaFin = ciclo.FechaFin,
                StockInicialTanques = stockInicial,
                TotalRecolectadoFincas = recolectadoFincas,
                TotalEntregasReceptoria = entradasReceptoria,
                TotalDespachosCompanias = salidasCompanias,
                TotalMerma = merma,
                BalanceCalculadoTanque = balance,
                SiguienteCicloId = nextCiclo?.Id,
                SiguienteCicloCodigo = nextCiclo?.Codigo,
                SiguienteCicloFechaInicio = nextCiclo?.FechaInicio,
                SiguienteCicloFechaFin = nextCiclo?.FechaFin
            };
        }

        public async Task<ValidacionActivacionCicloDto> ValidarActivacionCicloAsync(int cicloId)
        {
            using var connection = new SqlConnection(_connectionString);

            var cicloAActivar = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                "SELECT * FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloId", new { cicloId });

            if (cicloAActivar == null)
            {
                throw new InvalidOperationException("El ciclo operativo a activar no existe.");
            }

            // Buscar el Ãºltimo ciclo CERRADO
            var ultimoCerrado = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                "SELECT TOP 1 * FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'CERRADO' ORDER BY FechaFin DESC, Id DESC");

            if (ultimoCerrado == null)
            {
                // No hay ciclos previos cerrados, no hay conflicto de secuencia
                return new ValidacionActivacionCicloDto
                {
                    CicloAActivarId = cicloAActivar.Id,
                    CicloAActivarCodigo = cicloAActivar.Codigo,
                    EsSecuenciaCorrecta = true
                };
            }

            // Buscar el ciclo siguiente esperado cronolÃ³gicamente despuÃ©s del Ãºltimo cerrado
            var cicloEsperado = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                "SELECT TOP 1 * FROM TB_CICLOS_OPERATIVOS WHERE FechaInicio > @FechaFin ORDER BY FechaInicio ASC",
                new { ultimoCerrado.FechaFin });

            if (cicloEsperado == null)
            {
                cicloEsperado = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                    "SELECT TOP 1 * FROM TB_CICLOS_OPERATIVOS WHERE Id > @Id ORDER BY Id ASC",
                    new { ultimoCerrado.Id });
            }

            decimal stockRemanente = ultimoCerrado.StockFinalTanques ?? 0m;
            bool esSecuenciaCorrecta = (cicloEsperado == null || cicloEsperado.Id == cicloAActivar.Id);

            string? mensaje = null;
            if (!esSecuenciaCorrecta && cicloEsperado != null)
            {
                mensaje = $"El Ãºltimo ciclo cerrado fue '{ultimoCerrado.Codigo}' (con {stockRemanente:N0} Lts que quedaron en tanque). El siguiente ciclo correlativo deberÃ­a ser '{cicloEsperado.Codigo}', pero estÃ¡s intentando activar '{cicloAActivar.Codigo}'.";
            }

            return new ValidacionActivacionCicloDto
            {
                CicloAActivarId = cicloAActivar.Id,
                CicloAActivarCodigo = cicloAActivar.Codigo,
                UltimoCicloCerradoId = ultimoCerrado.Id,
                UltimoCicloCerradoCodigo = ultimoCerrado.Codigo,
                UltimoCicloCerradoStockFinal = stockRemanente,
                CicloSiguienteEsperadoId = cicloEsperado?.Id,
                CicloSiguienteEsperadoCodigo = cicloEsperado?.Codigo,
                EsSecuenciaCorrecta = esSecuenciaCorrecta,
                MensajeAdvertencia = mensaje
            };
        }

        public async Task<decimal> ObtenerBalanceTanqueCicloAsync(int cicloId)
        {
            using var connection = new SqlConnection(_connectionString);
            
            var stockInicial = await connection.ExecuteScalarAsync<decimal?>(
                "SELECT ISNULL(StockInicialTanques, 0) FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloId", new { cicloId }) ?? 0m;

            var sqlEntradas = @"
                SELECT ISNULL(SUM(e.Litros), 0)
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                WHERE e.CicloId = @cicloId
                  AND (UPPER(c.Nombre) LIKE '%RECEPTORIA%' OR UPPER(c.Nombre) LIKE '%RECEPTORÃA%')";
            var entradas = await connection.ExecuteScalarAsync<decimal>(sqlEntradas, new { cicloId });

            var sqlSalidas = @"
                SELECT ISNULL(SUM(COALESCE(NULLIF(cc.LitrosRecibidosCompania, 0), cc.LitrosDespachados, 0)), 0)
                FROM TB_CONTROL_COMPANIAS cc
                INNER JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE cc.CicloId = @cicloId
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORIA%'
                  AND UPPER(c.Nombre) NOT LIKE '%RECEPTORÃA%'";
            var salidas = await connection.ExecuteScalarAsync<decimal>(sqlSalidas, new { cicloId });

            var balance = stockInicial + entradas - salidas;
            return balance >= 0 ? balance : 0m;
        }

        public async Task<bool> CerrarSemanaAsync(int id, decimal? stockFinalTanques = null)
        {
            using var connection = new SqlConnection(_connectionString);

            if (!stockFinalTanques.HasValue)
            {
                stockFinalTanques = await ObtenerBalanceTanqueCicloAsync(id);
            }

            var sql = @"
                UPDATE TB_CICLOS_OPERATIVOS 
                SET Estado = 'CERRADO', 
                    FechaCierre = GETDATE(), 
                    StockFinalTanques = @stockFinalTanques 
                WHERE Id = @id;

                -- Heredar automÃ¡ticamente el Stock Final como Stock Inicial del siguiente ciclo operativo cronolÃ³gicamente
                DECLARE @fFinActual DATE = (SELECT FechaFin FROM TB_CICLOS_OPERATIVOS WHERE Id = @id);
                DECLARE @nextId INT = (SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE FechaInicio > @fFinActual ORDER BY FechaInicio ASC);
                IF @nextId IS NULL
                BEGIN
                    SET @nextId = (SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @id ORDER BY Id ASC);
                END

                IF @nextId IS NOT NULL AND @stockFinalTanques IS NOT NULL
                BEGIN
                    UPDATE TB_CICLOS_OPERATIVOS 
                    SET StockInicialTanques = @stockFinalTanques 
                    WHERE Id = @nextId;
                END
            ";
            var rows = await connection.ExecuteAsync(sql, new { id, stockFinalTanques });
            return rows > 0;
        }

        public async Task<bool> ReabrirSemanaAsync(int id, string motivo, int usuarioId, string usuarioNombre)
        {
            using var connection = new SqlConnection(_connectionString);

            // Validar que no haya mÃ¡s de 3 semanas abiertas simultÃ¡neamente
            int abiertas = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' AND Id != @id", new { id });

            if (abiertas >= 3)
            {
                throw new InvalidOperationException("No se pueden tener mÃ¡s de 3 semanas operativas abiertas simultÃ¡neamente. Cierre al menos una semana antes de reabrir esta.");
            }

            var motivoLimpio = string.IsNullOrWhiteSpace(motivo) ? "Reapertura de ciclo operativo para ajustes y tickets rezagados" : motivo.Trim();
            var logEntry = $"[REAPERTURA {DateTime.Now:yyyy-MM-dd HH:mm} por {usuarioNombre}]: {motivoLimpio}";

            var sql = @"
                UPDATE TB_CICLOS_OPERATIVOS 
                SET Estado = 'ABIERTO',
                    Observaciones = CASE 
                        WHEN Observaciones IS NULL OR Observaciones = '' THEN @logEntry
                        ELSE CONCAT(Observaciones, CHAR(13), CHAR(10), @logEntry)
                    END
                WHERE Id = @id;

                INSERT INTO TB_LOGS_CICLOS_OPERATIVOS (CicloId, Accion, Motivo, UsuarioId, UsuarioNombre, Fecha)
                VALUES (@id, 'REAPERTURA', @motivoLimpio, @usuarioId, @usuarioNombre, GETDATE());
            ";

            var rows = await connection.ExecuteAsync(sql, new { id, logEntry, motivoLimpio, usuarioId, usuarioNombre });
            return rows > 0;
        }

        public async Task<bool> ActualizarStockInicialAsync(int cicloId, decimal stockInicial)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = "UPDATE TB_CICLOS_OPERATIVOS SET StockInicialTanques = @stockInicial WHERE Id = @cicloId";
            var rows = await connection.ExecuteAsync(sql, new { cicloId, stockInicial });
            return rows > 0;
        }
    }

}
