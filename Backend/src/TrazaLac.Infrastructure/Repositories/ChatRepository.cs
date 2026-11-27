using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using TrazaLac.Core.DTOs;
using TrazaLac.Core.Entities;

namespace TrazaLac.Infrastructure.Repositories
{
    public interface IChatRepository
    {
        Task<ChatResponseDto> AnalizarDatosSistemaAsync(string mensaje);
        Task<IEnumerable<string>> ObtenerSugerenciasPromptAsync();
    }

    public class ChatRepository : IChatRepository
    {
        private readonly string _connectionString;
        private readonly string _geminiApiKey;
        private readonly TrazaLac.Core.Interfaces.ITenantService? _tenantService;
        private static readonly HttpClient _httpClient = new HttpClient();

        public ChatRepository(IConfiguration configuration, TrazaLac.Core.Interfaces.ITenantService? tenantService = null)
        {
            _tenantService = tenantService;
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection")
                ?? configuration.GetConnectionString("BD_TRANSPORTE")
                ?? "";
            _geminiApiKey = configuration["Gemini:ApiKey"] 
                ?? Environment.GetEnvironmentVariable("Gemini__ApiKey")
                ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY") 
                ?? "";
        }

        public async Task<IEnumerable<string>> ObtenerSugerenciasPromptAsync()
        {
            return await Task.FromResult(new List<string>
            {
                "ðŸ“Š Â¿CuÃ¡l es el diagnÃ³stico general del ciclo actual?",
                "âš ï¸ Â¿DÃ³nde estÃ¡n los mayores problemas de merma?",
                "ðŸšœ Â¿CuÃ¡les fincas o choferes presentan descuadres?",
                "ðŸ’° Estado de adelantos y prÃ©stamos pendientes por cobrar",
                "ðŸ§ª Evaluar mermas por leche Ã¡cida o pÃ©rdida de calidad",
                "ðŸš› Estado de la flota, combustible, mantenimientos y repuestos"
            });
        }

        private bool PuedeTabla(string tabla, string? moduloRequerido = null)
            => _tenantService == null || _tenantService.PuedeConsultarTablaAi(tabla, moduloRequerido);

        public async Task<ChatResponseDto> AnalizarDatosSistemaAsync(string mensaje)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var tablasHabilitadas = new List<string>();
            void RegistrarTabla(string t, string? mod = null)
            {
                if (PuedeTabla(t, mod)) tablasHabilitadas.Add(t);
            }
            RegistrarTabla("TB_CICLOS_OPERATIVOS");
            RegistrarTabla("TB_CONTROL_RUTAS");
            RegistrarTabla("TB_RUTAS_RECOLECCION");
            RegistrarTabla("TB_FINCAS");
            RegistrarTabla("TB_TIPO_SERVICIO");
            RegistrarTabla("TB_USUARIOS");
            RegistrarTabla("TB_CONTROL_COMPANIAS", "MOD_RECEPTORIA");
            RegistrarTabla("TB_ENTREGAS_COMPANIA", "MOD_RECEPTORIA");
            RegistrarTabla("TB_COMPANIAS", "MOD_RECEPTORIA");
            RegistrarTabla("TB_ADELANTOS", "MOD_LIQUIDACIONES");
            RegistrarTabla("TB_HISTORIAL_BCV", "MOD_HISTORIAL_BCV");
            RegistrarTabla("TB_CAMIONES");
            RegistrarTabla("TB_MANTENIMIENTO_CAMIONES", "MOD_MANTENIMIENTO");
            RegistrarTabla("TB_COMBUSTIBLE_INVENTARIO", "MOD_COMBUSTIBLE");
            RegistrarTabla("TB_COMBUSTIBLE_HISTORIAL", "MOD_COMBUSTIBLE");
            RegistrarTabla("TB_INVENTARIO_REPUESTOS", "MOD_REPUESTOS");
            RegistrarTabla("TB_MOVIMIENTOS_REPUESTOS", "MOD_REPUESTOS");

            // ====================================================
            // 0. BÃšSQUEDA DIRECTA Y AUDITORÃA INTELIGENTE POR CIFRAS O ENTIDADES
            // ====================================================
            var hallazgosDirectos = new System.Text.StringBuilder();
            try
            {
                var matchesNumeros = System.Text.RegularExpressions.Regex.Matches(mensaje ?? "", @"-?\b\d+(?:[\.,]\d+)?\b");
                var numerosBuscados = new HashSet<decimal>();
                foreach (System.Text.RegularExpressions.Match m in matchesNumeros)
                {
                    string limpia = m.Value.Replace(".", "").Replace(",", ".");
                    if (decimal.TryParse(limpia, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out decimal n))
                    {
                        numerosBuscados.Add(Math.Abs(n));
                        numerosBuscados.Add(-Math.Abs(n));
                    }
                }

                if (numerosBuscados.Any())
                {
                    var sqlRutasMatch = await connection.QueryAsync<dynamic>(@"
                        SELECT cr.Id, cr.Fecha, u.NombreCompleto AS Conductor,
                               cr.TotalLitrosFinca, cr.TotalLitrosReceptoria, cr.LitrosRecibidosReceptoria,
                               cr.DiferenciaLitros, cr.DiferenciaReceptoria, cr.Estado, cr.Observacion,
                               co.Codigo AS CicloCodigo
                        FROM TB_CONTROL_RUTAS cr
                        LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                        LEFT JOIN TB_CICLOS_OPERATIVOS co ON cr.CicloId = co.Id
                        WHERE cr.TotalLitrosFinca IN @numerosBuscados 
                           OR cr.TotalLitrosReceptoria IN @numerosBuscados
                           OR cr.DiferenciaLitros IN @numerosBuscados
                           OR cr.DiferenciaReceptoria IN @numerosBuscados
                           OR cr.MermaTotalLitros IN @numerosBuscados
                           OR cr.Id IN @numerosBuscados
                        ORDER BY cr.Fecha DESC, cr.Id DESC", new { numerosBuscados = numerosBuscados.ToList() });

                    var sqlCompMatch = await connection.QueryAsync<dynamic>(@"
                        SELECT cc.Id, cc.Fecha, u.NombreCompleto AS Conductor, c.Nombre AS Compania,
                               cc.LitrosDespachados, cc.LitrosRecibidosCompania, cc.DiferenciaLitros, cc.Estado, cc.Observacion,
                               co.Codigo AS CicloCodigo
                        FROM TB_CONTROL_COMPANIAS cc
                        LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                        LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                        LEFT JOIN TB_CICLOS_OPERATIVOS co ON cc.CicloId = co.Id
                        WHERE cc.LitrosDespachados IN @numerosBuscados
                           OR cc.LitrosRecibidosCompania IN @numerosBuscados
                           OR cc.DiferenciaLitros IN @numerosBuscados
                           OR cc.Id IN @numerosBuscados
                        ORDER BY cc.Fecha DESC, cc.Id DESC", new { numerosBuscados = numerosBuscados.ToList() });

                    if (sqlRutasMatch.Any() || sqlCompMatch.Any())
                    {
                        hallazgosDirectos.AppendLine("=== ðŸ”Ž REGISTROS EXACTOS ENCONTRADOS EN LA BD PARA LAS CIFRAS CONSULTADAS ===");
                        foreach (var rm in sqlRutasMatch)
                        {
                            string fStr = rm.Fecha != null ? ((DateTime)rm.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                            decimal fincasLts = rm.TotalLitrosFinca != null ? (decimal)rm.TotalLitrosFinca : 0m;
                            decimal recepLts = rm.TotalLitrosReceptoria != null ? (decimal)rm.TotalLitrosReceptoria : (rm.LitrosRecibidosReceptoria != null ? (decimal)rm.LitrosRecibidosReceptoria : 0m);
                            decimal dif = rm.DiferenciaLitros != null ? (decimal)rm.DiferenciaLitros : (rm.DiferenciaReceptoria != null ? (decimal)rm.DiferenciaReceptoria : (recepLts - fincasLts));

                            hallazgosDirectos.AppendLine($"[VIAJE RUTAS / RECEPTORÃA] Control de Viaje #{rm.Id} | Fecha: {fStr} | Chofer: {rm.Conductor ?? "Sin chofer"} | Ciclo: {rm.CicloCodigo ?? "N/A"}");
                            hallazgosDirectos.AppendLine($"  * Total Recolectado en Fincas: {fincasLts:N0} Lts");
                            hallazgosDirectos.AppendLine($"  * Total Recibido en ReceptorÃ­a: {recepLts:N0} Lts");
                            hallazgosDirectos.AppendLine($"  * Diferencia Registrada: {dif:N0} Lts ({(dif < 0 ? "Faltante / Merma Negativa" : (dif > 0 ? "Sobrante Positivo" : "Cuadre Exacto"))})");
                            hallazgosDirectos.AppendLine($"  * Estado: {rm.Estado} | ObservaciÃ³n: {rm.Observacion ?? "Ninguna"}");

                            // Buscar detalle de fincas de este viaje
                            var fincasDelViaje = await connection.QueryAsync<dynamic>(@"
                                SELECT f.Nombre AS Finca, r.Litros, r.EsAcida, r.TipoLeche
                                FROM TB_RUTAS_RECOLECCION r
                                LEFT JOIN TB_FINCAS f ON r.FincaId = f.Id
                                WHERE r.ControlRutaId = @controlId OR (r.Fecha = @fecha AND r.UsuarioId = (SELECT UsuarioId FROM TB_CONTROL_RUTAS WHERE Id = @controlId))",
                                new { controlId = rm.Id, fecha = rm.Fecha });

                            if (fincasDelViaje.Any())
                            {
                                var desglose = string.Join(", ", fincasDelViaje.Select(f => $"{f.Finca}: {f.Litros} Lts{(f.EsAcida == true ? " [Ãcida]" : "")}"));
                                hallazgosDirectos.AppendLine($"  * Desglose por Fincas ({fincasDelViaje.Count()} fincas): {desglose}");
                            }
                            hallazgosDirectos.AppendLine();
                        }

                        foreach (var cm in sqlCompMatch)
                        {
                            string fStr = cm.Fecha != null ? ((DateTime)cm.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                            decimal ltsDesp = cm.LitrosDespachados != null ? (decimal)cm.LitrosDespachados : 0m;
                            decimal ltsRec = cm.LitrosRecibidosCompania != null ? (decimal)cm.LitrosRecibidosCompania : 0m;
                            decimal dif = cm.DiferenciaLitros != null ? (decimal)cm.DiferenciaLitros : (ltsRec - ltsDesp);

                            hallazgosDirectos.AppendLine($"[DESPACHO COMPAÃ‘ÃA / QUESERA] Ticket Despacho #{cm.Id} | Fecha: {fStr} | Chofer: {cm.Conductor ?? "Sin chofer"} | Destino: {cm.Compania ?? "Sin destino"} | Ciclo: {cm.CicloCodigo ?? "N/A"}");
                            hallazgosDirectos.AppendLine($"  * Litros Despachados: {ltsDesp:N0} Lts | Litros Recibidos en Destino: {ltsRec:N0} Lts | Diferencia/Merma: {dif:N0} Lts");
                            hallazgosDirectos.AppendLine($"  * Estado: {cm.Estado} | Obs: {cm.Observacion ?? "Ninguna"}");
                            hallazgosDirectos.AppendLine();
                        }
                        hallazgosDirectos.AppendLine("=== FIN DE REGISTROS EXACTOS ===");
                        hallazgosDirectos.AppendLine();
                    }
                }

                // BÃºsqueda inteligente por nombre de chofer o conductor si se menciona en el mensaje (ej: 'JULIO')
                var choferesEncontrados = await connection.QueryAsync<dynamic>(@"
                    SELECT Id, NombreCompleto FROM TB_USUARIOS 
                    WHERE Rol IN ('CHOFER', 'CONDUCTOR', 'OPERADOR') AND Activo = 1");

                var choferMatch = choferesEncontrados.FirstOrDefault(c => {
                    string n = (string)(c.NombreCompleto ?? "");
                    if (string.IsNullOrWhiteSpace(n)) return false;
                    var palabras = n.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    return palabras.Any(p => p.Length >= 4 && (mensaje ?? "").IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0);
                });

                if (choferMatch != null)
                {
                    int choferId = (int)choferMatch.Id;
                    string nombreChofer = (string)choferMatch.NombreCompleto;

                    var ultimosViajesChofer = await connection.QueryAsync<dynamic>(@"
                        SELECT TOP 5 cr.Id, cr.Fecha, cr.TotalLitrosFinca, cr.TotalLitrosReceptoria,
                               cr.LitrosRecibidosReceptoria, cr.DiferenciaLitros, cr.DiferenciaReceptoria,
                               cr.MermaTotalLitros, cr.PorcentajeMerma, cr.Estado, cr.Observacion,
                               co.Codigo AS CicloCodigo
                        FROM TB_CONTROL_RUTAS cr
                        LEFT JOIN TB_CICLOS_OPERATIVOS co ON cr.CicloId = co.Id
                        WHERE cr.UsuarioId = @choferId
                        ORDER BY cr.Fecha DESC, cr.Id DESC", new { choferId });

                    if (ultimosViajesChofer.Any())
                    {
                        hallazgosDirectos.AppendLine($"=== ðŸ”Ž ÃšLTIMOS TICKETS / VIAJES ENCONTRADOS DEL CONDUCTOR: {nombreChofer} ===");
                        foreach (var v in ultimosViajesChofer)
                        {
                            string fStr = v.Fecha != null ? ((DateTime)v.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                            decimal fincasLts = v.TotalLitrosFinca != null ? (decimal)v.TotalLitrosFinca : 0m;
                            decimal recepLts = v.TotalLitrosReceptoria != null ? (decimal)v.TotalLitrosReceptoria : (v.LitrosRecibidosReceptoria != null ? (decimal)v.LitrosRecibidosReceptoria : 0m);
                            decimal dif = v.DiferenciaLitros != null ? (decimal)v.DiferenciaLitros : (v.DiferenciaReceptoria != null ? (decimal)v.DiferenciaReceptoria : (recepLts - fincasLts));

                            hallazgosDirectos.AppendLine($"â€¢ Control de Viaje #{v.Id} | Fecha: {fStr} | Estado: {v.Estado} | Ciclo: {v.CicloCodigo ?? "N/A"}");
                            hallazgosDirectos.AppendLine($"  - Litros en Finca: {fincasLts:N0} L | Litros en ReceptorÃ­a: {recepLts:N0} L | Diferencia: {dif:+0;-0;0} L (Merma: {v.PorcentajeMerma ?? 0}%)");

                            var fincasV = await connection.QueryAsync<dynamic>(@"
                                SELECT f.Nombre AS Finca, r.Litros, r.EsAcida 
                                FROM TB_RUTAS_RECOLECCION r 
                                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id 
                                WHERE r.ControlRutaId = @cid", new { cid = v.Id });

                            if (fincasV.Any())
                            {
                                var desg = string.Join(", ", fincasV.Select(f => $"{f.Finca}: {f.Litros} L"));
                                hallazgosDirectos.AppendLine($"  - Fincas Recogidas: {desg}");
                            }
                        }
                        hallazgosDirectos.AppendLine("=== FIN DE TICKETS DEL CONDUCTOR ===\n");
                    }
                }

                // DetecciÃ³n automÃ¡tica si pide anÃ¡lisis de mermas o descuadres
                if ((mensaje ?? "").IndexOf("merma", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("descuadre", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("faltante", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    var mayoresMermas = await connection.QueryAsync<dynamic>(@"
                        SELECT TOP 5 cr.Id, cr.Fecha, u.NombreCompleto AS Conductor,
                               cr.TotalLitrosFinca, cr.TotalLitrosReceptoria, cr.LitrosRecibidosReceptoria,
                               cr.DiferenciaLitros, cr.DiferenciaReceptoria, cr.MermaTotalLitros, cr.PorcentajeMerma,
                               cr.Estado, co.Codigo AS CicloCodigo
                        FROM TB_CONTROL_RUTAS cr
                        LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                        LEFT JOIN TB_CICLOS_OPERATIVOS co ON cr.CicloId = co.Id
                        WHERE cr.DiferenciaLitros < 0 OR cr.DiferenciaReceptoria < 0 OR cr.MermaTotalLitros < 0
                        ORDER BY ISNULL(cr.DiferenciaLitros, ISNULL(cr.DiferenciaReceptoria, cr.MermaTotalLitros)) ASC, cr.Fecha DESC");

                    if (mayoresMermas.Any())
                    {
                        hallazgosDirectos.AppendLine("=== âš ï¸ TICKETS RECIENTES CON MAYORES MERMAS / FALTANTES DETECTADOS ===");
                        foreach (var m in mayoresMermas)
                        {
                            string fStr = m.Fecha != null ? ((DateTime)m.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                            decimal fincasLts = m.TotalLitrosFinca != null ? (decimal)m.TotalLitrosFinca : 0m;
                            decimal recepLts = m.TotalLitrosReceptoria != null ? (decimal)m.TotalLitrosReceptoria : (m.LitrosRecibidosReceptoria != null ? (decimal)m.LitrosRecibidosReceptoria : 0m);
                            decimal dif = m.DiferenciaLitros != null ? (decimal)m.DiferenciaLitros : (m.DiferenciaReceptoria != null ? (decimal)m.DiferenciaReceptoria : (recepLts - fincasLts));
                            hallazgosDirectos.AppendLine($"â€¢ Ticket #{m.Id} ({fStr}) - Chofer: {m.Conductor} | Faltante: {dif:N0} Lts ({m.PorcentajeMerma ?? 0}% Merma) | Fincas: {fincasLts:N0} L -> Recibido: {recepLts:N0} L");
                        }
                        hallazgosDirectos.AppendLine("=== FIN DE MAYORES MERMAS ===\n");
                    }
                }

                // DetecciÃ³n automÃ¡tica si pide anÃ¡lisis de fincas con problemas, leche Ã¡cida o calidad
                if ((mensaje ?? "").IndexOf("finca", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("problema", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("acida", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("Ã¡cida", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("daÃ±ada", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("calidad", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (mensaje ?? "").IndexOf("peor", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    var fincasConProblemas = await connection.QueryAsync<dynamic>(@"
                        SELECT TOP 10 
                            f.Id, f.Nombre AS Finca,
                            SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END) AS LitrosAcida,
                            COUNT(CASE WHEN r.EsAcida = 1 THEN 1 END) AS ViajesConAcida,
                            COUNT(r.Id) AS TotalViajes,
                            SUM(r.Litros) AS TotalLitros,
                            MAX(r.Fecha) AS UltimaFecha
                        FROM TB_RUTAS_RECOLECCION r
                        JOIN TB_FINCAS f ON r.FincaId = f.Id
                        GROUP BY f.Id, f.Nombre
                        HAVING SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END) > 0
                        ORDER BY LitrosAcida DESC");

                    if (fincasConProblemas.Any())
                    {
                        hallazgosDirectos.AppendLine("=== âš ï¸ AUDITORÃA DE FINCAS CON MAYORES PROBLEMAS DE LECHE ÃCIDA EN LA BASE DE DATOS ===");
                        int ranking = 1;
                        foreach (var fp in fincasConProblemas)
                        {
                            decimal ltsAcida = (decimal)(fp.LitrosAcida ?? 0m);
                            int viajesAcida = (int)(fp.ViajesConAcida ?? 0);
                            decimal totalLts = (decimal)(fp.TotalLitros ?? 0m);
                            decimal pctAcida = totalLts > 0 ? (ltsAcida / totalLts) * 100m : 0m;
                            string ultF = fp.UltimaFecha != null ? ((DateTime)fp.UltimaFecha).ToString("dd/MM/yyyy") : "N/A";

                            hallazgosDirectos.AppendLine($"{ranking}. FINCA: {fp.Finca}");
                            hallazgosDirectos.AppendLine($"   â€¢ Total Leche Ãcida Descartada: {ltsAcida:N0} Litros en {viajesAcida} viaje(s)");
                            hallazgosDirectos.AppendLine($"   â€¢ Porcentaje de Leche DaÃ±ada/Ãcida: {pctAcida:N1}% de su producciÃ³n total ({totalLts:N0} Lts)");
                            hallazgosDirectos.AppendLine($"   â€¢ Ãšltima Incidencia Registrada: {ultF}");
                            ranking++;
                        }
                        hallazgosDirectos.AppendLine("=== FIN DE FINCAS CON PROBLEMA ===\n");
                    }
                }
            }
            catch { }

            // ====================================================
            // RECOLECCIÃ“N COMPLETA DEL CONTEXTO DE LA BASE DE DATOS
            // ====================================================

            // 1. Ciclo Activo
            dynamic? cicloActivo = null;
            if (PuedeTabla("TB_CICLOS_OPERATIVOS"))
            {
                cicloActivo = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT TOP 1 Id, Codigo, FechaInicio, FechaFin, Estado FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' ORDER BY Id DESC")
                    ?? await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT TOP 1 Id, Codigo, FechaInicio, FechaFin, Estado FROM TB_CICLOS_OPERATIVOS ORDER BY Id DESC");
            }

            int cicloId = cicloActivo?.Id ?? 0;
            string cicloCodigo = cicloActivo?.Codigo ?? "Sin Ciclo";

            // 2. Tasa BCV
            decimal tasaBcv = PuedeTabla("TB_HISTORIAL_BCV", "MOD_HISTORIAL_BCV")
                ? await connection.ExecuteScalarAsync<decimal?>(
                    "SELECT TOP 1 TasaDolarBs FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC") ?? 0m
                : 0m;

            // 3. Todos los Choferes/Conductores del sistema
            var conductores = (PuedeTabla("TB_USUARIOS") && PuedeTabla("TB_RUTAS_RECOLECCION"))
                ? (await connection.QueryAsync<dynamic>(@"
                SELECT u.Id, u.NombreCompleto, u.Username, u.Rol,
                    SUM(ISNULL(r.Litros, 0)) AS TotalLitrosRecolectados,
                    COUNT(DISTINCT r.FincaId) AS TotalFincasAtendidas,
                    SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END) AS LitrosAcidos
                FROM TB_USUARIOS u
                LEFT JOIN TB_RUTAS_RECOLECCION r ON u.Id = r.UsuarioId AND r.CicloId = @cicloId
                WHERE u.Rol IN ('CONDUCTOR', 'CHOFER', 'OPERADOR') OR u.Id IN (SELECT DISTINCT UsuarioId FROM TB_RUTAS_RECOLECCION WHERE CicloId = @cicloId AND UsuarioId IS NOT NULL)
                GROUP BY u.Id, u.NombreCompleto, u.Username, u.Rol
                ORDER BY TotalLitrosRecolectados DESC", new { cicloId })).ToList()
                : new List<dynamic>();

            // DesempeÃ±o por chofer en rutas
            var choferesPorRutas = (PuedeTabla("TB_RUTAS_RECOLECCION") && PuedeTabla("TB_USUARIOS") && PuedeTabla("TB_FINCAS"))
                ? (await connection.QueryAsync<dynamic>(@"
                SELECT u.Id, u.NombreCompleto, u.Username,
                    SUM(r.Litros) AS TotalLitros,
                    COUNT(DISTINCT r.FincaId) AS TotalFincas,
                    COUNT(r.Id) AS TotalViajes,
                    SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END) AS LitrosAcidos,
                    (
                        SELECT STRING_AGG(f2.Nombre, ', ')
                        FROM (
                            SELECT DISTINCT f3.Nombre
                            FROM TB_RUTAS_RECOLECCION r2
                            INNER JOIN TB_FINCAS f3 ON r2.FincaId = f3.Id
                            WHERE r2.UsuarioId = u.Id AND r2.CicloId = @cicloId
                        ) f2
                    ) AS FincasAtendidas
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                WHERE r.CicloId = @cicloId
                GROUP BY u.Id, u.NombreCompleto, u.Username
                ORDER BY TotalLitros DESC", new { cicloId })).ToList()
                : new List<dynamic>();

            // 4. Todas las Fincas con mÃ©tricas
            var fincas = (PuedeTabla("TB_FINCAS") && PuedeTabla("TB_RUTAS_RECOLECCION"))
                ? (await connection.QueryAsync<dynamic>(@"
                SELECT f.Id, f.Nombre, f.TipoServicioId, ts.Nombre AS TipoServicio,
                    ISNULL(SUM(r.Litros), 0) AS TotalLitros,
                    ISNULL(SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END), 0) AS LitrosAcidos,
                    ISNULL(COUNT(r.Id), 0) AS TotalViajes
                FROM TB_FINCAS f
                LEFT JOIN TB_TIPO_SERVICIO ts ON f.TipoServicioId = ts.Id
                LEFT JOIN TB_RUTAS_RECOLECCION r ON f.Id = r.FincaId AND r.CicloId = @cicloId
                GROUP BY f.Id, f.Nombre, f.TipoServicioId, ts.Nombre
                ORDER BY TotalLitros DESC", new { cicloId })).ToList()
                : new List<dynamic>();

            // 5. Entregas a Plantas (Resumen de ReceptorÃ­a / CompaÃ±Ã­as)
            var entregas = (PuedeTabla("TB_ENTREGAS_COMPANIA", "MOD_RECEPTORIA") && PuedeTabla("TB_COMPANIAS", "MOD_RECEPTORIA"))
                ? (await connection.QueryAsync<dynamic>(@"
                SELECT c.Nombre AS Planta, e.Litros, e.Fecha, ts.Nombre AS TipoServicio,
                    u.NombreCompleto AS Conductor
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                LEFT JOIN TB_TIPO_SERVICIO ts ON c.TipoServicioId = ts.Id
                LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                WHERE e.CicloId = @cicloId
                ORDER BY e.Fecha DESC", new { cicloId })).ToList()
                : new List<dynamic>();

            // 6. TICKETS DETALLADOS DE SALIDA / DESPACHOS A COMPAÃ‘ÃAS (TB_CONTROL_COMPANIAS)
            var despachosDetallados = PuedeTabla("TB_CONTROL_COMPANIAS", "MOD_RECEPTORIA")
                ? (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 300 cc.Id, cc.Fecha, u.NombreCompleto AS Conductor, c.Nombre AS Compania,
                       cc.LitrosDespachados, cc.LitrosRecibidosCompania, cc.DiferenciaLitros, cc.Estado, cc.Observacion,
                       co.Codigo AS CicloCodigo
                FROM TB_CONTROL_COMPANIAS cc
                LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS co ON cc.CicloId = co.Id
                ORDER BY cc.Id DESC")).ToList()
                : new List<dynamic>();

            // 7. TICKETS DETALLADOS DE ENTREGAS A RECEPTORÃA Y COMPAÃ‘ÃAS (TB_ENTREGAS_COMPANIA)
            var entregasDetalladas = PuedeTabla("TB_ENTREGAS_COMPANIA", "MOD_RECEPTORIA")
                ? (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 300 e.Id, e.Fecha, u.NombreCompleto AS Conductor, c.Nombre AS Compania,
                       e.Litros, e.Observacion, co.Codigo AS CicloCodigo, ts.Nombre AS TipoServicio
                FROM TB_ENTREGAS_COMPANIA e
                INNER JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
                LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS co ON e.CicloId = co.Id
                LEFT JOIN TB_TIPO_SERVICIO ts ON c.TipoServicioId = ts.Id
                ORDER BY e.Id DESC")).ToList()
                : new List<dynamic>();

            // 8. CONTROLES DE VIAJES / ENTRADAS A RECEPTORÃA (TB_CONTROL_RUTAS)
            var controlesRutasDetallados = PuedeTabla("TB_CONTROL_RUTAS")
                ? (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 200 cr.Id, cr.Fecha, u.NombreCompleto AS Conductor,
                       cr.TotalLitrosFinca, cr.TotalLitrosReceptoria, cr.LitrosRecibidosReceptoria,
                       cr.DiferenciaLitros, cr.DiferenciaReceptoria, cr.Estado, cr.Observacion,
                       co.Codigo AS CicloCodigo
                FROM TB_CONTROL_RUTAS cr
                LEFT JOIN TB_USUARIOS u ON cr.UsuarioId = u.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS co ON cr.CicloId = co.Id
                ORDER BY cr.Id DESC")).ToList()
                : new List<dynamic>();

            // 9. RECOLECCIONES INDIVIDUALES EN FINCAS (TB_RUTAS_RECOLECCION)
            var recoleccionesDetalladas = PuedeTabla("TB_RUTAS_RECOLECCION")
                ? (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 250 r.Id, r.Fecha, u.NombreCompleto AS Conductor, f.Nombre AS Finca,
                       r.Litros, r.EsAcida, r.Observacion, co.Codigo AS CicloCodigo
                FROM TB_RUTAS_RECOLECCION r
                LEFT JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                LEFT JOIN TB_FINCAS f ON r.FincaId = f.Id
                LEFT JOIN TB_CICLOS_OPERATIVOS co ON r.CicloId = co.Id
                ORDER BY r.Id DESC")).ToList()
                : new List<dynamic>();

            // 10. Adelantos Activos
            var adelantos = PuedeTabla("TB_ADELANTOS", "MOD_LIQUIDACIONES")
                ? (await connection.QueryAsync<dynamic>(@"
                SELECT a.Id, a.MontoTotalUSD, a.MontoPendienteUSD, a.FechaSolicitud,
                    f.Nombre AS Beneficiario, a.TipoEntidad
                FROM TB_ADELANTOS a
                INNER JOIN TB_FINCAS f ON a.EntidadId = f.Id
                WHERE a.Estado = 'ACTIVO' AND a.MontoPendienteUSD > 0
                ORDER BY a.MontoPendienteUSD DESC", new { cicloId })).ToList()
                : new List<dynamic>();

            // 11. Historial BCV Ãºltimas fechas
            var historialBcv = PuedeTabla("TB_HISTORIAL_BCV", "MOD_HISTORIAL_BCV")
                ? (await connection.QueryAsync<dynamic>(
                    "SELECT TOP 5 TasaDolarBs, Fecha FROM TB_HISTORIAL_BCV ORDER BY Fecha DESC, Id DESC")).ToList()
                : new List<dynamic>();

            // 12. HistÃ³rico de Ãšltimos 8 Ciclos (~2 meses)
            var historicoCiclos = (PuedeTabla("TB_CICLOS_OPERATIVOS") && PuedeTabla("TB_RUTAS_RECOLECCION"))
                ? (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 8 c.Id, c.Codigo, c.FechaInicio, c.FechaFin,
                    ISNULL(SUM(r.Litros), 0) AS TotalLitrosRecolectados,
                    ISNULL(SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END), 0) AS TotalLecheAcida,
                    (SELECT ISNULL(SUM(e.Litros), 0) FROM TB_ENTREGAS_COMPANIA e WHERE e.CicloId = c.Id) AS TotalLitrosEntregados
                FROM TB_CICLOS_OPERATIVOS c
                INNER JOIN TB_RUTAS_RECOLECCION r ON c.Id = r.CicloId
                GROUP BY c.Id, c.Codigo, c.FechaInicio, c.FechaFin
                ORDER BY c.Id DESC")).ToList()
                : new List<dynamic>();

            // 13. HistÃ³rico por chofer en los Ãºltimos 8 ciclos (~2 meses)
            var historicoChoferesMeses = (PuedeTabla("TB_RUTAS_RECOLECCION") && PuedeTabla("TB_USUARIOS") && PuedeTabla("TB_CICLOS_OPERATIVOS"))
                ? (await connection.QueryAsync<dynamic>(@"
                SELECT TOP 50 u.NombreCompleto AS Conductor, c.Codigo AS Ciclo,
                    SUM(r.Litros) AS TotalLitros,
                    COUNT(r.Id) AS TotalViajes,
                    SUM(CASE WHEN r.EsAcida = 1 THEN r.Litros ELSE 0 END) AS LitrosAcidos
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                INNER JOIN TB_CICLOS_OPERATIVOS c ON r.CicloId = c.Id
                WHERE r.CicloId IN (
                    SELECT DISTINCT TOP 8 CicloId
                    FROM TB_RUTAS_RECOLECCION
                    ORDER BY CicloId DESC
                )
                GROUP BY u.NombreCompleto, c.Codigo, c.Id
                ORDER BY c.Id DESC, TotalLitros DESC")).ToList()
                : new List<dynamic>();

            // ====================================================
            // CONSTRUCCIÃ“N DEL CONTEXTO PARA GEMINI
            // ====================================================
            var ctx = new System.Text.StringBuilder();
            ctx.AppendLine("=== BASE DE DATOS OPERATIVA: SISTEMA DE TRANSPORTE Y CONTROL DE LECHE ===");
            ctx.AppendLine($"Ciclo Activo Actual: {cicloCodigo} | Tasa BCV Oficial: Bs. {tasaBcv:N2}/USD");
            ctx.AppendLine();

            if (hallazgosDirectos.Length > 0)
            {
                ctx.Append(hallazgosDirectos.ToString());
            }

            // Resumen VolumÃ©trico del Ciclo Actual
            decimal totalFincas = fincas.Sum(f => (decimal)f.TotalLitros);
            decimal totalEntregas = entregas.Sum(e => (decimal)e.Litros);
            decimal mermaGlobal = totalFincas - totalEntregas;
            decimal totalAcidos = fincas.Sum(f => (decimal)f.LitrosAcidos);
            decimal totalAdelantos = adelantos.Sum(a => (decimal)a.MontoPendienteUSD);

            ctx.AppendLine("--- RESUMEN GLOBAL DEL CICLO ACTUAL ---");
            ctx.AppendLine($"Total recolectado en fincas: {totalFincas:N0} Lts");
            ctx.AppendLine($"Total entregado en plantas/receptorÃ­as: {totalEntregas:N0} Lts");
            ctx.AppendLine($"Merma/Diferencia global: {mermaGlobal:N0} Lts");
            ctx.AppendLine($"Leche Ã¡cida registrada: {totalAcidos:N0} Lts");
            ctx.AppendLine($"Adelantos pendientes por cobrar: ${totalAdelantos:N2} USD");
            ctx.AppendLine();

            // REGISTRO DETALLADO DE TICKETS DE DESPACHO / SALIDA (TB_CONTROL_COMPANIAS)
            ctx.AppendLine("--- REGISTRO DE TICKETS DE DESPACHO / SALIDA A COMPAÃ‘ÃAS Y QUESERAS (TB_CONTROL_COMPANIAS) ---");
            if (despachosDetallados.Any())
            {
                foreach (var d in despachosDetallados)
                {
                    string fStr = d.Fecha != null ? ((DateTime)d.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                    decimal ltsDesp = d.LitrosDespachados != null ? (decimal)d.LitrosDespachados : 0m;
                    decimal ltsRec = d.LitrosRecibidosCompania != null ? (decimal)d.LitrosRecibidosCompania : 0m;
                    decimal dif = d.DiferenciaLitros != null ? (decimal)d.DiferenciaLitros : (ltsRec - ltsDesp);
                    ctx.AppendLine($"Ticket #{d.Id} | Fecha: {fStr} | Chofer: {d.Conductor ?? "Sin asignar"} | Destino: {d.Compania ?? "Sin destino"} | Litros Despachados: {ltsDesp:N0} Lts | Litros Recibidos: {ltsRec:N0} Lts | Diferencia: {dif:N0} Lts | Estado: {d.Estado} | Ciclo: {d.CicloCodigo ?? "N/A"} | Obs: {d.Observacion ?? "Ninguna"}");
                }
            }
            else
            {
                ctx.AppendLine("No hay tickets de despacho registrados.");
            }
            ctx.AppendLine();

            // REGISTRO DETALLADO DE ENTREGAS A RECEPTORÃA Y COMPAÃ‘ÃAS (TB_ENTREGAS_COMPANIA)
            ctx.AppendLine("--- REGISTRO DE TICKETS DE ENTREGA A RECEPTORÃA Y COMPAÃ‘ÃAS (TB_ENTREGAS_COMPANIA) ---");
            if (entregasDetalladas.Any())
            {
                foreach (var e in entregasDetalladas)
                {
                    string fStr = e.Fecha != null ? ((DateTime)e.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                    decimal lts = e.Litros != null ? (decimal)e.Litros : 0m;
                    ctx.AppendLine($"Ticket Entrega #{e.Id} | Fecha: {fStr} | Chofer: {e.Conductor ?? "Sin chofer"} | Planta/Destino: {e.Compania} | Litros: {lts:N0} Lts | Ciclo: {e.CicloCodigo ?? "N/A"} | Tipo: {e.TipoServicio ?? "General"} | Obs: {e.Observacion ?? "Ninguna"}");
                }
            }
            else
            {
                ctx.AppendLine("No hay entregas registradas.");
            }
            ctx.AppendLine();

            // CONTROLES DE VIAJES / ENTRADAS A RECEPTORÃA (TB_CONTROL_RUTAS)
            ctx.AppendLine("--- REGISTRO DE ENTRADAS DE VIAJE A RECEPTORÃA (TB_CONTROL_RUTAS) ---");
            if (controlesRutasDetallados.Any())
            {
                foreach (var cr in controlesRutasDetallados)
                {
                    string fStr = cr.Fecha != null ? ((DateTime)cr.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                    decimal fincasLts = cr.TotalLitrosFinca != null ? (decimal)cr.TotalLitrosFinca : 0m;
                    decimal recepLts = cr.TotalLitrosReceptoria != null ? (decimal)cr.TotalLitrosReceptoria : (cr.LitrosRecibidosReceptoria != null ? (decimal)cr.LitrosRecibidosReceptoria : 0m);
                    decimal dif = cr.DiferenciaLitros != null ? (decimal)cr.DiferenciaLitros : (cr.DiferenciaReceptoria != null ? (decimal)cr.DiferenciaReceptoria : (recepLts - fincasLts));
                    ctx.AppendLine($"Control Viaje #{cr.Id} | Fecha: {fStr} | Chofer: {cr.Conductor ?? "Sin chofer"} | Litros Fincas: {fincasLts:N0} Lts | Litros ReceptorÃ­a: {recepLts:N0} Lts | Diferencia: {dif:N0} Lts | Estado: {cr.Estado} | Ciclo: {cr.CicloCodigo ?? "N/A"} | Obs: {cr.Observacion ?? "Ninguna"}");
                }
            }
            else
            {
                ctx.AppendLine("No hay controles de viaje registrados.");
            }
            ctx.AppendLine();

            // RECOLECCIONES EN FINCAS (TB_RUTAS_RECOLECCION)
            ctx.AppendLine("--- REGISTRO DE RECOLECCIONES INDIVIDUALES EN FINCAS (TB_RUTAS_RECOLECCION) ---");
            foreach (var r in recoleccionesDetalladas.Take(100))
            {
                string fStr = r.Fecha != null ? ((DateTime)r.Fecha).ToString("dd/MM/yyyy") : "Sin fecha";
                decimal lts = r.Litros != null ? (decimal)r.Litros : 0m;
                bool esAcida = false;
                try { esAcida = r.EsAcida != null && (r.EsAcida is bool ? (bool)r.EsAcida : Convert.ToInt32(r.EsAcida) == 1); } catch { }
                string acida = esAcida ? " [ÃCIDA]" : "";
                ctx.AppendLine($"RecolecciÃ³n #{r.Id} | Fecha: {fStr} | Chofer: {r.Conductor ?? "Sin chofer"} | Finca: {r.Finca ?? "Sin finca"} | Litros: {lts:N0} Lts{acida} | Ciclo: {r.CicloCodigo ?? "N/A"} | Obs: {r.Observacion ?? "Ninguna"}");
            }
            ctx.AppendLine();

            // Choferes Ciclo Actual
            ctx.AppendLine("--- CHOFERES / CONDUCTORES Y SU DESEMPEÃ‘O (CICLO ACTUAL) ---");
            if (choferesPorRutas.Any())
            {
                foreach (var c in choferesPorRutas)
                {
                    ctx.AppendLine($"Conductor: {c.NombreCompleto} | Litros recolectados: {c.TotalLitros:N0} | Viajes: {c.TotalViajes} | Fincas atendidas: {c.TotalFincas} | Leche Ã¡cida: {c.LitrosAcidos:N0} Lts");
                    ctx.AppendLine($"  Fincas: {c.FincasAtendidas}");
                }
            }
            else
            {
                ctx.AppendLine("No hay choferes con rutas registradas en este ciclo.");
            }
            ctx.AppendLine();

            // Fincas
            decimal totalRec2Meses = 0;
            decimal totalEnt2Meses = 0;
            decimal totalAcida2Meses = 0;
            foreach (var hc in historicoCiclos)
            {
                decimal rec = (decimal)hc.TotalLitrosRecolectados;
                decimal ent = (decimal)hc.TotalLitrosEntregados;
                decimal ac = (decimal)hc.TotalLecheAcida;
                totalRec2Meses += rec;
                totalEnt2Meses += ent;
                totalAcida2Meses += ac;
                ctx.AppendLine($"Ciclo: {hc.Codigo} | Recolectado: {rec:N0} Lts | Entregado: {ent:N0} Lts | Merma: {(rec - ent):N0} Lts | Ãcida: {ac:N0} Lts");
            }
            ctx.AppendLine($"TOTAL ACUMULADO 2 MESES (8 CICLOS): Recolectado: {totalRec2Meses:N0} Lts | Entregado: {totalEnt2Meses:N0} Lts | Leche Ãcida: {totalAcida2Meses:N0} Lts");
            ctx.AppendLine();

            // HistÃ³rico por Choferes en 2 Meses
            ctx.AppendLine("--- HISTÃ“RICO DE CONDUCTORES EN ÃšLTIMOS 2 MESES ---");
            var choferesAgrupadosMeses = historicoChoferesMeses.GroupBy(h => (string)h.Conductor);
            foreach (var gChofer in choferesAgrupadosMeses)
            {
                decimal totalLitrosChofer = gChofer.Sum(x => (decimal)x.TotalLitros);
                int totalViajesChofer = gChofer.Sum(x => (int)x.TotalViajes);
                decimal totalAcidaChofer = gChofer.Sum(x => (decimal)x.LitrosAcidos);
                ctx.AppendLine($"Conductor: {gChofer.Key} | Total 2 Meses: {totalLitrosChofer:N0} Lts | Viajes: {totalViajesChofer} | Leche Ãcida Acumulada: {totalAcidaChofer:N0} Lts");
            }
            ctx.AppendLine();

            // Adelantos
            ctx.AppendLine("--- ADELANTOS ACTIVOS ---");
            foreach (var a in adelantos.Take(15))
            {
                ctx.AppendLine($"Beneficiario: {a.Beneficiario} | Monto Total: ${a.MontoTotalUSD:N2} USD | Pendiente: ${a.MontoPendienteUSD:N2} USD | Fecha: {((DateTime)a.FechaSolicitud).ToString("dd/MM/yyyy")}");
            }
            ctx.AppendLine();

            // BCV
            ctx.AppendLine("--- HISTORIAL TASA BCV ---");
            foreach (var b in historialBcv)
            {
                ctx.AppendLine($"Fecha: {((DateTime)b.Fecha).ToString("dd/MM/yyyy")} | Tasa: Bs. {b.TasaDolarBs:N2}");
            }
            ctx.AppendLine();

            // Flota, Mantenimiento, Combustible y Repuestos
            if (PuedeTabla("TB_CAMIONES"))
            {
                try
                {
                    var camionesFlota = await connection.QueryAsync<dynamic>(@"
                        SELECT c.Placa, c.MarcaModelo, c.Estado, c.Activo, ISNULL(c.OdometroActualKm, 0) AS OdometroActualKm,
                               c.CapacidadLitros, u.NombreCompleto AS Chofer
                        FROM TB_CAMIONES c
                        LEFT JOIN TB_USUARIOS u ON c.UsuarioId = u.Id
                        ORDER BY c.Placa ASC");

                    ctx.AppendLine("--- FLOTA DE CAMIONES ---");
                    if (camionesFlota.Any())
                    {
                        foreach (var cam in camionesFlota)
                        {
                            ctx.AppendLine($"Placa: {cam.Placa} | {cam.MarcaModelo ?? "Cisterna"} | Estado: {cam.Estado ?? (cam.Activo == true ? "ACTIVO" : "INACTIVO")} | OdÃ³metro: {cam.OdometroActualKm:N0} Km | Cap: {cam.CapacidadLitros:N0} L | Chofer: {cam.Chofer ?? "Sin asignar"}");
                        }
                    }
                    else
                    {
                        ctx.AppendLine("No hay camiones registrados.");
                    }
                    ctx.AppendLine();
                }
                catch { }
            }

            if (PuedeTabla("TB_MANTENIMIENTO_CAMIONES", "MOD_MANTENIMIENTO"))
            {
                try
                {
                    var mantenimientosRecientes = await connection.QueryAsync<dynamic>(@"
                        SELECT TOP 20 m.Id, c.Placa, m.TipoEvento, m.Titulo, m.Estado, m.Urgencia,
                               m.CostoTotalUSD, m.FechaEvento, m.OdometroKm, m.ProximoKmSugerido, m.TallerOMecanico
                        FROM TB_MANTENIMIENTO_CAMIONES m
                        INNER JOIN TB_CAMIONES c ON m.CamionId = c.Id
                        ORDER BY m.FechaEvento DESC, m.Id DESC");

                    ctx.AppendLine("--- HISTORIAL Y ALERTAS DE MANTENIMIENTO ---");
                    if (mantenimientosRecientes.Any())
                    {
                        foreach (var mt in mantenimientosRecientes)
                        {
                            string fMt = mt.FechaEvento != null ? ((DateTime)mt.FechaEvento).ToString("dd/MM/yyyy") : "-";
                            ctx.AppendLine($"#{mt.Id} | Placa: {mt.Placa} | {mt.TipoEvento}: {mt.Titulo} | Estado: {mt.Estado} ({mt.Urgencia ?? "MEDIA"}) | Costo: ${mt.CostoTotalUSD:N2} | Fecha: {fMt} | Km: {mt.OdometroKm ?? 0} | PrÃ³x Km: {mt.ProximoKmSugerido ?? 0}");
                        }
                    }
                    else
                    {
                        ctx.AppendLine("Sin registros de mantenimiento.");
                    }
                    ctx.AppendLine();
                }
                catch { }
            }

            if (PuedeTabla("TB_COMBUSTIBLE_INVENTARIO", "MOD_COMBUSTIBLE") || PuedeTabla("TB_COMBUSTIBLE_HISTORIAL", "MOD_COMBUSTIBLE"))
            {
                try
                {
                    var invCombustible = PuedeTabla("TB_COMBUSTIBLE_INVENTARIO", "MOD_COMBUSTIBLE")
                        ? await connection.QueryAsync<dynamic>(@"
                            SELECT TipoCombustible, StockActualLitros, CapacidadTanqueAlmacen
                            FROM TB_COMBUSTIBLE_INVENTARIO
                            ORDER BY TipoCombustible ASC")
                        : Enumerable.Empty<dynamic>();

                    var histCombustible = PuedeTabla("TB_COMBUSTIBLE_HISTORIAL", "MOD_COMBUSTIBLE")
                        ? await connection.QueryAsync<dynamic>(@"
                            SELECT TOP 15 h.Fecha, h.TipoMovimiento, h.TipoCombustible, h.Litros, h.StockNuevoLitros,
                                   c.Placa, h.Proveedor, h.OdometroKm, h.Observaciones
                            FROM TB_COMBUSTIBLE_HISTORIAL h
                            LEFT JOIN TB_CAMIONES c ON h.CamionId = c.Id
                            ORDER BY h.Fecha DESC, h.Id DESC")
                        : Enumerable.Empty<dynamic>();

                    ctx.AppendLine("--- INVENTARIO Y MOVIMIENTOS DE COMBUSTIBLE ---");
                    foreach (var ic in invCombustible)
                    {
                        decimal cap = ic.CapacidadTanqueAlmacen > 0 ? (decimal)ic.CapacidadTanqueAlmacen : 1m;
                        decimal pct = Math.Round(((decimal)ic.StockActualLitros / cap) * 100m, 1);
                        ctx.AppendLine($"Tanque {ic.TipoCombustible}: {ic.StockActualLitros:N0} L / {ic.CapacidadTanqueAlmacen:N0} L ({pct}% lleno)");
                    }
                    foreach (var hc in histCombustible)
                    {
                        string fHc = hc.Fecha != null ? ((DateTime)hc.Fecha).ToString("dd/MM/yyyy") : "-";
                        string dest = hc.Placa != null ? $"CamiÃ³n {hc.Placa}" : (hc.Proveedor != null ? $"Prov: {hc.Proveedor}" : "Ajuste");
                        ctx.AppendLine($"  {fHc} | {hc.TipoMovimiento} | {hc.TipoCombustible}: {hc.Litros:N0} L | {dest} | Stock res: {hc.StockNuevoLitros:N0} L");
                    }
                    ctx.AppendLine();
                }
                catch { }
            }

            if (PuedeTabla("TB_INVENTARIO_REPUESTOS", "MOD_REPUESTOS") || PuedeTabla("TB_MOVIMIENTOS_REPUESTOS", "MOD_REPUESTOS"))
            {
                try
                {
                    var repuestosActivos = PuedeTabla("TB_INVENTARIO_REPUESTOS", "MOD_REPUESTOS")
                        ? await connection.QueryAsync<dynamic>(@"
                            SELECT Codigo, Nombre, Categoria, StockActual, StockMinimo, CostoUnitarioUSD, UbicacionAlmacen
                            FROM TB_INVENTARIO_REPUESTOS
                            WHERE Activo = 1
                            ORDER BY Nombre ASC")
                        : Enumerable.Empty<dynamic>();

                    var movRepuestos = PuedeTabla("TB_MOVIMIENTOS_REPUESTOS", "MOD_REPUESTOS")
                        ? await connection.QueryAsync<dynamic>(@"
                            SELECT TOP 15 m.Fecha, m.TipoMovimiento, r.Codigo, r.Nombre, m.Cantidad, m.CostoUnitarioUSD, c.Placa
                            FROM TB_MOVIMIENTOS_REPUESTOS m
                            INNER JOIN TB_INVENTARIO_REPUESTOS r ON m.RepuestoId = r.Id
                            LEFT JOIN TB_CAMIONES c ON m.CamionId = c.Id
                            ORDER BY m.Fecha DESC, m.Id DESC")
                        : Enumerable.Empty<dynamic>();

                    ctx.AppendLine("--- INVENTARIO DE REPUESTOS Y KÃRDEX ---");
                    decimal valorAlmacen = repuestosActivos.Sum(r => (decimal)r.StockActual * (decimal)r.CostoUnitarioUSD);
                    int stockCritico = repuestosActivos.Count(r => (int)r.StockActual <= (int)r.StockMinimo);
                    ctx.AppendLine($"Total Ã­tems activos: {repuestosActivos.Count()} | En stock crÃ­tico: {stockCritico} | Valorizado: ${valorAlmacen:N2} USD");
                    foreach (var rp in repuestosActivos.Take(25))
                    {
                        string alerta = (int)rp.StockActual <= (int)rp.StockMinimo ? " [STOCK CRÃTICO]" : "";
                        ctx.AppendLine($"  [{rp.Codigo}] {rp.Nombre} ({rp.Categoria}): {rp.StockActual} unid (MÃ­n: {rp.StockMinimo}) | ${rp.CostoUnitarioUSD:N2}{alerta}");
                    }
                    foreach (var mr in movRepuestos)
                    {
                        string fMr = mr.Fecha != null ? ((DateTime)mr.Fecha).ToString("dd/MM/yyyy") : "-";
                        ctx.AppendLine($"  Mov {fMr} | {mr.TipoMovimiento} | {mr.Codigo} - {mr.Nombre} x{mr.Cantidad} | CamiÃ³n: {mr.Placa ?? "AlmacÃ©n"}");
                    }
                    ctx.AppendLine();
                }
                catch { }
            }

            ctx.AppendLine($"--- TABLAS HABILITADAS PARA ESTA EMPRESA ({tablasHabilitadas.Count}) ---");
            ctx.AppendLine(string.Join(", ", tablasHabilitadas));
            ctx.AppendLine();

            string contextoCompleto = ctx.ToString();

            // ====================================================
            // LLAMADA A GEMINI AI CON FALLBACK Y REINTENTOS
            // ====================================================
            string respuestaGemini;
            var problemas = new List<string>();
            var sugerencias = new List<string>();

            try
            {
                respuestaGemini = await ConsultarGeminiAsync(contextoCompleto, mensaje);
            }
            catch (Exception)
            {
                // Fallback inteligente y experto si Gemini estuviera bajo alta demanda
                respuestaGemini = GenerarRespuestaLocalExperta(mensaje, totalRec2Meses, totalEnt2Meses, totalAcida2Meses, choferesAgrupadosMeses, cicloCodigo, totalFincas, totalEntregas, totalAcidos, totalAdelantos, tasaBcv, hallazgosDirectos.ToString());
            }

            return new ChatResponseDto
            {
                Respuesta = respuestaGemini,
                ProblemasDetectados = problemas,
                Sugerencias = sugerencias,
                Timestamp = DateTime.Now
            };
        }

        private string GenerarRespuestaLocalExperta(string pregunta, decimal totalRec2Meses, decimal totalEnt2Meses, decimal totalAcida2Meses, IEnumerable<dynamic> choferesMeses, string cicloCodigo, decimal totalFincas, decimal totalEntregas, decimal totalAcidos, decimal totalAdelantos, decimal tasaBcv, string hallazgosDirectos = "")
        {
            string p = (pregunta ?? "").ToLower().Trim();
            var sb = new System.Text.StringBuilder();

            // Si hay hallazgos directos encontrados para una cifra, ticket o auditorÃ­a especÃ­fica, mostrarlos de inmediato
            if (!string.IsNullOrWhiteSpace(hallazgosDirectos))
            {
                sb.AppendLine("ðŸ“Š **AUDITORÃA DE DATOS EXACTOS ENCONTRADOS EN LA BASE DE DATOS**\n");
                sb.AppendLine(hallazgosDirectos);

                if (hallazgosDirectos.Contains("PROBLEMAS DE LECHE ÃCIDA"))
                {
                    sb.AppendLine("ðŸ’¡ **Impacto Operativo & Recomendaciones:**");
                    sb.AppendLine("1. La leche Ã¡cida o descompuesta no se remunera ($0.00 / Litro) para proteger la contabilidad de la empresa, pero genera pÃ©rdida de flete y merma en cisterna.");
                    sb.AppendLine("2. **InspecciÃ³n TÃ©cnica:** Se recomienda enviar a un supervisor tÃ©cnico a verificar los equipos de enfriamiento y tanques de frÃ­o en las fincas con mayor reincidencia.");
                    sb.AppendLine("3. **Protocolo del Conductor:** En la App MÃ³vil o formato fÃ­sico, el chofer debe realizar la prueba de alcohol antes de vaciar las pimpinas en el camiÃ³n cisterna para evitar contaminar la leche buena del resto de la ruta.");
                }
                else
                {
                    sb.AppendLine("ðŸ’¡ **Causa del Saldo / Descuadre:**");
                    sb.AppendLine("Un saldo o merma negativa (como faltante de litros) ocurre cuando el volumen recolectado en las fincas no cuenta con la recepciÃ³n asentada en ReceptorÃ­a o no se completÃ³ el despacho a Planta.");
                    sb.AppendLine("\n**Â¿CÃ³mo solucionarlo en el sistema?**");
                    sb.AppendLine("1. Ve a **ðŸ¥› ReceptorÃ­a & Tanque** o **ðŸšš Rutas de RecolecciÃ³n**.");
                    sb.AppendLine("2. Localiza el Ticket / Control de Viaje correspondiente.");
                    sb.AppendLine("3. Haz clic en **`âš–ï¸ Recibir en ReceptorÃ­a`** o **`âœï¸ Editar`** para ingresar los litros reales medidos o ajustar la carga.");
                }
                sb.AppendLine("ðŸš€ **GUÃA PASO A PASO: CÃ³mo Registrar un Viaje / Ruta de RecolecciÃ³n**\n");
                sb.AppendLine("1. **Ir a la Vista:** En el menÃº lateral izquierdo, haz clic en **ðŸšš Rutas de RecolecciÃ³n** (o pulsa la tecla de acceso directo).");
                sb.AppendLine("2. **Iniciar Viaje:** Haz clic en el botÃ³n superior azul **`+ Iniciar Nuevo Viaje / Registrar Ruta`**.");
                sb.AppendLine("3. **Datos de Cabecera:**");
                sb.AppendLine("   * Selecciona la **Fecha** del viaje.");
                sb.AppendLine("   * Selecciona el **Conductor / Chofer** en el buscador desplegable.");
                sb.AppendLine("   * Selecciona el **VehÃ­culo / CamiÃ³n**.");
                sb.AppendLine("   * Define el **Tipo de Servicio**:");
                sb.AppendLine("     - **Servicio de Ruta:** La leche va a acopiarse en ReceptorÃ­a.");
                sb.AppendLine("     - **Servicio de Transporte:** La leche va directa a una CompaÃ±Ã­a/Quesera.");
                sb.AppendLine("4. **Cargar Fincas:** Haz clic en **`+ Agregar Finca`**, selecciona la finca del catÃ¡logo, ingresa los **Litros Recolectados** y marca la casilla **`ðŸ§ª Es Leche Ãcida`** si la leche no pasÃ³ la prueba de alcohol.");
                sb.AppendLine("5. **Guardar:** Haz clic en **`ðŸ’¾ Guardar Ticket de Viaje`**. El sistema calcularÃ¡ automÃ¡ticamente los litros totales y lo pondrÃ¡ disponible en el flujo operativo.");
                return sb.ToString();
            }

            if (p.Contains("receptoria") || p.Contains("recibir") || p.Contains("tanque") || p.Contains("medicion") || p.Contains("regla"))
            {
                sb.AppendLine("ðŸ¥› **GUÃA PASO A PASO: RecepciÃ³n en ReceptorÃ­a y Balance de Tanque**\n");
                sb.AppendLine("1. **Ir al MÃ³dulo:** Haz clic en **ðŸ¥› ReceptorÃ­a & Tanque** en el menÃº principal.");
                sb.AppendLine("2. **Localizar el CamiÃ³n:** En la tabla **Pendientes de RecepciÃ³n**, ubica el ticket del chofer.");
                sb.AppendLine("3. **Medir y Validar:** Haz clic en el botÃ³n **`âš–ï¸ Recibir en ReceptorÃ­a`**.");
                sb.AppendLine("4. **Ingresar Litros Reales:** Ingresa los litros medidos con regla en tanque. El sistema te mostrarÃ¡ en tiempo real si hay **Cuadre Exacto (0 L)**, **Faltante (- Lts)** o **Sobrante (+ Lts)**.");
                sb.AppendLine("5. **DecisiÃ³n LogÃ­stica:**");
                sb.AppendLine("   * **ðŸ  Dejar en ReceptorÃ­a:** Se almacena en los tanques y se suma al inventario disponible.");
                sb.AppendLine("   * **ðŸ”„ Recargar y Despachar:** Si el camiÃ³n cargarÃ¡ leche adicional del tanque para salir a una o varias queseras/plantas.");
                sb.AppendLine("6. **Confirmar:** Haz clic en **`Confirmar RecepciÃ³n`**.");
                return sb.ToString();
            }

            if (p.Contains("pagar") || p.Contains("nomina") || p.Contains("sueldo") || p.Contains("chofer") || p.Contains("matera") || p.Contains("flete"))
            {
                sb.AppendLine("ðŸ’° **GUÃA PASO A PASO: LiquidaciÃ³n y Pagos a Choferes, Materas y Personal**\n");
                sb.AppendLine("1. **Ir a la Vista:** MenÃº lateral -> **ðŸ’µ Pagos Choferes, Materas & Personal**.");
                sb.AppendLine("2. **Seleccionar Semana:** En el filtro superior, escoge el ciclo/semana a liquidar.");
                sb.AppendLine("3. **PestaÃ±as Disponibles:**");
                sb.AppendLine("   * **ðŸ“„ 1. LiquidaciÃ³n Semanal:** Muestra a todos los trabajadores con sus litros transportados, tarifa por litro, sueldo devengado, cuotas de prÃ©stamos a descontar y neto final en USD y Bs.");
                sb.AppendLine("   * **âš™ï¸ 2. ConfiguraciÃ³n de Sueldos & Tarifas:** Permite editar el Sueldo Base ($), Tarifa ($/L), Modalidad (Fijo/Variado/Mixto), Frecuencia (Semanal/Quincenal) y Cuentas de Pago MÃ³vil.");
                sb.AppendLine("4. **Procesar el Pago:** Haz clic en el botÃ³n azul **`Pagar`** en la fila del trabajador.");
                sb.AppendLine("5. **Confirmar Detalles:** Verifica monto bruto, cuotas de adelantos, ingresa referencia bancaria y haz clic en **`Procesar Pago`**.");
                sb.AppendLine("6. **Comprobante:** Puedes hacer clic en **`ðŸ§¾ Ver Recibo`** para imprimir o descargar el comprobante de liquidaciÃ³n firmado.");
                return sb.ToString();
            }

            if (p.Contains("revertir") || p.Contains("anular") || p.Contains("cancelar") || p.Contains("corregir") || p.Contains("error"))
            {
                sb.AppendLine("â†©ï¸ **GUÃA DE AUDITORÃA: CÃ³mo Revertir, Corregir o Anular Operaciones**\n");
                sb.AppendLine("### ðŸš« **1. Anular un Pago de NÃ³mina / LiquidaciÃ³n:**");
                sb.AppendLine("- Ve a **Pagos Choferes, Materas & Personal**.");
                sb.AppendLine("- En la fila del trabajador con estado **PAGADO**, haz clic en el botÃ³n rojo **`ðŸš« Anular Pago`**.");
                sb.AppendLine("- Escribe el motivo de la anulaciÃ³n para la auditorÃ­a y confirma. El sistema **reabrirÃ¡ automÃ¡ticamente los saldos de los adelantos amortizados** y devolverÃ¡ el estado a PENDIENTE.");
                sb.AppendLine("\n### âœï¸ **2. Corregir Litros o Fincas en un Viaje:**");
                sb.AppendLine("- Ve a **Rutas de RecolecciÃ³n** -> localiza el ticket -> haz clic en **`âœï¸ Editar`**.");
                sb.AppendLine("- Modifica los litros, cambia las fincas o marca/desmarca leche Ã¡cida y guarda.");
                sb.AppendLine("\n### ðŸ”„ **3. Cambiar Destino de un Viaje (ReceptorÃ­a vs CompaÃ±Ã­a):**");
                sb.AppendLine("- Edita el viaje y cambia el selector de **Tipo de Servicio** para redirigir directamente.");
                return sb.ToString();
            }

            if (p.Contains("traspaso") || p.Contains("traspasar"))
            {
                sb.AppendLine("ðŸ”„ **GUÃA: Traspasos de Leche entre Camiones**\n");
                sb.AppendLine("1. Ve al mÃ³dulo **ðŸšš Rutas de RecolecciÃ³n / Control de Viajes**.");
                sb.AppendLine("2. Haz clic en el botÃ³n **`ðŸ”„ Traspaso de Leche`** en la barra superior.");
                sb.AppendLine("3. Selecciona el **Ticket Origen** (el camiÃ³n que cede o transfiere leche).");
                sb.AppendLine("4. Selecciona el **Ticket Destino** (el camiÃ³n que recibe la carga).");
                sb.AppendLine("5. Ingresa la cantidad exacta de litros a transferir y el motivo de la operaciÃ³n.");
                sb.AppendLine("6. Haz clic en **`Confirmar Traspaso`**. El sistema ajustarÃ¡ automÃ¡ticamente los inventarios de ambos camiones.");
                return sb.ToString();
            }

            if (p.Contains("adelanto") || p.Contains("prestamo"))
            {
                sb.AppendLine("ðŸ’³ **GUÃA: MÃ³dulo de Adelantos y PrÃ©stamos**\n");
                sb.AppendLine("1. Ve al menÃº lateral -> **ðŸ’³ Adelantos & PrÃ©stamos**.");
                sb.AppendLine("2. Haz clic en **`+ Nuevo Adelanto`**.");
                sb.AppendLine("3. Selecciona si es para una **Finca (Productor)** o un **Empleado / Chofer**.");
                sb.AppendLine("4. Ingresa el **Monto Total en USD**, fecha y nÃºmero de cuotas semanales para amortizar.");
                sb.AppendLine("5. Al guardar, cada vez que se liquide el pago semanal, el sistema descontarÃ¡ la cuota programada hasta llegar a saldo $0.00.");
                return sb.ToString();
            }

            if (p.Contains("leche acida") || p.Contains("acida") || p.Contains("calidad"))
            {
                sb.AppendLine("ðŸ§ª **INFORMACIÃ“N CLAVE: Manejo de Leche Ãcida en el Sistema**\n");
                sb.AppendLine("1. **MediciÃ³n FÃ­sica:** La leche Ã¡cida sÃ­ se cuenta en el volumen fÃ­sico total transportado en el camiÃ³n.");
                sb.AppendLine("2. **FacturaciÃ³n y Pago:** Por regla de negocio estÃ¡ndar, la leche Ã¡cida tiene precio **$0.00 / Litro** (no se remunera comercialmente) a menos que se defina un acuerdo de rescate.");
                sb.AppendLine("3. **Reportes:** En la RelaciÃ³n de Pagos de Fincas y de CompaÃ±Ã­as aparece separada claramente en la columna **`TOTAL MALA/ACIDA`** para total transparencia contable.");
                return sb.ToString();
            }

            // DiagnÃ³stico general por defecto
            sb.AppendLine("ðŸ¤– **Asistente Virtual & Analista Experto del Sistema**\n");
            sb.AppendLine($"### ðŸ“Š **Resumen Operativo Acumulado (Ãšltimos 2 Meses - 8 Ciclos)**");
            sb.AppendLine($"- **Volumen Total Recolectado:** {totalRec2Meses:N0} Lts");
            sb.AppendLine($"- **Volumen Total Entregado:** {totalEnt2Meses:N0} Lts");
            sb.AppendLine($"- **Merma HistÃ³rica Acumulada:** {(totalRec2Meses - totalEnt2Meses):N0} Lts");
            sb.AppendLine($"- **Leche Ãcida Registrada (2 meses):** {totalAcida2Meses:N0} Lts\n");

            sb.AppendLine($"### ðŸ“ **Estado del Ciclo Actual ({cicloCodigo})**");
            sb.AppendLine($"- RecolecciÃ³n semanal en fincas: {totalFincas:N0} Lts");
            sb.AppendLine($"- Entregas en plantas/receptorÃ­as: {totalEntregas:N0} Lts");
            sb.AppendLine($"- Leche Ã¡cida: {totalAcidos:N0} Lts");
            sb.AppendLine($"- Adelantos pendientes: ${totalAdelantos:N2} USD");
            sb.AppendLine($"- Tasa BCV Oficial: Bs. {tasaBcv:N2}/USD\n");

            sb.AppendLine("ðŸ’¡ *Â¿Tienes dudas sobre un proceso? PregÃºntame cÃ³mo registrar viajes, cÃ³mo liquidar nÃ³mina, cÃ³mo hacer traspasos o cÃ³mo revertir cualquier error.*");
            return sb.ToString();
        }

        private async Task<string> ConsultarGeminiAsync(string contexto, string pregunta)
        {
            string prompt = $@"Eres el 'Asistente Virtual & Analista Experto del Sistema Transporte V2' para la recolecciÃ³n, transporte, recepciÃ³n y comercializaciÃ³n de leche en Venezuela.
Tienes conocimiento de toda la arquitectura del sistema y acceso directo en tiempo real a las tablas, tickets y registros de la base de datos SQL.

================================================================================
REGLA DE ORO DE RESPUESTA (MÃXIMA PRIORIDAD):
================================================================================
1. SI EL USUARIO PREGUNTA POR UNA CIFRA ESPECÃFICA (ej: '-1774 litros', '3380', '656', etc.), UN DESCUADRE, UN CHOFER O UN TICKET:
   - ESTÃ TOTALMENTE PROHIBIDO DAR RESPUESTAS TEÃ“RICAS ABSTRACTAS O DE MANUAL (NO respondas '1. Â¿QuÃ© significa un valor negativo?' ni expliques teorÃ­a genÃ©rica).
   - DEBES IR DIRECTO A LOS REGISTROS REALES DE LA BASE DE DATOS:
     * Cita el Control de Viaje / Ticket # exacto.
     * Cita la Fecha y el Chofer responsable.
     * Muestra el desglose exacto de litros finca por finca vs lo recibido en receptorÃ­a o entregado a planta.
     * Explica con precisiÃ³n quirÃºrgica por quÃ© se produjo la diferencia (ej: 'El chofer Julio Atencio recolectÃ³ 1.774 L en 5 fincas: Rancho Alegre 116 L, 3 de Mayo 155 L, Repelon 742 L, Punto 11 185 L, La Carolina 576 L, pero en ReceptorÃ­a se registraron 0 L, generando la diferencia de -1.774 L').
     * Indica la soluciÃ³n exacta en el sistema paso a paso para cuadrarlo.

2. SI EL USUARIO PREGUNTA 'CÃ“MO HACER ALGO' O 'CÃ“MO REVERTIR UN ERROR':
   - GuÃ­alo con pasos numerados claros, nombrando las vistas exactas (#rutas, #receptoria, #pagos-usuarios, etc.) y los botones que debe presionar.

3. REGLA DE CONCISIÃ“N Y PRECISIÃ“N (MÃXIMA PRIORIDAD):
   - RESPONDE DIRECTAMENTE LO SOLICITADO, SIN RODEOS NI EXTENSIÃ“N INNECESARIA.
   - Si el usuario hace una pregunta puntual (ej: 'cuÃ¡l es la finca con mejor promedio', 'cuÃ¡l es la finca que mÃ¡s problema da', 'cuÃ¡l chofer recolectÃ³ mÃ¡s'), entrega una RESPUESTA PUNTUAL Y DIRECTA:
     * Ejemplo: 'La finca con mÃ¡s problemas es **SAN PEDRO**, con 2.202 Lts de leche Ã¡cida en 5 viajes (Ãºltima incidencia: 02/11/2026). Si requieres el desglose viaje por viaje o recomendaciones, indÃ­camelo.'
   - NO agregues tablas gigantes ni explicaciones de manual si el usuario no pidiÃ³ expresamente 'mÃ¡s informaciÃ³n', 'detalles' o 'reporte completo'.
   - Si el usuario pide explÃ­citamente mÃ¡s detalles o anÃ¡lisis a fondo, entonces sÃ­ desglosa la auditorÃ­a completa.
   - 100% ESPAÃ‘OL OBLIGATORIO. Profesional, directo y al grano.

=== CONTEXTO COMPLETO DE LA BASE DE DATOS SQL (EN TIEMPO REAL) ===
{contexto}
=== FIN DEL CONTEXTO ===

CONSULTA DEL USUARIO: {pregunta}

RESPUESTA DEL ASISTENTE VIRTUAL (100% ESPAÃ‘OL, DIRECTO A LOS DATOS EXACTOS, SIN TEORÃA ABSTRACTA):";

            var requestBody = new
            {
                systemInstruction = new
                {
                    parts = new[]
                    {
                        new { text = "Eres el Asistente Virtual y Consultor Experto del Sistema Transporte V2. Tienes acceso a datos SQL en vivo. Responde SIEMPRE 100% en ESPAÃ‘OL, DIRECTO A LO QUE SE TE PREGUNTA, de forma CONCISA, EXACTA y SIN RODEOS. Si la pregunta es puntual, responde en 1 o 2 frases con los datos exactos y ofrece dar mÃ¡s detalles si el usuario lo solicita. Solo genera reportes o tablas extensas cuando el usuario pida expresamente mÃ¡s informaciÃ³n." }
                    }
                },
                contents = new[]
                {
                    new
                    {
                        parts = new[]
                        {
                            new { text = prompt }
                        }
                    }
                },
                generationConfig = new
                {
                    temperature = 0.15,
                    maxOutputTokens = 8192
                }
            };

            string json = System.Text.Json.JsonSerializer.Serialize(requestBody);

            // Intentar con modelos Gemini ultra-rÃ¡pidos en cascada con reintentos
            string[] modelos = new[] { "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-3.5-flash" };
            Exception? ultimoError = null;

            foreach (var modelo in modelos)
            {
                for (int intento = 1; intento <= 2; intento++)
                {
                    try
                    {
                        var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
                        string url = $"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={_geminiApiKey}";

                        var response = await _httpClient.PostAsync(url, content);
                        string responseBody = await response.Content.ReadAsStringAsync();

                        if (response.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable ||
                            response.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
                        {
                            ultimoError = new Exception($"Modelo {modelo} no disponible (503/429)");
                            await Task.Delay(1000 * intento);
                            continue;
                        }

                        if (!response.IsSuccessStatusCode)
                        {
                            ultimoError = new Exception($"Modelo {modelo} error {response.StatusCode}");
                            break; // Probar siguiente modelo
                        }

                        using var doc = System.Text.Json.JsonDocument.Parse(responseBody);
                        var candidates = doc.RootElement.GetProperty("candidates");
                        if (candidates.GetArrayLength() > 0)
                        {
                            var parts = candidates[0].GetProperty("content").GetProperty("parts");
                            var sbTexto = new System.Text.StringBuilder();

                            foreach (var part in parts.EnumerateArray())
                            {
                                if (part.TryGetProperty("text", out var t))
                                {
                                    string pText = t.GetString() ?? "";
                                    // Ignorar si la parte es solo pensamiento o metacogniciÃ³n
                                    if (!part.TryGetProperty("thought", out _))
                                    {
                                        sbTexto.AppendLine(pText);
                                    }
                                }
                            }

                            string resultadoFinal = sbTexto.ToString().Trim();

                            if (string.IsNullOrWhiteSpace(resultadoFinal))
                            {
                                resultadoFinal = candidates[0]
                                    .GetProperty("content")
                                    .GetProperty("parts")[0]
                                    .GetProperty("text")
                                    .GetString() ?? "";
                            }

                            return resultadoFinal;
                        }
                    }
                    catch (Exception ex)
                    {
                        ultimoError = ex;
                    }
                }
            }

            throw ultimoError ?? new Exception("No se pudo obtener respuesta del modelo de IA.");
        }
    }

    // =====================================================================
    // INTERFACE: IControlRutasRepository
    // =====================================================================
}
