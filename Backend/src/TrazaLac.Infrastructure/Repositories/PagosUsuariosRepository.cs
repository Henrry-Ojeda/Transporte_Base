using System.Data;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using TrazaLac.Core.DTOs;
using TrazaLac.Core.Entities;

namespace TrazaLac.Infrastructure.Repositories
{
    public interface IPagosUsuariosRepository
    {
        Task<IEnumerable<PagoUsuarioDto>> ObtenerPagosAsync(int? cicloId = null, int? usuarioId = null, string? tipoBeneficiario = null, string? estado = null);
        Task<PagoUsuarioDto?> ObtenerPagoPorIdAsync(int id);
        Task<IEnumerable<ItemCalculoPagoUsuarioDto>> CalcularLiquidacionUsuariosSemanaAsync(int cicloId);
        Task<int> CrearPagoUsuarioAsync(CrearPagoUsuarioDto dto, int? operadorId = null);
        Task<bool> ActualizarPagoUsuarioAsync(int id, EditarPagoUsuarioDto dto, int? operadorId = null);
        Task<bool> AnularPagoUsuarioAsync(int id, string motivo, int? operadorId = null);
        Task<IEnumerable<dynamic>> ObtenerAdelantosUsuariosAsync(int? usuarioId = null, string? estado = null);
        Task<int> CrearAdelantoUsuarioAsync(int usuarioId, decimal montoTotalUSD, int numeroCuotas, string? observacion, int? operadorId = null);
        Task<IEnumerable<LogPagoUsuarioDto>> ObtenerLogsPagosAsync(int? pagoId = null, int? usuarioId = null);
    }

    public class PagosUsuariosRepository : IPagosUsuariosRepository
    {
        private readonly string _connectionString;

        public PagosUsuariosRepository(IConfiguration configuration, TrazaLac.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE_V2;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        public async Task<IEnumerable<PagoUsuarioDto>> ObtenerPagosAsync(int? cicloId = null, int? usuarioId = null, string? tipoBeneficiario = null, string? estado = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT p.Id, p.UsuarioId, u.NombreCompleto, u.Cedula, u.Telefono, u.Rol,
                       p.CicloId, c.Codigo AS CicloCodigo, p.TipoBeneficiario, p.FechaPago,
                       p.TotalLitros, p.TarifaPorLitroUSD, p.MontoFijoUSD, p.TotalBrutoUSD,
                       p.TasaBcv, p.TotalBrutoBs, p.TotalAdelantosUSD, p.TotalAdelantosBs,
                       p.DescuentoLecheUSD, p.DescuentoLecheBs, p.ConceptoDescuentoLeche,
                       p.OtrasDeduccionesUSD, p.OtrasDeduccionesBs, p.ConceptoDeducciones,
                       p.TotalNetoUSD, p.TotalNetoBs, p.EstadoPago, p.MetodoPago,
                       p.BancoDestino, p.NumeroReferencia, p.Observaciones,
                       p.CreatedBy, op.NombreCompleto AS CreadoPorNombre, p.CreatedAt,
                       p.UpdatedBy, p.UpdatedAt
                FROM TB_PAGOS_USUARIOS p
                INNER JOIN TB_USUARIOS u ON p.UsuarioId = u.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS c ON p.CicloId = c.Id
                LEFT JOIN TB_USUARIOS op ON p.CreatedBy = op.Id
                WHERE 1=1 " +
                (cicloId.HasValue ? " AND p.CicloId = @cicloId " : "") +
                (usuarioId.HasValue ? " AND p.UsuarioId = @usuarioId " : "") +
                (!string.IsNullOrWhiteSpace(tipoBeneficiario) ? " AND p.TipoBeneficiario = @tipoBeneficiario " : "") +
                (!string.IsNullOrWhiteSpace(estado) ? " AND p.EstadoPago = @estado " : "") + @"
                ORDER BY p.FechaPago DESC, p.Id DESC";

            return await connection.QueryAsync<PagoUsuarioDto>(sql, new { cicloId, usuarioId, tipoBeneficiario, estado });
        }

        public async Task<PagoUsuarioDto?> ObtenerPagoPorIdAsync(int id)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT p.Id, p.UsuarioId, u.NombreCompleto, u.Cedula, u.Telefono, u.Rol,
                       p.CicloId, c.Codigo AS CicloCodigo, p.TipoBeneficiario, p.FechaPago,
                       p.TotalLitros, p.TarifaPorLitroUSD, p.MontoFijoUSD, p.TotalBrutoUSD,
                       p.TasaBcv, p.TotalBrutoBs, p.TotalAdelantosUSD, p.TotalAdelantosBs,
                       p.DescuentoLecheUSD, p.DescuentoLecheBs, p.ConceptoDescuentoLeche,
                       p.OtrasDeduccionesUSD, p.OtrasDeduccionesBs, p.ConceptoDeducciones,
                       p.TotalNetoUSD, p.TotalNetoBs, p.EstadoPago, p.MetodoPago,
                       p.BancoDestino, p.NumeroReferencia, p.Observaciones,
                       p.CreatedBy, op.NombreCompleto AS CreadoPorNombre, p.CreatedAt,
                       p.UpdatedBy, p.UpdatedAt
                FROM TB_PAGOS_USUARIOS p
                INNER JOIN TB_USUARIOS u ON p.UsuarioId = u.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS c ON p.CicloId = c.Id
                LEFT JOIN TB_USUARIOS op ON p.CreatedBy = op.Id
                WHERE p.Id = @id";

            return await connection.QueryFirstOrDefaultAsync<PagoUsuarioDto>(sql, new { id });
        }

        public async Task<IEnumerable<ItemCalculoPagoUsuarioDto>> CalcularLiquidacionUsuariosSemanaAsync(int cicloId)
        {
            using var connection = new SqlConnection(_connectionString);
            
            // 1. Obtener ciclo operativo
            var ciclo = await connection.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT Id, Codigo, FechaInicio, FechaFin FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloId",
                new { cicloId });

            if (ciclo == null) return Enumerable.Empty<ItemCalculoPagoUsuarioDto>();

            DateTime fechaInicio = ciclo.FechaInicio;
            DateTime fechaFin = ciclo.FechaFin;

            // 2. Obtener usuarios tipo CHOFER o MATERA activos
            var usuarios = await connection.QueryAsync<dynamic>(@"
                SELECT u.Id, u.NombreCompleto, u.Cedula, u.Telefono, u.Rol, 
                       ISNULL(u.TarifaPorLitro, 0) AS TarifaPorLitro,
                       ISNULL(u.SueldoBase, 0) AS SueldoBase,
                       ISNULL(u.FrecuenciaPago, 'Semanal') AS FrecuenciaPago,
                       ISNULL(u.TipoPago, 'Variado') AS TipoPago
                FROM TB_USUARIOS u
                WHERE u.Activo = 1
                ORDER BY u.Rol, u.NombreCompleto");

            var items = new List<ItemCalculoPagoUsuarioDto>();

            foreach (var u in usuarios)
            {
                int uId = u.Id;
                string rol = u.Rol?.ToString() ?? "CHOFER";
                decimal tarifa = Convert.ToDecimal(u.TarifaPorLitro);
                decimal sueldoBase = Convert.ToDecimal(u.SueldoBase);
                string tipoPago = u.TipoPago?.ToString() ?? "Variado";

                // 3. Litros y viajes en la semana operativa (desde TB_RUTAS_RECOLECCION y TB_CONTROL_RUTAS)
                var statsRuta = await connection.QueryFirstOrDefaultAsync<dynamic>(@"
                    SELECT 
                        COUNT(DISTINCT r.Id) AS TotalViajes,
                        ISNULL(SUM(r.Litros), 0) AS TotalRecolectados,
                        ISNULL(SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END), 0) AS TotalAcida,
                        (
                            SELECT ISNULL(SUM(ISNULL(cr.DiferenciaReceptoria, ISNULL(cr.DiferenciaLitros, 0))), 0)
                            FROM TB_CONTROL_RUTAS cr
                            WHERE cr.UsuarioId = @uId AND (cr.CicloId = @cicloId OR (cr.Fecha >= @fechaInicio AND cr.Fecha <= @fechaFin))
                        ) AS TotalMerma,
                        (
                            SELECT ISNULL(SUM(ISNULL(cr.TotalLitrosReceptoria, ISNULL(cr.LitrosRecibidosReceptoria, 0))), 0)
                            FROM TB_CONTROL_RUTAS cr
                            WHERE cr.UsuarioId = @uId AND (cr.CicloId = @cicloId OR (cr.Fecha >= @fechaInicio AND cr.Fecha <= @fechaFin))
                        ) AS TotalEntregados
                    FROM TB_RUTAS_RECOLECCION r
                    WHERE r.UsuarioId = @uId AND (r.CicloId = @cicloId OR (r.Fecha >= @fechaInicio AND r.Fecha <= @fechaFin))",
                    new { uId, cicloId, fechaInicio, fechaFin });

                decimal litrosRecolectados = statsRuta != null ? Convert.ToDecimal(statsRuta.TotalRecolectados) : 0;
                decimal litrosEntregados = statsRuta != null ? Convert.ToDecimal(statsRuta.TotalEntregados) : 0;
                decimal litrosAcida = statsRuta != null ? Convert.ToDecimal(statsRuta.TotalAcida) : 0;
                decimal litrosMerma = statsRuta != null ? Convert.ToDecimal(statsRuta.TotalMerma) : 0;
                int totalViajes = statsRuta != null ? Convert.ToInt32(statsRuta.TotalViajes) : 0;

                // Para chofer, el volumen base suele ser litros recolectados o entregados
                decimal litrosBase = litrosRecolectados > 0 ? litrosRecolectados : litrosEntregados;
                decimal montoBruto = 0;

                if (tipoPago == "Fijo" || rol == "MATERA")
                {
                    montoBruto = sueldoBase > 0 ? sueldoBase : Math.Round(litrosBase * tarifa, 2);
                }
                else
                {
                    montoBruto = Math.Round((litrosBase * tarifa) + sueldoBase, 2);
                }

                // 4. Buscar pagos existentes en este ciclo
                var pagoExistente = await connection.QueryFirstOrDefaultAsync<dynamic>(@"
                    SELECT TOP 1 Id, EstadoPago, TotalNetoUSD
                    FROM TB_PAGOS_USUARIOS
                    WHERE UsuarioId = @uId AND CicloId = @cicloId AND EstadoPago <> 'ANULADO'
                    ORDER BY Id DESC",
                    new { uId, cicloId });

                // 5. Buscar adelantos pendientes y cuotas
                var cuotasPendientesRaw = await connection.QueryAsync<dynamic>(@"
                    SELECT c.Id AS CuotaId, c.AdelantoId, c.NumeroCuota, c.MontoCuotaUSD, a.Observacion
                    FROM TB_ADELANTOS_CUOTAS c
                    INNER JOIN TB_ADELANTOS a ON c.AdelantoId = a.Id
                    WHERE a.TipoEntidad IN ('USUARIO', 'CHOFER', 'MATERA') 
                      AND a.EntidadId = @uId 
                      AND c.Estado = 'PENDIENTE'
                      AND a.Estado = 'APROBADO'
                    ORDER BY c.NumeroCuota ASC",
                    new { uId });

                var cuotasList = new List<CuotaAdelantoPendienteDto>();
                decimal adelantoPendienteTotal = 0;
                decimal cuotaSugerida = 0;

                foreach (var c in cuotasPendientesRaw)
                {
                    decimal m = Convert.ToDecimal(c.MontoCuotaUSD);
                    cuotasList.Add(new CuotaAdelantoPendienteDto
                    {
                        CuotaId = c.CuotaId,
                        AdelantoId = c.AdelantoId,
                        NumeroCuota = c.NumeroCuota,
                        MontoCuotaUSD = m,
                        Observacion = c.Observacion
                    });
                    adelantoPendienteTotal += m;
                }

                if (cuotasList.Any())
                {
                    cuotaSugerida = cuotasList.First().MontoCuotaUSD;
                }

                items.Add(new ItemCalculoPagoUsuarioDto
                {
                    UsuarioId = uId,
                    NombreCompleto = u.NombreCompleto?.ToString() ?? "",
                    Cedula = u.Cedula?.ToString(),
                    Telefono = u.Telefono?.ToString(),
                    Rol = rol,
                    TarifaPorLitroUSD = tarifa,
                    TotalLitrosRecolectados = litrosRecolectados,
                    TotalLitrosEntregados = litrosEntregados,
                    TotalLitrosAcida = litrosAcida,
                    TotalLitrosMerma = litrosMerma,
                    TotalViajes = totalViajes,
                    MontoBrutoCalculadoUSD = montoBruto,
                    AdelantoPendienteTotalUSD = adelantoPendienteTotal,
                    CuotaAdelantoSugeridaUSD = cuotaSugerida,
                    CuotasPendientes = cuotasList,
                    YaLiquidadoEnCiclo = pagoExistente != null,
                    PagoIdExistente = pagoExistente != null ? Convert.ToInt32(pagoExistente.Id) : null,
                    EstadoPagoExistente = pagoExistente?.EstadoPago?.ToString(),
                    TotalNetoPagadoUSD = pagoExistente != null ? Convert.ToDecimal(pagoExistente.TotalNetoUSD) : null
                });
            }

            return items;
        }

        public async Task<int> CrearPagoUsuarioAsync(CrearPagoUsuarioDto dto, int? operadorId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                DateTime fechaPago = dto.FechaPago ?? DateTime.Now;

                // 1. Obtener Tasa BCV si no viene
                decimal tasaBcv = dto.TasaBcv ?? 0;
                if (tasaBcv <= 0)
                {
                    var tasaDb = await connection.QueryFirstOrDefaultAsync<decimal?>(@"
                        SELECT TOP 1 TasaOficial 
                        FROM TB_HISTORIAL_BCV 
                        WHERE CAST(Fecha AS date) <= CAST(@fechaPago AS date)
                        ORDER BY Fecha DESC",
                        new { fechaPago }, transaction);

                    tasaBcv = tasaDb ?? 36.50m;
                }

                // 2. Cálculos Financieros
                decimal totalBrutoUSD = dto.TotalBrutoUSD ?? ((dto.TotalLitros * dto.TarifaPorLitroUSD) + dto.MontoFijoUSD);
                decimal totalBrutoBs = Math.Round(totalBrutoUSD * tasaBcv, 2);

                decimal totalAdelantosUSD = dto.TotalAdelantosUSD;
                decimal totalAdelantosBs = Math.Round(totalAdelantosUSD * tasaBcv, 2);

                decimal descuentoLecheUSD = dto.DescuentoLecheUSD;
                decimal descuentoLecheBs = Math.Round(descuentoLecheUSD * tasaBcv, 2);

                decimal otrasDeduccionesUSD = dto.OtrasDeduccionesUSD;
                decimal otrasDeduccionesBs = Math.Round(otrasDeduccionesUSD * tasaBcv, 2);

                decimal totalNetoUSD = dto.TotalNetoUSD ?? (totalBrutoUSD - totalAdelantosUSD - descuentoLecheUSD - otrasDeduccionesUSD);
                decimal totalNetoBs = Math.Round(totalNetoUSD * tasaBcv, 2);

                // 3. Insertar Pago
                var sqlInsert = @"
                    INSERT INTO TB_PAGOS_USUARIOS (
                        UsuarioId, CicloId, TipoBeneficiario, FechaPago, TotalLitros, TarifaPorLitroUSD, MontoFijoUSD,
                        TotalBrutoUSD, TasaBcv, TotalBrutoBs, TotalAdelantosUSD, TotalAdelantosBs,
                        DescuentoLecheUSD, DescuentoLecheBs, ConceptoDescuentoLeche,
                        OtrasDeduccionesUSD, OtrasDeduccionesBs, ConceptoDeducciones,
                        TotalNetoUSD, TotalNetoBs, EstadoPago, MetodoPago, BancoDestino, NumeroReferencia, Observaciones,
                        CreatedBy, CreatedAt
                    ) VALUES (
                        @UsuarioId, @CicloId, @TipoBeneficiario, @FechaPago, @TotalLitros, @TarifaPorLitroUSD, @MontoFijoUSD,
                        @TotalBrutoUSD, @TasaBcv, @TotalBrutoBs, @TotalAdelantosUSD, @TotalAdelantosBs,
                        @DescuentoLecheUSD, @DescuentoLecheBs, @ConceptoDescuentoLeche,
                        @OtrasDeduccionesUSD, @OtrasDeduccionesBs, @ConceptoDeducciones,
                        @TotalNetoUSD, @TotalNetoBs, @EstadoPago, @MetodoPago, @BancoDestino, @NumeroReferencia, @Observaciones,
                        @CreatedBy, GETDATE()
                    );
                    SELECT CAST(SCOPE_IDENTITY() AS int);";

                int pagoId = await connection.ExecuteScalarAsync<int>(sqlInsert, new
                {
                    dto.UsuarioId,
                    dto.CicloId,
                    dto.TipoBeneficiario,
                    FechaPago = fechaPago,
                    dto.TotalLitros,
                    dto.TarifaPorLitroUSD,
                    dto.MontoFijoUSD,
                    TotalBrutoUSD = totalBrutoUSD,
                    TasaBcv = tasaBcv,
                    TotalBrutoBs = totalBrutoBs,
                    TotalAdelantosUSD = totalAdelantosUSD,
                    TotalAdelantosBs = totalAdelantosBs,
                    DescuentoLecheUSD = descuentoLecheUSD,
                    DescuentoLecheBs = descuentoLecheBs,
                    dto.ConceptoDescuentoLeche,
                    OtrasDeduccionesUSD = otrasDeduccionesUSD,
                    OtrasDeduccionesBs = otrasDeduccionesBs,
                    dto.ConceptoDeducciones,
                    TotalNetoUSD = totalNetoUSD,
                    TotalNetoBs = totalNetoBs,
                    dto.EstadoPago,
                    dto.MetodoPago,
                    dto.BancoDestino,
                    dto.NumeroReferencia,
                    dto.Observaciones,
                    CreatedBy = operadorId
                }, transaction);

                // 4. Amortizar cuotas de adelantos si se especificaron
                if (dto.CuotasAdelantoIds != null && dto.CuotasAdelantoIds.Any())
                {
                    foreach (var cuotaId in dto.CuotasAdelantoIds)
                    {
                        var cuota = await connection.QueryFirstOrDefaultAsync<dynamic>(
                            "SELECT AdelantoId, MontoCuotaUSD FROM TB_ADELANTOS_CUOTAS WHERE Id = @cuotaId",
                            new { cuotaId }, transaction);

                        if (cuota != null)
                        {
                            decimal montoCuota = Convert.ToDecimal(cuota.MontoCuotaUSD);
                            int adelantoId = Convert.ToInt32(cuota.AdelantoId);

                            await connection.ExecuteAsync(@"
                                UPDATE TB_ADELANTOS_CUOTAS 
                                SET Estado = 'COBRADA', 
                                    MontoCobradoUSD = @montoCuota, 
                                    TasaBcvAplicada = @tasaBcv,
                                    MontoCobradoBs = @montoBs,
                                    ModifiedAt = GETDATE(),
                                    ModifiedBy = @operadorId
                                WHERE Id = @cuotaId",
                                new { cuotaId, montoCuota, tasaBcv, montoBs = Math.Round(montoCuota * tasaBcv, 2), operadorId },
                                transaction);

                            await connection.ExecuteAsync(@"
                                UPDATE TB_ADELANTOS 
                                SET MontoPagadoUSD = MontoPagadoUSD + @montoCuota,
                                    MontoPendienteUSD = CASE WHEN MontoPendienteUSD - @montoCuota <= 0 THEN 0 ELSE MontoPendienteUSD - @montoCuota END,
                                    Estado = CASE WHEN MontoPendienteUSD - @montoCuota <= 0 THEN 'PAGADO' ELSE Estado END,
                                    ModifiedAt = GETDATE(),
                                    ModifiedBy = @operadorId
                                WHERE Id = @adelantoId",
                                new { adelantoId, montoCuota, operadorId },
                                transaction);
                        }
                    }
                }

                // 5. Registrar Log de Auditoría
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_LOGS_PAGOS_USUARIOS (PagoUsuarioId, UsuarioId, Accion, Detalle, UsuarioOperadorId, Fecha)
                    VALUES (@pagoId, @UsuarioId, 'CREAR_PAGO', @Detalle, @operadorId, GETDATE())",
                    new
                    {
                        pagoId,
                        dto.UsuarioId,
                        Detalle = $"Pago creado #{pagoId} por Total Neto: ${totalNetoUSD:N2} (Bs. {totalNetoBs:N2}) | Litros: {dto.TotalLitros:N2} | Tarifa: ${dto.TarifaPorLitroUSD:N4} | Adelantos: ${totalAdelantosUSD:N2} | Descuento Leche: ${descuentoLecheUSD:N2}",
                        operadorId
                    }, transaction);

                transaction.Commit();
                return pagoId;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> ActualizarPagoUsuarioAsync(int id, EditarPagoUsuarioDto dto, int? operadorId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var pagoPrevio = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM TB_PAGOS_USUARIOS WHERE Id = @id",
                    new { id }, transaction);

                if (pagoPrevio == null) return false;

                decimal tasaBcv = dto.TasaBcv ?? Convert.ToDecimal(pagoPrevio.TasaBcv);
                decimal totalBrutoUSD = dto.TotalBrutoUSD ?? ((dto.TotalLitros * dto.TarifaPorLitroUSD) + dto.MontoFijoUSD);
                decimal totalBrutoBs = Math.Round(totalBrutoUSD * tasaBcv, 2);

                decimal totalAdelantosUSD = dto.TotalAdelantosUSD;
                decimal totalAdelantosBs = Math.Round(totalAdelantosUSD * tasaBcv, 2);

                decimal descuentoLecheUSD = dto.DescuentoLecheUSD;
                decimal descuentoLecheBs = Math.Round(descuentoLecheUSD * tasaBcv, 2);

                decimal otrasDeduccionesUSD = dto.OtrasDeduccionesUSD;
                decimal otrasDeduccionesBs = Math.Round(otrasDeduccionesUSD * tasaBcv, 2);

                decimal totalNetoUSD = dto.TotalNetoUSD ?? (totalBrutoUSD - totalAdelantosUSD - descuentoLecheUSD - otrasDeduccionesUSD);
                decimal totalNetoBs = Math.Round(totalNetoUSD * tasaBcv, 2);

                var sqlUpdate = @"
                    UPDATE TB_PAGOS_USUARIOS
                    SET TotalLitros = @TotalLitros,
                        TarifaPorLitroUSD = @TarifaPorLitroUSD,
                        MontoFijoUSD = @MontoFijoUSD,
                        TotalBrutoUSD = @TotalBrutoUSD,
                        TasaBcv = @TasaBcv,
                        TotalBrutoBs = @TotalBrutoBs,
                        TotalAdelantosUSD = @TotalAdelantosUSD,
                        TotalAdelantosBs = @TotalAdelantosBs,
                        DescuentoLecheUSD = @DescuentoLecheUSD,
                        DescuentoLecheBs = @DescuentoLecheBs,
                        ConceptoDescuentoLeche = @ConceptoDescuentoLeche,
                        OtrasDeduccionesUSD = @OtrasDeduccionesUSD,
                        OtrasDeduccionesBs = @OtrasDeduccionesBs,
                        ConceptoDeducciones = @ConceptoDeducciones,
                        TotalNetoUSD = @TotalNetoUSD,
                        TotalNetoBs = @TotalNetoBs,
                        EstadoPago = @EstadoPago,
                        MetodoPago = @MetodoPago,
                        BancoDestino = @BancoDestino,
                        NumeroReferencia = @NumeroReferencia,
                        Observaciones = @Observaciones,
                        UpdatedBy = @UpdatedBy,
                        UpdatedAt = GETDATE()
                    WHERE Id = @id";

                var rows = await connection.ExecuteAsync(sqlUpdate, new
                {
                    id,
                    dto.TotalLitros,
                    dto.TarifaPorLitroUSD,
                    dto.MontoFijoUSD,
                    TotalBrutoUSD = totalBrutoUSD,
                    TasaBcv = tasaBcv,
                    TotalBrutoBs = totalBrutoBs,
                    TotalAdelantosUSD = totalAdelantosUSD,
                    TotalAdelantosBs = totalAdelantosBs,
                    DescuentoLecheUSD = descuentoLecheUSD,
                    DescuentoLecheBs = descuentoLecheBs,
                    dto.ConceptoDescuentoLeche,
                    OtrasDeduccionesUSD = otrasDeduccionesUSD,
                    OtrasDeduccionesBs = otrasDeduccionesBs,
                    dto.ConceptoDeducciones,
                    TotalNetoUSD = totalNetoUSD,
                    TotalNetoBs = totalNetoBs,
                    dto.EstadoPago,
                    dto.MetodoPago,
                    dto.BancoDestino,
                    dto.NumeroReferencia,
                    dto.Observaciones,
                    UpdatedBy = operadorId
                }, transaction);

                // Registrar Log
                int usuarioId = Convert.ToInt32(pagoPrevio.UsuarioId);
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_LOGS_PAGOS_USUARIOS (PagoUsuarioId, UsuarioId, Accion, Detalle, UsuarioOperadorId, Fecha)
                    VALUES (@id, @usuarioId, 'EDITAR_PAGO', @Detalle, @operadorId, GETDATE())",
                    new
                    {
                        id,
                        usuarioId,
                        Detalle = $"Pago modificado #{id}. Motivo: {dto.MotivoModificacion} | Neto anterior: ${Convert.ToDecimal(pagoPrevio.TotalNetoUSD):N2} -> Nuevo: ${totalNetoUSD:N2}",
                        operadorId
                    }, transaction);

                transaction.Commit();
                return rows > 0;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<bool> AnularPagoUsuarioAsync(int id, string motivo, int? operadorId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var pagoPrevio = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM TB_PAGOS_USUARIOS WHERE Id = @id",
                    new { id }, transaction);

                if (pagoPrevio == null) return false;

                var rows = await connection.ExecuteAsync(@"
                    UPDATE TB_PAGOS_USUARIOS 
                    SET EstadoPago = 'ANULADO', Observaciones = ISNULL(Observaciones, '') + ' [ANULADO: ' + @motivo + ']',
                        UpdatedBy = @operadorId, UpdatedAt = GETDATE()
                    WHERE Id = @id",
                    new { id, motivo, operadorId }, transaction);

                int usuarioId = Convert.ToInt32(pagoPrevio.UsuarioId);
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_LOGS_PAGOS_USUARIOS (PagoUsuarioId, UsuarioId, Accion, Detalle, UsuarioOperadorId, Fecha)
                    VALUES (@id, @usuarioId, 'ANULAR_PAGO', @Detalle, @operadorId, GETDATE())",
                    new
                    {
                        id,
                        usuarioId,
                        Detalle = $"Pago #{id} ANULADO. Motivo: {motivo}",
                        operadorId
                    }, transaction);

                transaction.Commit();
                return rows > 0;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<IEnumerable<dynamic>> ObtenerAdelantosUsuariosAsync(int? usuarioId = null, string? estado = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT a.Id, a.TipoEntidad, a.EntidadId, u.NombreCompleto AS UsuarioNombre, u.Cedula, u.Rol,
                       a.FechaSolicitud, a.MontoTotalUSD, a.NumeroCuotas, a.MontoCuotaUSD,
                       a.MontoPagadoUSD, a.MontoPendienteUSD, a.Estado, a.Observacion, a.CreatedAt
                FROM TB_ADELANTOS a
                INNER JOIN TB_USUARIOS u ON a.EntidadId = u.Id
                WHERE a.TipoEntidad IN ('USUARIO', 'CHOFER', 'MATERA') " +
                (usuarioId.HasValue ? " AND a.EntidadId = @usuarioId " : "") +
                (!string.IsNullOrWhiteSpace(estado) ? " AND a.Estado = @estado " : "") + @"
                ORDER BY a.FechaSolicitud DESC, a.Id DESC";

            return await connection.QueryAsync<dynamic>(sql, new { usuarioId, estado });
        }

        public async Task<int> CrearAdelantoUsuarioAsync(int usuarioId, decimal montoTotalUSD, int numeroCuotas, string? observacion, int? operadorId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                if (numeroCuotas <= 0) numeroCuotas = 1;
                decimal montoCuota = Math.Round(montoTotalUSD / numeroCuotas, 2);

                var sqlInsert = @"
                    INSERT INTO TB_ADELANTOS (
                        TipoEntidad, EntidadId, FechaSolicitud, MontoTotalUSD, NumeroCuotas, MontoCuotaUSD,
                        MontoPagadoUSD, MontoPendienteUSD, Estado, Observacion, CreatedAt, CreatedBy
                    ) VALUES (
                        'USUARIO', @usuarioId, GETDATE(), @montoTotalUSD, @numeroCuotas, @montoCuota,
                        0, @montoTotalUSD, 'APROBADO', @observacion, GETDATE(), @operadorId
                    );
                    SELECT CAST(SCOPE_IDENTITY() AS int);";

                int adelantoId = await connection.ExecuteScalarAsync<int>(sqlInsert, new
                {
                    usuarioId,
                    montoTotalUSD,
                    numeroCuotas,
                    montoCuota,
                    observacion,
                    operadorId
                }, transaction);

                // Crear cuotas
                for (int i = 1; i <= numeroCuotas; i++)
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_ADELANTOS_CUOTAS (
                            AdelantoId, NumeroCuota, MontoCuotaUSD, MontoCobradoUSD, TasaBcvAplicada, MontoCobradoBs, Estado, CreatedAt, CreatedBy
                        ) VALUES (
                            @adelantoId, @numeroCuota, @montoCuota, 0, 0, 0, 'PENDIENTE', GETDATE(), @operadorId
                        )",
                        new { adelantoId, numeroCuota = i, montoCuota, operadorId },
                        transaction);
                }

                // Log
                await connection.ExecuteAsync(@"
                    INSERT INTO TB_LOGS_PAGOS_USUARIOS (AdelantoId, UsuarioId, Accion, Detalle, UsuarioOperadorId, Fecha)
                    VALUES (@adelantoId, @usuarioId, 'CREAR_ADELANTO', @Detalle, @operadorId, GETDATE())",
                    new
                    {
                        adelantoId,
                        usuarioId,
                        Detalle = $"Adelanto/Préstamo creado #{adelantoId} por ${montoTotalUSD:N2} en {numeroCuotas} cuotas de ${montoCuota:N2}. Motivo: {observacion}",
                        operadorId
                    }, transaction);

                transaction.Commit();
                return adelantoId;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task<IEnumerable<LogPagoUsuarioDto>> ObtenerLogsPagosAsync(int? pagoId = null, int? usuarioId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT l.Id, l.PagoUsuarioId, l.AdelantoId, l.UsuarioId,
                       u.NombreCompleto AS BeneficiarioNombre,
                       l.Accion, l.Detalle, l.UsuarioOperadorId,
                       op.NombreCompleto AS OperadorNombre, l.Fecha
                FROM TB_LOGS_PAGOS_USUARIOS l
                LEFT JOIN TB_USUARIOS u ON l.UsuarioId = u.Id
                LEFT JOIN TB_USUARIOS op ON l.UsuarioOperadorId = op.Id
                WHERE 1=1 " +
                (pagoId.HasValue ? " AND l.PagoUsuarioId = @pagoId " : "") +
                (usuarioId.HasValue ? " AND l.UsuarioId = @usuarioId " : "") + @"
                ORDER BY l.Fecha DESC, l.Id DESC";

            return await connection.QueryAsync<LogPagoUsuarioDto>(sql, new { pagoId, usuarioId });
        }
    }
}
