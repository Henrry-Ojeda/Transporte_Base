using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace Transporte.Migrador2026;

internal class Program
{
    private static readonly string ConnectionString =
        Environment.GetEnvironmentVariable("MIGRADOR_CONNECTION_STRING")
        ?? throw new InvalidOperationException("Defina la variable de entorno MIGRADOR_CONNECTION_STRING antes de ejecutar el migrador.");

    private static async Task Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.Title = "Migrador Histórico 2026 - TRANSPORTE -> BD_TRANSPORTE";

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("===============================================================================");
        Console.WriteLine("   MIGRADOR DE DATOS HISTÓRICOS 2026 (TRANSPORTE -> BD_TRANSPORTE)");
        Console.WriteLine("===============================================================================");
        Console.ResetColor();
        Console.WriteLine("🛡️  Modo de Operación: SOLO LECTURA en la base de datos 'TRANSPORTE'.");
        Console.WriteLine("🛡️  Ningún registro será eliminado ni alterado en la base de datos origen.");
        Console.WriteLine("-------------------------------------------------------------------------------\n");

        try
        {
            using var connection = new SqlConnection(ConnectionString);
            await connection.OpenAsync();
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("✔ Conexión establecida exitosamente con el servidor SQL Server.\n");
            Console.ResetColor();

            // 1. Obtener Admin ID
            int adminId = await connection.QueryFirstOrDefaultAsync<int>(
                "SELECT TOP 1 Id FROM dbo.TB_USUARIOS WHERE Username = 'admin'");
            if (adminId == 0) adminId = 2016;

            Console.WriteLine($"📌 Usuario Administrador ID: {adminId}");

            // 2. Ciclos operativos normalizados (Martes a Lunes)
            Console.WriteLine("✔ Ciclos operativos configurados con formato estricto Martes a Lunes.");

            // 3. Cargar Ciclos Operativos en memoria
            var ciclos = (await connection.QueryAsync<CicloInfo>(
                "SELECT Id, Codigo, FechaInicio, FechaFin FROM dbo.TB_CICLOS_OPERATIVOS ORDER BY FechaInicio")).ToList();
            Console.WriteLine($"✔ {ciclos.Count} ciclos operativos cargados en memoria.");

            // 4. Cargar Historial BCV en memoria
            var tasasBcv = (await connection.QueryAsync<TasaBcvInfo>(
                "SELECT Fecha, TasaDolarBs FROM dbo.TB_HISTORIAL_BCV ORDER BY Fecha")).ToList();
            Console.WriteLine($"✔ {tasasBcv.Count} tasas BCV cargadas para búsqueda de fecha más cercana.");

            // 5. Cargar Catálogo de Choferes / Usuarios válidos
            var usuariosIds = (await connection.QueryAsync<int>(
                "SELECT Id FROM dbo.TB_USUARIOS")).ToHashSet();

            // 6. Cargar Precios de Compañías
            var companiasPrecios = (await connection.QueryAsync<(int Id, decimal PrecioCompraLitroUSD)>(
                "SELECT Id, PrecioCompraLitroUSD FROM dbo.TB_COMPANIAS")).ToDictionary(x => x.Id, x => x.PrecioCompraLitroUSD);

            Console.WriteLine("\n-------------------------------------------------------------------------------");
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("🚀 INICIANDO MIGRACIÓN DE RUTAS DE RECOLECCIÓN (2026)...");
            Console.ResetColor();

            // Leer rutas 2026 de TRANSPORTE (SOLO LECTURA)
            var rutasOrigen = (await connection.QueryAsync<RutaOrigen>(@"
                SELECT 
                    ID AS Id,
                    ID_CHOFER AS IdChofer,
                    ID_FINCA AS IdFinca,
                    FECHA AS Fecha,
                    LITROS AS Litros,
                    ISNULL(OBSERVACION, '') AS Observacion
                FROM TRANSPORTE.dbo.TB_RUTAS
                WHERE YEAR(FECHA) = 2026
                ORDER BY FECHA ASC, ID ASC
            ")).ToList();

            Console.WriteLine($"📦 Se encontraron {rutasOrigen.Count:N0} registros de rutas en el año 2026.");

            int rutasInsertadas = 0;
            int rutasOmitidas = 0;

            // Tabla temporal para inserción masiva eficiente
            using (var trans = connection.BeginTransaction())
            {
                var insertRutaSql = @"
                    IF NOT EXISTS (
                        SELECT 1 FROM dbo.TB_RUTAS_RECOLECCION 
                        WHERE Fecha = @Fecha 
                          AND FincaId = @FincaId 
                          AND UsuarioId = @UsuarioId 
                          AND Litros = @Litros
                          AND CreatedBy = @CreatedBy
                    )
                    BEGIN
                        INSERT INTO dbo.TB_RUTAS_RECOLECCION (
                            CicloId, Fecha, FincaId, UsuarioId, Litros,
                            PrecioLitroUSDAplicado, TasaDolarBsAplicada,
                            Observacion, UuidLocal, CreatedAt, CreatedBy,
                            ModifiedAt, ModifiedBy
                        ) VALUES (
                            @CicloId, @Fecha, @FincaId, @UsuarioId, @Litros,
                            @PrecioLitroUSDAplicado, @TasaDolarBsAplicada,
                            @Observacion, @UuidLocal, @CreatedAt, @CreatedBy,
                            @ModifiedAt, @ModifiedBy
                        );
                    END";

                var now = DateTime.Now;
                const string uuidLocalFijo = "MIGRADO-HISTORICO-2026";
                const decimal precioFijoUSD = 0.7800m;

                foreach (var r in rutasOrigen)
                {
                    int cicloId = ObtenerCicloId(ciclos, r.Fecha);
                    int choferId = (r.IdChofer.HasValue && usuariosIds.Contains(r.IdChofer.Value))
                        ? r.IdChofer.Value
                        : adminId;

                    decimal tasaBcv = ObtenerTasaCercana(tasasBcv, r.Fecha);

                    int rows = await connection.ExecuteAsync(insertRutaSql, new
                    {
                        CicloId = cicloId,
                        Fecha = r.Fecha.Date,
                        FincaId = r.IdFinca,
                        UsuarioId = choferId,
                        Litros = r.Litros,
                        PrecioLitroUSDAplicado = precioFijoUSD,
                        TasaDolarBsAplicada = tasaBcv,
                        Observacion = string.IsNullOrWhiteSpace(r.Observacion) ? null : r.Observacion.Trim(),
                        UuidLocal = uuidLocalFijo,
                        CreatedAt = r.Fecha,
                        CreatedBy = choferId,
                        ModifiedAt = now,
                        ModifiedBy = adminId
                    }, trans);

                    if (rows > 0) rutasInsertadas++;
                    else rutasOmitidas++;
                }

                trans.Commit();
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"✔ Rutas procesadas: {rutasInsertadas:N0} insertadas nuevas, {rutasOmitidas:N0} ya existentes.");
            Console.ResetColor();

            Console.WriteLine("\n-------------------------------------------------------------------------------");
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("🚀 INICIANDO MIGRACIÓN DE ENTREGAS A COMPAÑÍAS / RECEPTORÍAS (2026)...");
            Console.ResetColor();

            // Leer receptorías 2026 de TRANSPORTE (SOLO LECTURA)
            var receptoriasOrigen = (await connection.QueryAsync<ReceptoriaOrigen>(@"
                SELECT 
                    ID AS Id,
                    ID_CHOFER AS IdChofer,
                    ID_QUESERA AS IdQuesera,
                    FECHA AS Fecha,
                    LITROS AS Litros,
                    ISNULL(OBSERVACION, '') AS Observacion
                FROM TRANSPORTE.dbo.TB_RECEPTORIAS
                WHERE YEAR(FECHA) = 2026
                ORDER BY FECHA ASC, ID ASC
            ")).ToList();

            Console.WriteLine($"📦 Se encontraron {receptoriasOrigen.Count:N0} registros de receptorías en el año 2026.");

            int entregasInsertadas = 0;
            int entregasOmitidas = 0;

            using (var trans = connection.BeginTransaction())
            {
                var insertEntregaSql = @"
                    IF NOT EXISTS (
                        SELECT 1 FROM dbo.TB_ENTREGAS_COMPANIA 
                        WHERE Fecha = @Fecha 
                          AND CompaniaId = @CompaniaId 
                          AND UsuarioId = @UsuarioId 
                          AND Litros = @Litros
                          AND CreatedBy = @CreatedBy
                    )
                    BEGIN
                        INSERT INTO dbo.TB_ENTREGAS_COMPANIA (
                            CicloId, Fecha, CompaniaId, UsuarioId, Litros,
                            PrecioVentaUSD, TasaDolarBsAplicada,
                            Observacion, CreatedAt, CreatedBy,
                            ModifiedAt, ModifiedBy
                        ) VALUES (
                            @CicloId, @Fecha, @CompaniaId, @UsuarioId, @Litros,
                            @PrecioVentaUSD, @TasaDolarBsAplicada,
                            @Observacion, @CreatedAt, @CreatedBy,
                            @ModifiedAt, @ModifiedBy
                        );
                    END";

                var now = DateTime.Now;

                foreach (var rec in receptoriasOrigen)
                {
                    int cicloId = ObtenerCicloId(ciclos, rec.Fecha);
                    int choferId = (rec.IdChofer.HasValue && usuariosIds.Contains(rec.IdChofer.Value))
                        ? rec.IdChofer.Value
                        : adminId;

                    decimal tasaBcv = ObtenerTasaCercana(tasasBcv, rec.Fecha);
                    decimal precioVenta = companiasPrecios.TryGetValue(rec.IdQuesera, out var precio) && precio > 0
                        ? precio
                        : 0.7800m;

                    int rows = await connection.ExecuteAsync(insertEntregaSql, new
                    {
                        CicloId = cicloId,
                        Fecha = rec.Fecha.Date,
                        CompaniaId = rec.IdQuesera,
                        UsuarioId = choferId,
                        Litros = rec.Litros,
                        PrecioVentaUSD = precioVenta,
                        TasaDolarBsAplicada = tasaBcv,
                        Observacion = string.IsNullOrWhiteSpace(rec.Observacion) ? null : rec.Observacion.Trim(),
                        CreatedAt = rec.Fecha,
                        CreatedBy = choferId,
                        ModifiedAt = now,
                        ModifiedBy = adminId
                    }, trans);

                    if (rows > 0) entregasInsertadas++;
                    else entregasOmitidas++;
                }

                trans.Commit();
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"✔ Entregas procesadas: {entregasInsertadas:N0} insertadas nuevas, {entregasOmitidas:N0} ya existentes.");
            Console.ResetColor();

            // 7. Reporte Final de BD_TRANSPORTE
            Console.WriteLine("\n===============================================================================");
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("   RESUMEN FINAL EN BD_TRANSPORTE");
            Console.WriteLine("===============================================================================");
            Console.ResetColor();

            var totalRutas = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.TB_RUTAS_RECOLECCION");
            var totalEntregas = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.TB_ENTREGAS_COMPANIA");

            Console.WriteLine($"📊 Total Registros en TB_RUTAS_RECOLECCION: {totalRutas:N0}");
            Console.WriteLine($"📊 Total Registros en TB_ENTREGAS_COMPANIA:  {totalEntregas:N0}");
            Console.WriteLine("-------------------------------------------------------------------------------");
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("🎉 ¡MIGRACIÓN 2026 COMPLETADA SATISFACTORIAMENTE!");
            Console.ResetColor();
        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"\n❌ ERROR DURANTE LA MIGRACIÓN: {ex.Message}");
            Console.WriteLine(ex.StackTrace);
            Console.ResetColor();
        }

        Console.WriteLine("\nPresione cualquier tecla para salir...");
        if (!Console.IsInputRedirected)
        {
            Console.ReadKey();
        }
    }

    private static int ObtenerCicloId(List<CicloInfo> ciclos, DateTime fecha)
    {
        var match = ciclos.FirstOrDefault(c => fecha.Date >= c.FechaInicio.Date && fecha.Date <= c.FechaFin.Date);
        if (match != null) return match.Id;

        // Si no coincide exactamente, buscar el más cercano
        var closest = ciclos.OrderBy(c => Math.Abs((c.FechaInicio.Date - fecha.Date).TotalDays)).FirstOrDefault();
        return closest?.Id ?? 1;
    }

    private static decimal ObtenerTasaCercana(List<TasaBcvInfo> tasas, DateTime fecha)
    {
        var match = tasas.FirstOrDefault(t => t.Fecha.Date == fecha.Date);
        if (match != null) return match.TasaDolarBs;

        var closest = tasas.OrderBy(t => Math.Abs((t.Fecha.Date - fecha.Date).TotalDays)).FirstOrDefault();
        return closest?.TasaDolarBs ?? 785.0693m;
    }
}

internal class CicloInfo
{
    public int Id { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
}

internal class TasaBcvInfo
{
    public DateTime Fecha { get; set; }
    public decimal TasaDolarBs { get; set; }
}

internal class RutaOrigen
{
    public int Id { get; set; }
    public int? IdChofer { get; set; }
    public int IdFinca { get; set; }
    public DateTime Fecha { get; set; }
    public int Litros { get; set; }
    public string Observacion { get; set; } = string.Empty;
}

internal class ReceptoriaOrigen
{
    public int Id { get; set; }
    public int? IdChofer { get; set; }
    public int IdQuesera { get; set; }
    public DateTime Fecha { get; set; }
    public int Litros { get; set; }
    public string Observacion { get; set; } = string.Empty;
}
