using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using TrazaLac.API.Controllers;
using TrazaLac.API.Security;
using TrazaLac.Core.Entities;
using TrazaLac.Infrastructure.Security;
using Xunit;

namespace TrazaLac.Tests;

public class SeguridadYArquitecturaTests
{
    [Fact]
    public void TodosLosControllersApi_DebenTenerAuthorize()
    {
        var apiAssembly = typeof(AuthController).Assembly;
        var controllers = apiAssembly.GetTypes()
            .Where(t => !t.IsAbstract && typeof(ControllerBase).IsAssignableFrom(t))
            .ToList();

        Assert.NotEmpty(controllers);

        var sinAuthorize = controllers
            .Where(c =>
            {
                if (c.GetCustomAttribute<AuthorizeAttribute>() != null) return false;
                var acciones = c.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                    .Where(m => !m.IsSpecialName && m.GetCustomAttributes().Any(a => a.GetType().Name.StartsWith("Http")));
                return acciones.Any(m =>
                    m.GetCustomAttribute<AuthorizeAttribute>() == null &&
                    m.GetCustomAttribute<AllowAnonymousAttribute>() == null);
            })
            .Select(c => c.Name)
            .ToList();

        Assert.Empty(sinAuthorize);
    }

    [Theory]
    [InlineData(typeof(AdelantosController))]
    [InlineData(typeof(PagosUsuariosController))]
    [InlineData(typeof(PermisosController))]
    [InlineData(typeof(UsuariosController))]
    [InlineData(typeof(ImportacionDataController))]
    [InlineData(typeof(CombustibleController))]
    [InlineData(typeof(MantenimientoCamionesController))]
    [InlineData(typeof(RepuestosController))]
    [InlineData(typeof(ReportesController))]
    public void ControllersCriticos_DebenTenerRequirePermission(Type controllerType)
    {
        var hasClassAttr = controllerType.GetCustomAttributes<RequirePermissionAttribute>().Any();
        Assert.True(hasClassAttr, $"{controllerType.Name} debe tener [RequirePermission] dinámico.");
    }

    [Theory]
    [InlineData(nameof(AuthController.Login))]
    [InlineData(nameof(AuthController.VincularDispositivo))]
    public void AuthEndpointsPublicos_DebenTenerRateLimiting(string methodName)
    {
        var method = typeof(AuthController).GetMethod(methodName);
        Assert.NotNull(method);
        var attr = method!.GetCustomAttribute<EnableRateLimitingAttribute>();
        Assert.NotNull(attr);
        Assert.Equal("auth-strict", attr!.PolicyName);
    }

    [Theory]
    [InlineData(typeof(CamionesController))]
    [InlineData(typeof(BcvController))]
    [InlineData(typeof(ConfiguracionController))]
    [InlineData(typeof(ExamenesLecheController))]
    public void EndpointsEscritura_DebenUsarRequirePermissionYSinRolesHardcodeados(Type controllerType)
    {
        var writeMethods = controllerType.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => m.GetCustomAttributes().Any(a =>
                a is HttpPostAttribute || a is HttpPutAttribute || a is HttpDeleteAttribute))
            .ToList();

        Assert.NotEmpty(writeMethods);
        foreach (var m in writeMethods)
        {
            var authRoleAttr = m.GetCustomAttribute<AuthorizeAttribute>();
            Assert.True(string.IsNullOrWhiteSpace(authRoleAttr?.Roles),
                $"{controllerType.Name}.{m.Name} no debe usar [Authorize(Roles=...)] hardcodeado.");
            Assert.True(m.GetCustomAttributes<RequirePermissionAttribute>().Any(),
                $"{controllerType.Name}.{m.Name} debe usar [RequirePermission] dinámico.");
        }
    }

    [Fact]
    public void JwtTokenService_DebeRechazarAusenciaDeSecretoEnProduccion()
    {
        var prevEnv = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        var prevJwt = Environment.GetEnvironmentVariable("JWT_SECRET_KEY");
        try
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Production");
            Environment.SetEnvironmentVariable("JWT_SECRET_KEY", null);

            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>())
                .Build();

            var service = new JwtTokenService(config);
            var user = new Usuario { Id = 1, Username = "test", NombreCompleto = "Test", Rol = "ADMIN" };

            Assert.Throws<InvalidOperationException>(() => service.GenerateToken(user, new List<string>()));
        }
        finally
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", prevEnv);
            Environment.SetEnvironmentVariable("JWT_SECRET_KEY", prevJwt);
        }
    }
}
