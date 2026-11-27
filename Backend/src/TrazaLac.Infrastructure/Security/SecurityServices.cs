using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using TrazaLac.Core.Entities;

namespace TrazaLac.Infrastructure.Security;

public interface IPasswordService
{
    string HashPassword(string password);
    bool VerifyPassword(string password, string hash);
}

public class BcryptPasswordService : IPasswordService
{
    public string HashPassword(string password) => BCrypt.Net.BCrypt.HashPassword(password, 11);
    public bool VerifyPassword(string password, string hash)
    {
        if (string.IsNullOrEmpty(hash) || string.IsNullOrEmpty(password)) return false;
        try
        {
            if (hash.StartsWith("$2a$") || hash.StartsWith("$2b$") || hash.StartsWith("$2y$"))
            {
                return BCrypt.Net.BCrypt.Verify(password, hash);
            }
            return password == hash;
        }
        catch
        {
            return false;
        }
    }
}

public interface IJwtTokenService
{
    string GenerateToken(Usuario usuario, List<string> permisos);
}

public class JwtTokenService : IJwtTokenService
{
    private readonly IConfiguration _configuration;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string GenerateToken(Usuario usuario, List<string> permisos)
    {
        var secret = _configuration["Jwt:SecretKey"] ?? _configuration["Jwt:Key"] ?? Environment.GetEnvironmentVariable("JWT_SECRET_KEY");
        if (string.IsNullOrWhiteSpace(secret) || secret.StartsWith("__INYECTAR", StringComparison.OrdinalIgnoreCase))
        {
            if (!string.Equals(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Development", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Jwt:SecretKey (o variable JWT_SECRET_KEY) es obligatoria en QA/Producción.");
            secret = "DevLocalOnly_TransporteJwtSecretKey_Minimum32Chars!";
        }
        var issuer = _configuration["Jwt:Issuer"] ?? "TransporteAPI";
        var audience = _configuration["Jwt:Audience"] ?? "TransporteApp";

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, usuario.Id.ToString()),
            new(ClaimTypes.Name, usuario.Username),
            new(ClaimTypes.GivenName, usuario.NombreCompleto),
            new(ClaimTypes.Role, usuario.Rol)
        };

        // Agregar permisos atÃ³micos como claims
        foreach (var permiso in permisos)
        {
            claims.Add(new Claim("Permission", permiso));
        }

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7), // Token de 7 dÃ­as ideal para choferes en campo
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}