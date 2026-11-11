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

            // Forzar protocolo TCP directo para eliminar el bloqueo de 15s de Named Pipes/Shared Memory
            if (!connStr.Contains("tcp:", StringComparison.OrdinalIgnoreCase))
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
                string sqlHost = IsRunningInDocker ? "sql_instancia" : (OperatingSystem.IsLinux() ? "127.0.0.1" : "84.247.178.194");
                string masterConn = $"Server=tcp:{sqlHost},1433;Database=DB_SAAS_MASTER;User Id=sa;Password=sql_HO_2026!;TrustServerCertificate=True;Encrypt=False;Connect Timeout=10;Pooling=true;";
                using var db = new SqlConnection(masterConn);
                
                var emp = db.QueryFirstOrDefault<dynamic>(
                    @"SELECT Id, Codigo, NombreComercial, CadenaConexion, Estado, FechaVencimientoLicencia, DiasGraciaMora
                      FROM TB_EMPRESAS
                      WHERE DominioPrincipal = @h 
                         OR SubdominioAlterno = @h 
                         OR Codigo = @h 
                         OR (@h LIKE '%vergel%' AND Codigo = 'VERGEL_CARRILLO')
                         OR (@h LIKE '%campoverde%' AND Codigo = 'CAMPO_VERDE')
                         OR (@h LIKE '%base%' AND Codigo = 'PRODUCTO_BASE')",
                    new { h = host });

                if (emp == null && (host == "localhost" || host == "127.0.0.1" || host == "84.247.178.194"))
                {
                    emp = db.QueryFirstOrDefault<dynamic>(
                        "SELECT Id, Codigo, NombreComercial, CadenaConexion, Estado, FechaVencimientoLicencia, DiasGraciaMora FROM TB_EMPRESAS WHERE Codigo = 'VERGEL_CARRILLO'");
                }

                if (emp != null)
                {
                    int empId = (int)emp.Id;
                    var mods = db.Query<string>(
                        "SELECT ModuloCodigo FROM TB_EMPRESA_MODULOS WHERE EmpresaId = @empId AND Habilitado = 1",
                        new { empId }).AsList();

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
                        Modulos = mods
                    };

                    _tenantCache[host] = (tInfo, DateTime.UtcNow);
                    _currentTenant = tInfo;
                    return;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Fallback a conexión local para host {Host}: {Msg}", host, ex.Message);
            }

            // Fallback inteligente según el subdominio/host solicitado para evitar contaminación cruzada de tenants
            bool isVergel = host.Contains("vergel", StringComparison.OrdinalIgnoreCase) || host.Equals("VERGEL_CARRILLO", StringComparison.OrdinalIgnoreCase);
            bool isCampo = host.Contains("campoverde", StringComparison.OrdinalIgnoreCase) || host.Equals("CAMPO_VERDE", StringComparison.OrdinalIgnoreCase);
            bool isBase = host.Contains("base", StringComparison.OrdinalIgnoreCase) || host.Equals("PRODUCTO_BASE", StringComparison.OrdinalIgnoreCase);

            string fallbackDb = isCampo 
                ? "DB_PROD_CAMPO_VERDE" 
                : (isBase ? "DB_PRODUCTO_BASE" : "DB_PROD_TRANSPORTE_VERGEL_CARRILLO");

            string fallbackUser = isCampo ? "user_campoverde" : "sa";
            string fallbackPass = isCampo ? "Campo_Verde_2026!" : "sql_HO_2026!";

            string sqlInstHost = IsRunningInDocker ? "sql_instancia" : "127.0.0.1";
            string fallbackConn = $"Server=tcp:{sqlInstHost},1433;Database={fallbackDb};User Id={fallbackUser};Password={fallbackPass};TrustServerCertificate=True;Encrypt=False;Connect Timeout=30;Pooling=true;";

            _currentTenant = new TenantInfo
            {
                Codigo = isCampo ? "CAMPO_VERDE" : (isBase ? "PRODUCTO_BASE" : "VERGEL_CARRILLO"),
                Nombre = isCampo 
                    ? "Productos Lácteos Campo Verde, C.A." 
                    : (isBase ? "Sistema Transporte V2 (Producto Base Demo)" : "Transporte Vergel & Carrillo"),
                ConnectionString = AdjustConnectionStringForEnvironment(fallbackConn),
                Estado = "ACTIVA",
                FechaVencimiento = DateTime.UtcNow.AddYears(1),
                Modulos = isCampo 
                    ? new List<string> { "MOD_DASHBOARD", "MOD_LECHE_VACA", "MOD_LOGISTICA_RUTAS", "MOD_RECEPTORIA", "MOD_COMBUSTIBLE", "MOD_MANTENIMIENTO", "MOD_REPUESTOS", "MOD_LIQUIDACIONES", "MOD_HISTORIAL_BCV" }
                    : new List<string> { "MOD_DASHBOARD", "MOD_LECHE_VACA", "MOD_LECHE_BUFALA", "MOD_LOGISTICA_RUTAS", "MOD_RECEPTORIA", "MOD_COMBUSTIBLE", "MOD_MANTENIMIENTO", "MOD_REPUESTOS", "MOD_LIQUIDACIONES", "MOD_HISTORIAL_BCV", "MOD_ASISTENTE_IA" }
            };

            // Cachear fallback por 5 segundos para reintentar prontamente la conexión con DB_SAAS_MASTER
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
            ?? "Server=84.247.178.194,1433;Database=DB_PROD_TRANSPORTE_VERGEL_CARRILLO;User Id=sa;Password=sql_HO_2026!;TrustServerCertificate=True;");

        public string GetTenantCode() => _currentTenant?.Codigo ?? "VERGEL_CARRILLO";
        public string GetTenantName() => _currentTenant?.Nombre ?? "Transporte Vergel & Carrillo";
        public List<string> GetModulosActivos() => _currentTenant?.Modulos ?? new List<string>();
        public bool TieneModulo(string moduloCodigo)
        {
            if (string.IsNullOrWhiteSpace(moduloCodigo)) return true;
            if (_currentTenant == null || _currentTenant.Modulos == null) return false;
            return _currentTenant.Modulos.Any(m => string.Equals(m, moduloCodigo, StringComparison.OrdinalIgnoreCase));
        }
    }
}
