using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

namespace Transporte.Infrastructure.Repositories
{
    public interface IAdelantosRepository
    {
        Task<List<AdelantoDto>> ObtenerAdelantosAsync(string? tipoEntidad = null, int? entidadId = null, string? estado = null);
        Task<AdelantoDto?> ObtenerPorIdAsync(int id);
        Task<AdelantoDto> CrearAdelantoAsync(CrearAdelantoDto dto, int? usuarioId = null);
        Task<bool> ActualizarCuotaAsync(int cuotaId, ActualizarCuotaAdelantoDto dto, int? usuarioId = null);
        Task<bool> PosponerCuotaAsync(int cuotaId, string? motivo, int? usuarioId = null, int? semanaOperativaIdDestino = null);
        Task<bool> DividirCuotaAsync(int cuotaId, decimal montoDescontarUSD, int? semanaOperativaIdDestino = null, string? motivo = null, int? usuarioId = null);
        Task<bool> MarcarPagoLiquidacionFincaAsync(int fincaId, DateTime fechaDesde, DateTime fechaHasta, bool pagado, decimal? tasaBcv, int? usuarioId = null);
        Task<bool> ReestructurarCuotasAsync(int adelantoId, ReestructurarCuotasDto dto, int? usuarioId = null);
        Task<bool> EliminarAdelantoAsync(int id);
        Task<List<AbonoDetalleDto>> ObtenerAbonosAsync(string? tipoEntidad = null, int? entidadId = null, int? cicloId = null);
        Task<bool> RegistrarAbonoDirectoAsync(RegistrarAbonoDirectoDto dto, int? usuarioId = null);
        Task<int> ActualizarTasaAdelantosActivosAsync(string tipoEntidad, decimal tasaBcv, int? usuarioId = null);
    }

    public class AdelantosRepository : IAdelantosRepository
    {
        private readonly string _connectionString;

        public AdelantosRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        private async Task<decimal> ObtenerTasaActualAsync(SqlConnection connection, System.Data.IDbTransaction? transaction = null)
        {
            var tasa = await connection.QueryFirstOrDefaultAsync<decimal?>(
                "SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC, CreatedAt DESC", transaction: transaction);
            return tasa ?? 791.3248m;
        }

        public async Task<List<AdelantoDto>> ObtenerAdelantosAsync(string? tipoEntidad = null, int? entidadId = null, string? estado = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    a.Id,
                    a.TipoEntidad,
                    a.EntidadId,
                    CASE 
                        WHEN a.TipoEntidad = 'FINCA' THEN f.Nombre 
                        WHEN a.TipoEntidad IN ('RECEPTORIA', 'COMPANIA') THEN c.Nombre 
                        ELSE 'S/N' 
                    END AS EntidadNombre,
                    a.FechaSolicitud,
                    a.SemanaInicioId,
                    s.Codigo AS SemanaInicioNombre,
                    a.MontoTotalUSD,
                    a.NumeroCuotas,
                    a.MontoCuotaUSD,
                    a.MontoPagadoUSD,
                    a.MontoPendienteUSD,
                    a.Estado,
                    a.Observacion
                FROM TB_ADELANTOS a
                LEFT JOIN TB_FINCAS f ON a.TipoEntidad = 'FINCA' AND a.EntidadId = f.Id
                LEFT JOIN TB_COMPANIAS c ON a.TipoEntidad IN ('RECEPTORIA', 'COMPANIA') AND a.EntidadId = c.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS s ON a.SemanaInicioId = s.Id
                WHERE (@tipoEntidad IS NULL OR a.TipoEntidad = @tipoEntidad)
                  AND (@entidadId IS NULL OR a.EntidadId = @entidadId)
                  AND (@estado IS NULL OR a.Estado = @estado)
                ORDER BY a.FechaSolicitud DESC, a.Id DESC";

            var adelantos = (await connection.QueryAsync<AdelantoDto>(sql, new { tipoEntidad, entidadId, estado })).ToList();
            if (!adelantos.Any()) return adelantos;

            var adelantoIds = adelantos.Select(x => x.Id).ToList();
            var sqlCuotas = @"
                SELECT 
                    c.Id,
                    c.AdelantoId,
                    c.NumeroCuota,
                    c.SemanaOperativaId,
                    s.Codigo AS SemanaNombre,
                    s.FechaInicio AS FechaInicioSemana,
                    s.FechaFin AS FechaFinSemana,
                    c.MontoCuotaUSD,
                    c.MontoCobradoUSD,
                    c.TasaBcvAplicada,
                    c.MontoCobradoBs,
                    c.Estado,
                    c.Observacion
                FROM TB_ADELANTOS_CUOTAS c
                LEFT JOIN TB_CICLOS_OPERATIVOS s ON c.SemanaOperativaId = s.Id
                WHERE c.AdelantoId IN @adelantoIds
                ORDER BY c.AdelantoId, c.NumeroCuota";

            var cuotas = (await connection.QueryAsync<AdelantoCuotaDto>(sqlCuotas, new { adelantoIds })).ToList();
            var cuotasMap = cuotas.GroupBy(x => x.AdelantoId).ToDictionary(g => g.Key, g => g.ToList());

            foreach (var a in adelantos)
            {
                if (cuotasMap.TryGetValue(a.Id, out var listaCuotas))
                {
                    a.Cuotas = listaCuotas;
                }
            }

            return adelantos;
        }

        public async Task<AdelantoDto?> ObtenerPorIdAsync(int id)
        {
            var list = await ObtenerAdelantosAsync(null, null, null);
            return list.FirstOrDefault(x => x.Id == id);
        }

        public async Task<AdelantoDto> CrearAdelantoAsync(CrearAdelantoDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                int numeroCuotas = dto.NumeroCuotas > 0 ? dto.NumeroCuotas : 1;
                decimal montoCuotaUSD = Math.Round(dto.MontoTotalUSD / numeroCuotas, 4);
                DateTime fechaSol = dto.FechaSolicitud ?? DateTime.Now;

                // Buscar semana inicial
                int? semanaInicioId = dto.SemanaInicioId;
                if (!semanaInicioId.HasValue || semanaInicioId.Value <= 0)
                {
                    var semActual = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fecha >= FechaInicio AND @fecha <= FechaFin ORDER BY Id DESC",
                        new { fecha = fechaSol }, transaction);
                    semanaInicioId = semActual?.Id;
                }

                var sqlInsert = @"
                    INSERT INTO TB_ADELANTOS (
                        TipoEntidad, EntidadId, FechaSolicitud, SemanaInicioId,
                        MontoTotalUSD, NumeroCuotas, MontoCuotaUSD, MontoPagadoUSD,
                        MontoPendienteUSD, Estado, Observacion, CreatedAt, CreatedBy
                    ) VALUES (
                        @TipoEntidad, @EntidadId, @FechaSolicitud, @SemanaInicioId,
                        @MontoTotalUSD, @NumeroCuotas, @MontoCuotaUSD, 0,
                        @MontoTotalUSD, 'ACTIVO', @Observacion, GETDATE(), @usuarioId
                    );
                    SELECT CAST(SCOPE_IDENTITY() as int);";

                int adelantoId = await connection.QuerySingleAsync<int>(sqlInsert, new
                {
                    dto.TipoEntidad,
                    dto.EntidadId,
                    FechaSolicitud = fechaSol,
                    SemanaInicioId = semanaInicioId,
                    dto.MontoTotalUSD,
                    NumeroCuotas = numeroCuotas,
                    MontoCuotaUSD = montoCuotaUSD,
                    dto.Observacion,
                    usuarioId
                }, transaction);

                // Obtener lista de semanas operativas consecutivas a partir de la semana inicial
                var sqlSemanas = @"
                    SELECT Id FROM TB_CICLOS_OPERATIVOS 
                    WHERE (@semanaInicioId IS NULL OR Id >= @semanaInicioId)
                    ORDER BY Id ASC";
                var semanasFuturas = (await connection.QueryAsync<int>(sqlSemanas, new { semanaInicioId }, transaction)).ToList();

                decimal tasaActual = dto.TasaBcvInicial.HasValue && dto.TasaBcvInicial.Value > 0 
                    ? dto.TasaBcvInicial.Value 
                    : await ObtenerTasaActualAsync(connection, transaction);

                if (dto.CuotasPersonalizadas != null && dto.CuotasPersonalizadas.Any())
                {
                    for (int i = 0; i < dto.CuotasPersonalizadas.Count; i++)
                    {
                        var item = dto.CuotasPersonalizadas[i];
                        int numCuota = item.NumeroCuota > 0 ? item.NumeroCuota : (i + 1);
                        int? semId = item.SemanaOperativaId.HasValue && item.SemanaOperativaId.Value > 0
                            ? item.SemanaOperativaId.Value
                            : ((i < semanasFuturas.Count) ? semanasFuturas[i] : (int?)null);
                        decimal cuotaUsd = item.MontoCuotaUSD;
                        decimal tasaCuota = item.TasaBcvAplicada.HasValue && item.TasaBcvAplicada.Value > 0
                            ? item.TasaBcvAplicada.Value
                            : tasaActual;

                        var sqlInsertCuota = @"
                            INSERT INTO TB_ADELANTOS_CUOTAS (
                                AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                                MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                                CreatedAt, CreatedBy
                            ) VALUES (
                                @adelantoId, @numCuota, @semId, @cuotaUsd,
                                0, @tasaCuota, 0, 'PENDIENTE',
                                GETDATE(), @usuarioId
                            )";

                        await connection.ExecuteAsync(sqlInsertCuota, new
                        {
                            adelantoId,
                            numCuota,
                            semId,
                            cuotaUsd,
                            tasaCuota,
                            usuarioId
                        }, transaction);
                    }
                }
                else
                {
                    for (int i = 1; i <= numeroCuotas; i++)
                    {
                        int? semId = (i - 1 < semanasFuturas.Count) ? semanasFuturas[i - 1] : (int?)null;
                        decimal cuotaUsd = (i == numeroCuotas) 
                            ? (dto.MontoTotalUSD - (montoCuotaUSD * (numeroCuotas - 1))) 
                            : montoCuotaUSD;

                        var sqlInsertCuota = @"
                            INSERT INTO TB_ADELANTOS_CUOTAS (
                                AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                                MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                                CreatedAt, CreatedBy
                            ) VALUES (
                                @adelantoId, @i, @semId, @cuotaUsd,
                                0, @tasaActual, 0, 'PENDIENTE',
                                GETDATE(), @usuarioId
                            )";

                        await connection.ExecuteAsync(sqlInsertCuota, new
                        {
                            adelantoId,
                            i,
                            semId,
                            cuotaUsd,
                            tasaActual,
                            usuarioId
                        }, transaction);
                    }
                }

                transaction.Commit();

                return (await ObtenerPorIdAsync(adelantoId))!;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> ReestructurarCuotasAsync(int adelantoId, ReestructurarCuotasDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var adelanto = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT Id, SemanaInicioId, MontoTotalUSD, MontoPagadoUSD FROM TB_ADELANTOS WHERE Id = @adelantoId",
                    new { adelantoId }, transaction);

                if (adelanto == null) return false;

                var cuotasCobradas = (await connection.QueryAsync<dynamic>(
                    "SELECT Id, NumeroCuota, SemanaOperativaId FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado = 'COBRADO' ORDER BY NumeroCuota ASC",
                    new { adelantoId }, transaction)).ToList();

                int numCobradas = cuotasCobradas.Count;
                int? ultimaSemanaId = cuotasCobradas.LastOrDefault()?.SemanaOperativaId ?? (int?)adelanto.SemanaInicioId;

                await connection.ExecuteAsync(
                    "DELETE FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado != 'COBRADO'",
                    new { adelantoId }, transaction);

                var sqlSemanas = @"
                    SELECT Id FROM TB_CICLOS_OPERATIVOS 
                    WHERE (@ultimaSemanaId IS NULL OR Id > @ultimaSemanaId)
                    ORDER BY Id ASC";
                var semanasFuturas = (await connection.QueryAsync<int>(sqlSemanas, new { ultimaSemanaId }, transaction)).ToList();

                decimal tasaActual = await ObtenerTasaActualAsync(connection, transaction);

                if (dto.NuevasCuotasPendientes != null && dto.NuevasCuotasPendientes.Any())
                {
                    for (int i = 0; i < dto.NuevasCuotasPendientes.Count; i++)
                    {
                        var item = dto.NuevasCuotasPendientes[i];
                        int numCuota = numCobradas + i + 1;
                        int? semId = item.SemanaOperativaId.HasValue && item.SemanaOperativaId.Value > 0
                            ? item.SemanaOperativaId.Value
                            : ((i < semanasFuturas.Count) ? semanasFuturas[i] : (int?)null);
                        decimal cuotaUsd = item.MontoCuotaUSD;
                        decimal tasaCuota = item.TasaBcvAplicada.HasValue && item.TasaBcvAplicada.Value > 0
                            ? item.TasaBcvAplicada.Value
                            : tasaActual;

                        var sqlInsertCuota = @"
                            INSERT INTO TB_ADELANTOS_CUOTAS (
                                AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                                MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                                CreatedAt, CreatedBy
                            ) VALUES (
                                @adelantoId, @numCuota, @semId, @cuotaUsd,
                                0, @tasaCuota, 0, 'PENDIENTE',
                                GETDATE(), @usuarioId
                            )";

                        await connection.ExecuteAsync(sqlInsertCuota, new
                        {
                            adelantoId,
                            numCuota,
                            semId,
                            cuotaUsd,
                            tasaCuota,
                            usuarioId
                        }, transaction);
                    }
                }

                int totalCuotas = numCobradas + (dto.NuevasCuotasPendientes?.Count ?? 0);
                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS SET
                        NumeroCuotas = @totalCuotas,
                        MontoCuotaUSD = (SELECT ISNULL(AVG(MontoCuotaUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId),
                        MontoPendienteUSD = (SELECT ISNULL(SUM(MontoCuotaUSD - MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado != 'COBRADO'),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @adelantoId",
                    new { totalCuotas, usuarioId, adelantoId }, transaction);

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> ActualizarCuotaAsync(int cuotaId, ActualizarCuotaAdelantoDto dto, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var cuota = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM TB_ADELANTOS_CUOTAS WHERE Id = @cuotaId", new { cuotaId }, transaction);
                if (cuota == null) return false;

                int adelantoId = (int)cuota.AdelantoId;
                decimal tasaAplicada = dto.TasaBcvAplicada ?? (decimal)(cuota.TasaBcvAplicada ?? await ObtenerTasaActualAsync(connection, transaction));
                decimal montoCobradoUsd = dto.MontoCobradoUSD ?? (decimal)cuota.MontoCobradoUSD;
                decimal montoCuotaUsd = dto.MontoCuotaUSD ?? montoCobradoUsd;
                decimal montoCobradoBs = dto.MontoCobradoBs ?? (montoCobradoUsd * tasaAplicada);
                int? semanaOperativaId = dto.SemanaOperativaId ?? (int?)cuota.SemanaOperativaId;
                string estado = dto.Estado ?? (string)cuota.Estado;
                string? observacion = dto.Observacion ?? (string?)cuota.Observacion;

                var sqlUpdCuota = @"
                    UPDATE TB_ADELANTOS_CUOTAS 
                    SET MontoCuotaUSD = @montoCuotaUsd,
                        MontoCobradoUSD = @montoCobradoUsd,
                        TasaBcvAplicada = @tasaAplicada,
                        MontoCobradoBs = @montoCobradoBs,
                        SemanaOperativaId = @semanaOperativaId,
                        Estado = @estado,
                        Observacion = @observacion,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @cuotaId;

                    IF (SELECT NumeroCuota FROM TB_ADELANTOS_CUOTAS WHERE Id = @cuotaId) = 1 AND @semanaOperativaId IS NOT NULL
                    BEGIN
                        UPDATE TB_ADELANTOS SET SemanaInicioId = @semanaOperativaId WHERE Id = @adelantoId;
                    END";

                await connection.ExecuteAsync(sqlUpdCuota, new
                {
                    montoCuotaUsd,
                    montoCobradoUsd,
                    tasaAplicada,
                    montoCobradoBs,
                    semanaOperativaId,
                    estado,
                    observacion,
                    usuarioId,
                    cuotaId,
                    adelantoId
                }, transaction);

                // Recalcular montos del Adelanto Padre
                var totalPagado = await connection.QuerySingleAsync<decimal>(
                    "SELECT ISNULL(SUM(MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado = 'COBRADO'",
                    new { adelantoId }, transaction);

                var totalCuotasPactadas = await connection.QuerySingleAsync<decimal>(
                    "SELECT ISNULL(SUM(MontoCuotaUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId",
                    new { adelantoId }, transaction);

                decimal montoPendiente = Math.Max(0, totalCuotasPactadas - totalPagado);
                string estadoAdelanto = (montoPendiente == 0) ? "PAGADO" : "ACTIVO";

                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS 
                    SET MontoTotalUSD = @totalCuotasPactadas,
                        MontoPagadoUSD = @totalPagado,
                        MontoPendienteUSD = @montoPendiente,
                        MontoCuotaUSD = (SELECT ISNULL(AVG(MontoCuotaUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId),
                        Estado = @estadoAdelanto,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @adelantoId", new
                {
                    totalCuotasPactadas,
                    totalPagado,
                    montoPendiente,
                    estadoAdelanto,
                    usuarioId,
                    adelantoId
                }, transaction);

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> PosponerCuotaAsync(int cuotaId, string? motivo, int? usuarioId = null, int? semanaOperativaIdDestino = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var cuota = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM TB_ADELANTOS_CUOTAS WHERE Id = @cuotaId", new { cuotaId }, transaction);
                if (cuota == null) return false;

                int adelantoId = (int)cuota.AdelantoId;
                int semActualId = cuota.SemanaOperativaId ?? 0;

                // Marcar cuota actual como POSPUESTO
                string obsPospuesto = string.IsNullOrWhiteSpace(motivo) 
                    ? "Cuota pospuesta a solicitud del cliente" 
                    : $"Pospuesto: {motivo}";

                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS_CUOTAS 
                    SET Estado = 'POSPUESTO',
                        Observacion = @obsPospuesto,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @cuotaId", new { obsPospuesto, usuarioId, cuotaId }, transaction);

                // Determinar la semana de destino
                int? sigSemanaId = (semanaOperativaIdDestino.HasValue && semanaOperativaIdDestino.Value > 0)
                    ? semanaOperativaIdDestino.Value
                    : null;

                if (!sigSemanaId.HasValue)
                {
                    // Buscar la siguiente semana operativa disponible despuÃ©s de la Ãºltima cuota activa programada
                    var maxSemanaId = await connection.QuerySingleAsync<int?>(
                        "SELECT MAX(SemanaOperativaId) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado <> 'POSPUESTO'",
                        new { adelantoId }, transaction) ?? semActualId;

                    sigSemanaId = await connection.QueryFirstOrDefaultAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @maxSemanaId ORDER BY Id ASC",
                        new { maxSemanaId }, transaction);

                    if (!sigSemanaId.HasValue)
                    {
                        sigSemanaId = await connection.QueryFirstOrDefaultAsync<int?>(
                            "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @semActualId ORDER BY Id ASC",
                            new { semActualId }, transaction);
                    }
                }

                // Obtener el nÃºmero mÃ¡ximo de cuota
                int maxNumCuota = await connection.QuerySingleAsync<int>(
                    "SELECT ISNULL(MAX(NumeroCuota), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId",
                    new { adelantoId }, transaction);

                decimal cuotaUsd = (decimal)cuota.MontoCuotaUSD;
                decimal tasaActual = await ObtenerTasaActualAsync(connection, transaction);

                // Crear nueva cuota reprogramada
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_ADELANTOS_CUOTAS (
                        AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                        MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                        Observacion, CreatedAt, CreatedBy
                    ) VALUES (
                        @adelantoId, @nuevaNumCuota, @sigSemanaId, @cuotaUsd,
                        0, @tasaActual, 0, 'PENDIENTE',
                        'Reprogramada por posposiciÃ³n', GETDATE(), @usuarioId
                    )", new
                {
                    adelantoId,
                    nuevaNumCuota = maxNumCuota + 1,
                    sigSemanaId,
                    cuotaUsd,
                    tasaActual,
                    usuarioId
                }, transaction);

                // Mantener actualizado el total de cuotas vigentes en TB_ADELANTOS
                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS 
                    SET NumeroCuotas = (SELECT COUNT(*) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado <> 'ANULADA' AND Estado <> 'POSPUESTO')
                    WHERE Id = @adelantoId", new { adelantoId }, transaction);

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> DividirCuotaAsync(int cuotaId, decimal montoDescontarUSD, int? semanaOperativaIdDestino = null, string? motivo = null, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var cuota = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM TB_ADELANTOS_CUOTAS WHERE Id = @cuotaId", new { cuotaId }, transaction);
                if (cuota == null) return false;

                decimal montoActual = (decimal)cuota.MontoCuotaUSD;
                if (montoDescontarUSD <= 0 || montoDescontarUSD >= montoActual)
                {
                    return false;
                }

                decimal remanenteUSD = montoActual - montoDescontarUSD;
                int adelantoId = (int)cuota.AdelantoId;
                int semActualId = cuota.SemanaOperativaId ?? 0;
                int numCuota = (int)cuota.NumeroCuota;

                // Determinar ciclo destino para el remanente
                int? sigSemanaId = (semanaOperativaIdDestino.HasValue && semanaOperativaIdDestino.Value > 0)
                    ? semanaOperativaIdDestino.Value
                    : null;

                if (!sigSemanaId.HasValue)
                {
                    sigSemanaId = await connection.QueryFirstOrDefaultAsync<int?>(
                        "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @semActualId ORDER BY Id ASC",
                        new { semActualId }, transaction);

                    if (!sigSemanaId.HasValue)
                    {
                        var maxSemanaId = await connection.QuerySingleAsync<int?>(
                            "SELECT MAX(SemanaOperativaId) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado <> 'POSPUESTO'",
                            new { adelantoId }, transaction) ?? semActualId;

                        sigSemanaId = await connection.QueryFirstOrDefaultAsync<int?>(
                            "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Id > @maxSemanaId ORDER BY Id ASC",
                            new { maxSemanaId }, transaction);
                    }
                }

                // 1. Actualizar cuota actual con el monto a descontar en este ciclo
                string obsAjuste = string.IsNullOrWhiteSpace(motivo)
                    ? $"DeducciÃ³n parcial: se cobran ${montoDescontarUSD:N2} y se reprograman ${remanenteUSD:N2}"
                    : motivo;

                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS_CUOTAS 
                    SET MontoCuotaUSD = @montoDescontarUSD,
                        Observacion = CASE WHEN Observacion IS NULL OR Observacion = '' THEN @obsAjuste ELSE Observacion + ' | ' + @obsAjuste END,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @cuotaId", new { montoDescontarUSD, obsAjuste, usuarioId, cuotaId }, transaction);

                // 2. Obtener el nÃºmero mÃ¡ximo de cuota para la nueva cuota
                int maxNumCuota = await connection.QuerySingleAsync<int>(
                    "SELECT ISNULL(MAX(NumeroCuota), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId",
                    new { adelantoId }, transaction);

                decimal tasaActual = await ObtenerTasaActualAsync(connection, transaction);

                // 3. Crear nueva cuota con el remanente asignada al ciclo destino
                string obsRemanente = $"Remanente de Cuota #{numCuota} trasladado al siguiente ciclo";
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_ADELANTOS_CUOTAS (
                        AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                        MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                        Observacion, CreatedAt, CreatedBy
                    ) VALUES (
                        @adelantoId, @nuevaNumCuota, @sigSemanaId, @remanenteUSD,
                        0, @tasaActual, 0, 'PENDIENTE',
                        @obsRemanente, GETDATE(), @usuarioId
                    )", new
                {
                    adelantoId,
                    nuevaNumCuota = maxNumCuota + 1,
                    sigSemanaId,
                    remanenteUSD,
                    tasaActual,
                    obsRemanente,
                    usuarioId
                }, transaction);

                // 4. Actualizar TB_ADELANTOS
                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS 
                    SET NumeroCuotas = (SELECT COUNT(*) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado <> 'ANULADA' AND Estado <> 'POSPUESTO'),
                        MontoCuotaUSD = (SELECT ISNULL(AVG(MontoCuotaUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado <> 'ANULADA' AND Estado <> 'POSPUESTO'),
                        MontoPendienteUSD = (SELECT ISNULL(SUM(MontoCuotaUSD - MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado != 'COBRADO' AND Estado != 'ANULADA'),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @adelantoId", new { usuarioId, adelantoId }, transaction);

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> EliminarAdelantoAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var rows = await connection.ExecuteAsync("DELETE FROM TB_ADELANTOS WHERE Id = @id", new { id });
            return rows > 0;
        }

        public async Task<bool> MarcarPagoLiquidacionFincaAsync(int fincaId, DateTime fechaDesde, DateTime fechaHasta, bool pagado, decimal? tasaBcv, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                decimal tasa = (tasaBcv.HasValue && tasaBcv.Value > 0) 
                    ? tasaBcv.Value 
                    : await ObtenerTasaActualAsync(connection, transaction);

                var semana = await connection.QueryFirstOrDefaultAsync<dynamic>(@"
                    SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS 
                    WHERE (FechaInicio <= @fechaHasta AND FechaFin >= @fechaDesde)
                    ORDER BY Id DESC", new { fechaDesde = fechaDesde.Date, fechaHasta = fechaHasta.Date }, transaction);

                int? semanaId = semana?.Id;

                var cuotasSemana = (await connection.QueryAsync<dynamic>(@"
                    SELECT c.Id, c.AdelantoId, c.MontoCuotaUSD, c.Estado, c.Observacion
                    FROM TB_ADELANTOS_CUOTAS c
                    INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                    WHERE a.TipoEntidad = 'FINCA' 
                      AND a.EntidadId = @fincaId
                      AND (
                          (@semanaId IS NOT NULL AND c.SemanaOperativaId = @semanaId)
                          OR (@semanaId IS NOT NULL AND c.SemanaOperativaId < @semanaId AND c.Estado = 'PENDIENTE')
                          OR (c.SemanaOperativaId IS NULL AND c.Estado = 'PENDIENTE')
                      )
                      AND c.Estado <> 'POSPUESTO'
                      AND c.Estado <> 'ANULADA'
                    ORDER BY c.NumeroCuota ASC", new { fincaId, semanaId }, transaction)).ToList();

                foreach (var cuota in cuotasSemana)
                {
                    int cuotaId = (int)cuota.Id;
                    int adelantoId = (int)cuota.AdelantoId;
                    decimal montoCuotaUsd = (decimal)cuota.MontoCuotaUSD;

                    if (pagado)
                    {
                        decimal montoBs = Math.Round(montoCuotaUsd * tasa, 2);
                        await connection.ExecuteAsync(@"
                            UPDATE TB_ADELANTOS_CUOTAS
                            SET MontoCobradoUSD = @montoCuotaUsd,
                                TasaBcvAplicada = @tasa,
                                MontoCobradoBs = @montoBs,
                                Estado = 'COBRADO',
                                Observacion = 'Descontado y cancelado en LiquidaciÃ³n Bancaria',
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @usuarioId
                            WHERE Id = @cuotaId", new { montoCuotaUsd, tasa, montoBs, usuarioId, cuotaId }, transaction);
                    }
                    else
                    {
                        await connection.ExecuteAsync(@"
                            UPDATE TB_ADELANTOS_CUOTAS
                            SET MontoCobradoUSD = 0,
                                MontoCobradoBs = 0,
                                Estado = 'PENDIENTE',
                                Observacion = 'Pendiente de cobro',
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @usuarioId
                            WHERE Id = @cuotaId AND Observacion LIKE '%LiquidaciÃ³n Bancaria%'", new { usuarioId, cuotaId }, transaction);
                    }

                    var totalPagado = await connection.QuerySingleAsync<decimal>(
                        "SELECT ISNULL(SUM(MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @adelantoId AND Estado = 'COBRADO'",
                        new { adelantoId }, transaction);

                    var adelanto = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT MontoTotalUSD FROM TB_ADELANTOS WHERE Id = @adelantoId", new { adelantoId }, transaction);

                    if (adelanto != null)
                    {
                        decimal montoTotalUsd = (decimal)adelanto.MontoTotalUSD;
                        decimal montoPendiente = Math.Max(0, montoTotalUsd - totalPagado);
                        string estadoAdelanto = (montoPendiente == 0) ? "PAGADO" : "ACTIVO";

                        await connection.ExecuteAsync(@"
                            UPDATE TB_ADELANTOS 
                            SET MontoPagadoUSD = @totalPagado,
                                MontoPendienteUSD = @montoPendiente,
                                Estado = @estadoAdelanto,
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @usuarioId
                            WHERE Id = @adelantoId", new { totalPagado, montoPendiente, estadoAdelanto, usuarioId, adelantoId }, transaction);
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

        public async Task<List<AbonoDetalleDto>> ObtenerAbonosAsync(string? tipoEntidad = null, int? entidadId = null, int? cicloId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT 
                    c.Id,
                    c.AdelantoId,
                    c.NumeroCuota,
                    a.TipoEntidad,
                    a.EntidadId,
                    CASE 
                        WHEN a.TipoEntidad = 'FINCA' THEN f.Nombre 
                        WHEN a.TipoEntidad = 'RECEPTORIA' THEN comp.Nombre 
                        ELSE 'S/N' 
                    END AS EntidadNombre,
                    c.SemanaOperativaId,
                    s.Codigo AS SemanaNombre,
                    ISNULL(c.ModifiedAt, c.CreatedAt) AS FechaCobro,
                    c.MontoCuotaUSD,
                    c.MontoCobradoUSD,
                    c.TasaBcvAplicada,
                    c.MontoCobradoBs,
                    c.Estado,
                    c.Observacion,
                    a.MontoPendienteUSD AS SaldoRestanteUSD
                FROM TB_ADELANTOS_CUOTAS c
                INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                LEFT JOIN TB_FINCAS f ON a.TipoEntidad = 'FINCA' AND a.EntidadId = f.Id
                LEFT JOIN TB_COMPANIAS comp ON a.TipoEntidad = 'RECEPTORIA' AND a.EntidadId = comp.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS s ON c.SemanaOperativaId = s.Id
                WHERE c.Estado = 'COBRADO'
                  AND (@tipoEntidad IS NULL OR a.TipoEntidad = @tipoEntidad)
                  AND (@entidadId IS NULL OR a.EntidadId = @entidadId)
                  AND (@cicloId IS NULL OR c.SemanaOperativaId = @cicloId)
                ORDER BY c.ModifiedAt DESC, c.Id DESC";

            return (await connection.QueryAsync<AbonoDetalleDto>(sql, new { tipoEntidad, entidadId, cicloId })).ToList();
        }

        public async Task<bool> RegistrarAbonoDirectoAsync(RegistrarAbonoDirectoDto dto, int? usuarioId = null)
        {
            if (dto.MontoAbonoUSD <= 0) return false;

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var adelanto = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM TB_ADELANTOS WHERE Id = @AdelantoId", new { dto.AdelantoId }, transaction);
                if (adelanto == null) return false;

                decimal tasa = dto.TasaBcv ?? await ObtenerTasaActualAsync(connection, transaction);
                decimal montoBs = dto.MontoAbonoBs ?? Math.Round(dto.MontoAbonoUSD * tasa, 2);
                DateTime fechaAbono = dto.FechaAbono ?? DateTime.Now;

                var cuotaPendiente = await connection.QueryFirstOrDefaultAsync<dynamic>(@"
                    SELECT TOP 1 * FROM TB_ADELANTOS_CUOTAS 
                    WHERE AdelantoId = @AdelantoId AND Estado = 'PENDIENTE' 
                    ORDER BY NumeroCuota ASC", new { dto.AdelantoId }, transaction);

                string obs = string.IsNullOrWhiteSpace(dto.Observacion) 
                    ? $"Abono directo extraordinario ({dto.MetodoPago ?? "DIRECTO"}{(string.IsNullOrWhiteSpace(dto.ReferenciaComprobante) ? "" : $" Ref: {dto.ReferenciaComprobante}")})"
                    : $"{dto.Observacion} ({dto.MetodoPago ?? "DIRECTO"}{(string.IsNullOrWhiteSpace(dto.ReferenciaComprobante) ? "" : $" Ref: {dto.ReferenciaComprobante}")})";

                if (cuotaPendiente != null && (decimal)cuotaPendiente.MontoCuotaUSD <= dto.MontoAbonoUSD)
                {
                    int cuotaId = (int)cuotaPendiente.Id;
                    await connection.ExecuteAsync(@"
                        UPDATE TB_ADELANTOS_CUOTAS
                        SET MontoCobradoUSD = @MontoAbonoUSD,
                            TasaBcvAplicada = @tasa,
                            MontoCobradoBs = @montoBs,
                            Estado = 'COBRADO',
                            Observacion = @obs,
                            SemanaOperativaId = ISNULL(@SemanaOperativaId, SemanaOperativaId),
                            ModifiedAt = @fechaAbono,
                            ModifiedBy = @usuarioId
                        WHERE Id = @cuotaId", new
                    {
                        dto.MontoAbonoUSD,
                        tasa,
                        montoBs,
                        obs,
                        dto.SemanaOperativaId,
                        fechaAbono,
                        usuarioId,
                        cuotaId
                    }, transaction);
                }
                else
                {
                    int maxCuota = await connection.QuerySingleAsync<int>(
                        "SELECT ISNULL(MAX(NumeroCuota), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @AdelantoId",
                        new { dto.AdelantoId }, transaction);

                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_ADELANTOS_CUOTAS (
                            AdelantoId, NumeroCuota, SemanaOperativaId, MontoCuotaUSD,
                            MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado,
                            Observacion, CreatedAt, CreatedBy, ModifiedAt, ModifiedBy
                        ) VALUES (
                            @AdelantoId, @numCuota, @SemanaOperativaId, @MontoAbonoUSD,
                            @MontoAbonoUSD, @tasa, @montoBs, 'COBRADO',
                            @obs, @fechaAbono, @usuarioId, @fechaAbono, @usuarioId
                        )", new
                    {
                        dto.AdelantoId,
                        numCuota = maxCuota + 1,
                        dto.SemanaOperativaId,
                        dto.MontoAbonoUSD,
                        tasa,
                        montoBs,
                        obs,
                        fechaAbono,
                        usuarioId
                    }, transaction);
                }

                var totalPagado = await connection.QuerySingleAsync<decimal>(
                    "SELECT ISNULL(SUM(MontoCobradoUSD), 0) FROM TB_ADELANTOS_CUOTAS WHERE AdelantoId = @AdelantoId AND Estado = 'COBRADO'",
                    new { dto.AdelantoId }, transaction);

                decimal montoTotalUsd = (decimal)adelanto.MontoTotalUSD;
                decimal montoPendiente = Math.Max(0, montoTotalUsd - totalPagado);
                string estadoAdelanto = (montoPendiente == 0) ? "PAGADO" : "ACTIVO";

                await connection.ExecuteAsync(@"
                    UPDATE TB_ADELANTOS 
                    SET MontoPagadoUSD = @totalPagado,
                        MontoPendienteUSD = @montoPendiente,
                        Estado = @estadoAdelanto,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @usuarioId
                    WHERE Id = @AdelantoId", new
                {
                    totalPagado,
                    montoPendiente,
                    estadoAdelanto,
                    usuarioId,
                    dto.AdelantoId
                }, transaction);

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<int> ActualizarTasaAdelantosActivosAsync(string tipoEntidad, decimal tasaBcv, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var sql = @"
                UPDATE c
                SET c.TasaBcvAplicada = @tasaBcv,
                    c.ModifiedAt = GETDATE(),
                    c.ModifiedBy = @usuarioId
                FROM TB_ADELANTOS_CUOTAS c
                INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                WHERE a.TipoEntidad = @tipoEntidad
                  AND a.Estado != 'PAGADO'
                  AND a.MontoPendienteUSD > 0.001
                  AND c.Estado != 'COBRADO'
                  AND c.Estado != 'ANULADA';

                SELECT COUNT(DISTINCT a.Id)
                FROM TB_ADELANTOS a
                WHERE a.TipoEntidad = @tipoEntidad
                  AND a.Estado != 'PAGADO'
                  AND a.MontoPendienteUSD > 0.001;";

            int cant = await connection.ExecuteScalarAsync<int>(sql, new { tipoEntidad, tasaBcv, usuarioId });
            return cant;
        }
    }

}
