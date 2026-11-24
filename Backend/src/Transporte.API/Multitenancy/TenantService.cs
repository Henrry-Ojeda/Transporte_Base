using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Data;
using System.IO;
using Dapper;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Transporte.Core.Interfaces;

namespace Transporte.API.Multitenancy
{
    public class TenantInfo
    {
        public int EmpresaId { get; set; }
        public string Codigo { get; set; } = "";
        public string Nombre { get; set; } = "";
        public string ConnectionString { get; set; } = "";
        public string Estado { get; set; } = "ACTIVA";
        public DateTime FechaVencimiento { get; set; }
        public int DiasGracia { get; set; }
        public List<string> Modulos { get; set; } = new();
        public List<string>? AiTablasPermitidas { get; set; }
    }

    public class TenantService : ITenantService
    {
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IConfiguration _configuration;
        private readonly ILogger<TenantService> _logger;

        private static readonly ConcurrentDictionary<string, (TenantInfo info, DateTime cachedAt)> _tenantCache = new();
        private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(5);

        public static void InvalidateCache() => _tenantCache.Clear();

        private TenantInfo? _currentTenant;

        private static readonly Lazy<bool> _isDockerOrSqlInstancia = new(() =>
        {
            try
            {
                if (File.Exists("/.dockerenv")) return true;
                if (string.Equals(Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER"), "true", StringComparison.OrdinalIgnoreCase)) return true;
            }
            catch { }
            return false;
        });

        public static bool IsRunningInDocker => _isDockerOrSqlInstancia.Value;

        public static string AdjustConnectionStringForEnvironment(string connStr)
        {
            if (string.IsNullOrWhiteSpace(connStr)) return connStr;
            if (IsRunningInDocker)
            {
                connStr = connStr.Replace("84.247.178.194", "sql_instancia");
                connStr = connStr.Replace("127.0.0.1", "sql_instancia");
                connStr = connStr.Replace("localhost", "sql_instancia");
            }
            else if (OperatingSystem.IsLinux())
            {
                connStr = connStr.Replace("84.247.178.194", "127.0.0.1");
            }

            // Forzar protocolo TCP directo para servidores remotos o Docker (en Windows localhost usa Shared Memory / Named Pipes)
            bool isLocalWindowsSql = !IsRunningInDocker && !OperatingSystem.IsLinux() &&
                (connStr.Contains("localhost", StringComparison.OrdinalIgnoreCase) || connStr.Contains("(local)", StringComparison.OrdinalIgnoreCase));
            if (!isLocalWindowsSql && !connStr.Contains("tcp:", StringComparison.OrdinalIgnoreCase))
            {
                connStr = connStr.Replace("Server=", "Server=tcp:", StringComparison.OrdinalIgnoreCase);
                connStr = connStr.Replace("Data Source=", "Data Source=tcp:", StringComparison.OrdinalIgnoreCase);
            }

            // En Linux desactivar Encrypt para evitar cuelgues del SSL Provider
            if (!connStr.Contains("Encrypt", StringComparison.OrdinalIgnoreCase))
            {
                connStr += ";Encrypt=False;";
            }

            // Asegurar Connect Timeout seguro de 30s para evitar fallos de conexión por handshake
            connStr = System.Text.RegularExpressions.Regex.Replace(connStr, @"Connect(?:ion)? Timeout\s*=\s*\d+", "Connect Timeout=30", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (!connStr.Contains("Connect Timeout", StringComparison.OrdinalIgnoreCase) && !connStr.Contains("Connection Timeout", StringComparison.OrdinalIgnoreCase))
            {
                connStr += ";Connect Timeout=30;";
            }

            if (!connStr.Contains("Pooling", StringComparison.OrdinalIgnoreCase))
            {
                connStr += ";Pooling=true;Min Pool Size=1;Max Pool Size=100;";
            }

            return connStr;
        }

        public TenantService(
            IHttpContextAccessor httpContextAccessor,
            IConfiguration configuration,
            ILogger<TenantService> logger)
        {
            _httpContextAccessor = httpContextAccessor;
            _configuration = configuration;
            _logger = logger;
            ResolveTenant();
        }

        private void ResolveTenant()
        {
            if (_configuration.GetValue<bool>("LocalDev:UseLocalDatabase"))
            {
                string localConn = _configuration.GetConnectionString("DefaultConnection")
                    ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection es requerida cuando LocalDev:UseLocalDatabase está activo.");
                _currentTenant = new TenantInfo
                {
                    EmpresaId = 1,
                    Codigo = _configuration["LocalDev:TenantCode"] ?? "LOCAL_DEV",
                    Nombre = _configuration["LocalDev:TenantName"] ?? "Sistema de Transporte (DEV LOCAL)",
                    ConnectionString = AdjustConnectionStringForEnvironment(localConn),
                    Estado = "ACTIVA",
                    FechaVencimiento = DateTime.UtcNow.AddYears(5),
                    DiasGracia = 30,
                    Modulos = new List<string>
                    {
                        "MOD_DASHBOARD", "MOD_LECHE_VACA", "MOD_LECHE_BUFALA",
                        "MOD_LOGISTICA_RUTAS", "MOD_RECEPTORIA", "MOD_COMBUSTIBLE",
                        "MOD_MANTENIMIENTO", "MOD_REPUESTOS", "MOD_LIQUIDACIONES", "MOD_PAGOS_PERSONAL",
                        "MOD_HISTORIAL_BCV", "MOD_ASISTENTE_IA", "MOD_APP_MOVIL", "MOD_TOLERANCIA_MERMA",
                        "MOD_CALIDAD_LECHE"
                    }
                };
                return;
            }

            var context = _httpContextAccessor.HttpContext;
            string host = "localhost";

            if (context != null)
            {
                // 1. PRIORIDAD MÁXIMA: Si el usuario está autenticado por JWT, su claim empresa_codigo es la verdad absoluta
                var claimEmpresa = context.User?.FindFirst("empresa_codigo")?.Value;
                if (!string.IsNullOrWhiteSpace(claimEmpresa))
                {
                    host = claimEmpresa.Trim();
                }
                else if (context.Request.Headers.TryGetValue("X-Tenant-Code", out var headerCode) && !string.IsNullOrWhiteSpace(headerCode))
                {
                    host = headerCode.ToString().Trim();
                }
                else if (context.Request.Headers.TryGetValue("X-Tenant-Domain", out var headerDomain) && !string.IsNullOrWhiteSpace(headerDomain))
                {
                    host = headerDomain.ToString().Trim();
                }
                else if (context.Request.Headers.TryGetValue("X-Forwarded-Host", out var fwdHost) && !string.IsNullOrWhiteSpace(fwdHost))
                {
                    host = fwdHost.ToString().Trim();
                }
                else if (context.Request.Query.TryGetValue("tenant", out var qTenant) && !string.IsNullOrWhiteSpace(qTenant))
                {
                    host = qTenant.ToString().Trim();
                }
                else if (context.Request.Headers.TryGetValue("Origin", out var origin) && !string.IsNullOrWhiteSpace(origin))
                {
                    host = origin.ToString().Trim();
                }
                else if (context.Request.Headers.TryGetValue("Referer", out var referer) && !string.IsNullOrWhiteSpace(referer))
                {
                    host = referer.ToString().Trim();
                }
                else
                {
                    host = context.Request.Host.Host;
                }
            }

            cleanHost(ref host);

            if (_tenantCache.TryGetValue(host, out var cached) && (DateTime.UtcNow - cached.cachedAt) < CacheDuration)
            {
                _currentTenant = cached.info;
                return;
            }

            try
            {
                string? masterConn = _configuration.GetConnectionString("SaasMaster")
                    ?? Environment.GetEnvironmentVariable("SAAS_MASTER_CONNECTION");

                if (!string.IsNullOrWhiteSpace(masterConn))
                {
                    using var db = new SqlConnection(AdjustConnectionStringForEnvironment(masterConn));

                    var emp = db.QueryFirstOrDefault<dynamic>(
                        @"SELECT TOP 1 Id, Codigo, NombreComercial, CadenaConexion, Estado, FechaVencimientoLicencia, DiasGraciaMora, AiTablasPermitidas
                          FROM TB_EMPRESAS
                          WHERE LOWER(DominioPrincipal) = @h
                             OR LOWER(ISNULL(SubdominioAlterno, '')) = @h
                             OR LOWER(Codigo) = @h",
                        new { h = host });

                    if (emp == null && (host == "localhost" || host == "127.0.0.1"))
                    {
                        var defaultCode = _configuration["LocalDev:TenantCode"];
                        emp = !string.IsNullOrWhiteSpace(defaultCode)
                            ? db.QueryFirstOrDefault<dynamic>(
                                "SELECT TOP 1 Id, Codigo, NombreComercial, CadenaConexion, Estado, FechaVencimientoLicencia, DiasGraciaMora, AiTablasPermitidas FROM TB_EMPRESAS WHERE Codigo = @c",
                                new { c = defaultCode })
                            : db.QueryFirstOrDefault<dynamic>(
                                "SELECT TOP 1 Id, Codigo, NombreComercial, CadenaConexion, Estado, FechaVencimientoLicencia, DiasGraciaMora, AiTablasPermitidas FROM TB_EMPRESAS WHERE Estado = 'ACTIVA' ORDER BY Id ASC");
                    }

                    if (emp != null)
                    {
                        int empId = (int)emp.Id;
                        var mods = db.Query<string>(
                            "SELECT ModuloCodigo FROM TB_EMPRESA_MODULOS WHERE EmpresaId = @empId AND Habilitado = 1",
                            new { empId }).AsList();

                        List<string>? aiTablas = null;
                        string? rawAiTablas = emp.AiTablasPermitidas as string;
                        if (!string.IsNullOrWhiteSpace(rawAiTablas))
                        {
                            try
                            {
                                if (rawAiTablas.TrimStart().StartsWith("["))
                                    aiTablas = System.Text.Json.JsonSerializer.Deserialize<List<string>>(rawAiTablas);
                                else
                                    aiTablas = rawAiTablas.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
                            }
                            catch { aiTablas = null; }
                        }

                        string effectiveConnStr = AdjustConnectionStringForEnvironment((string)emp.CadenaConexion);

                        var tInfo = new TenantInfo
                        {
                            EmpresaId = empId,
                            Codigo = emp.Codigo,
                            Nombre = emp.NombreComercial,
                            ConnectionString = effectiveConnStr,
                            Estado = emp.Estado,
                            FechaVencimiento = emp.FechaVencimientoLicencia,
                            DiasGracia = emp.DiasGraciaMora,
                            Modulos = mods,
                            AiTablasPermitidas = aiTablas
                        };

                        _tenantCache[host] = (tInfo, DateTime.UtcNow);
                        _currentTenant = tInfo;
                        return;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Fallback a conexión configurada para host {Host}: {Msg}", host, ex.Message);
            }

            // Fallback genérico basado únicamente en ConnectionStrings:DefaultConnection (Cero Hardcodeo de clientes ni credenciales)
            string fallbackConn = _configuration.GetConnectionString("DefaultConnection")
                ?? Environment.GetEnvironmentVariable("DEFAULT_CONNECTION")
                ?? string.Empty;

            _currentTenant = new TenantInfo
            {
                Codigo = _configuration["LocalDev:TenantCode"] ?? "DEFAULT",
                Nombre = _configuration["LocalDev:TenantName"] ?? "Sistema de Transporte",
                ConnectionString = string.IsNullOrWhiteSpace(fallbackConn) ? string.Empty : AdjustConnectionStringForEnvironment(fallbackConn),
                Estado = "ACTIVA",
                FechaVencimiento = DateTime.UtcNow.AddYears(1),
                Modulos = new List<string>()
            };

            _tenantCache[host] = (_currentTenant, DateTime.UtcNow);
        }

        private static void cleanHost(ref string host)
        {
            if (string.IsNullOrWhiteSpace(host)) { host = "localhost"; return; }
            if (host.Contains(',')) host = host.Split(',')[0].Trim();
            if (host.Contains("://"))
            {
                try { host = new Uri(host).Host; } catch { }
            }
            host = host.Split(':')[0].Trim().ToLower();
        }

        public string GetConnectionString() => _currentTenant?.ConnectionString
            ?? AdjustConnectionStringForEnvironment(_configuration.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("No se encontró ConnectionStrings:DefaultConnection ni tenant resuelto."));

        public string GetTenantCode() => _currentTenant?.Codigo ?? (_configuration["LocalDev:TenantCode"] ?? "DEFAULT");
        public string GetTenantName() => _currentTenant?.Nombre ?? (_configuration["LocalDev:TenantName"] ?? "Sistema de Transporte");
        public List<string> GetModulosActivos() => _currentTenant?.Modulos ?? new List<string>();
        public bool TieneModulo(string moduloCodigo)
        {
            if (string.IsNullOrWhiteSpace(moduloCodigo)) return true;
            if (_currentTenant == null || _currentTenant.Modulos == null) return false;
            return _currentTenant.Modulos.Any(m => string.Equals(m, moduloCodigo, StringComparison.OrdinalIgnoreCase));
        }

        public List<string>? GetAiTablasPermitidas() => _currentTenant?.AiTablasPermitidas;

        public bool PuedeConsultarTablaAi(string tabla, string? moduloRequerido = null)
        {
            if (!string.IsNullOrWhiteSpace(moduloRequerido) && !TieneModulo(moduloRequerido))
                return false;
            var permitidas = _currentTenant?.AiTablasPermitidas;
            if (permitidas == null) return true;
            return permitidas.Any(t => string.Equals(t, tabla, StringComparison.OrdinalIgnoreCase));
        }
    }
}
