using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using TrazaLac.Core.Interfaces;

namespace TrazaLac.Infrastructure.Data;

public interface IDbConnectionFactory
{
    IDbConnection CreateConnection();
}

public class SqlConnectionFactory : IDbConnectionFactory
{
    private readonly ITenantService? _tenantService;
    private readonly string? _fallbackConnectionString;

    public SqlConnectionFactory(IConfiguration configuration, ITenantService? tenantService = null)
    {
        _tenantService = tenantService;
        _fallbackConnectionString = configuration.GetConnectionString("BD_TRANSPORTE")
            ?? configuration.GetConnectionString("DefaultConnection")
            ?? Environment.GetEnvironmentVariable("DEFAULT_CONNECTION")
            ?? string.Empty;
    }

    public IDbConnection CreateConnection()
    {
        var connStr = _tenantService?.GetConnectionString() ?? _fallbackConnectionString!;
        if (File.Exists("/.dockerenv") || string.Equals(Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER"), "true", StringComparison.OrdinalIgnoreCase))
        {
            connStr = connStr.Replace("84.247.178.194", "sql_instancia").Replace("127.0.0.1", "sql_instancia");
        }
        return new SqlConnection(connStr);
    }
}
