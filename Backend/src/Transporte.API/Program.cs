using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Transporte.Infrastructure.Data;
using Transporte.Infrastructure.Repositories;
using Transporte.Infrastructure.Security;
using Transporte.Infrastructure.Services;

// Localizar dinámicamente wwwroot para que funcione tanto en publish como en dotnet run
var baseDir = AppContext.BaseDirectory;
var currentDir = Directory.GetCurrentDirectory();

string ResolveWebRoot()
{
    var candidates = new[]
    {
        Path.Combine(baseDir, "wwwroot"),
        Path.Combine(currentDir, "Backend", "src", "Transporte.API", "wwwroot"),
        Path.Combine(currentDir, "wwwroot"),
        Path.Combine(currentDir, "Frontend")
    };

    foreach (var candidate in candidates)
    {
        if (Directory.Exists(candidate) && File.Exists(Path.Combine(candidate, "index.html")))
        {
            return Path.GetFullPath(candidate);
        }
    }
    return Path.Combine(baseDir, "wwwroot");
}

var resolvedWebRoot = ResolveWebRoot();

var isProd = args.Any(a => a.Contains("5190") || a.Equals("Production", StringComparison.OrdinalIgnoreCase)) 
             || Environment.GetEnvironmentVariable("ASPNETCORE_URLS")?.Contains("5190") == true
             || Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")?.Equals("Production", StringComparison.OrdinalIgnoreCase) == true;

var isDev = args.Any(a => a.Contains("5188") || a.Equals("Development", StringComparison.OrdinalIgnoreCase)) 
            || Environment.GetEnvironmentVariable("ASPNETCORE_URLS")?.Contains("5188") == true
            || Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")?.Equals("Development", StringComparison.OrdinalIgnoreCase) == true;

var targetEnv = isProd ? "Production" : (isDev ? "Development" : (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production"));

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = baseDir,
    WebRootPath = resolvedWebRoot,
    EnvironmentName = targetEnv
});

builder.Configuration
    .SetBasePath(baseDir)
    .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
    .AddJsonFile($"appsettings.{targetEnv}.json", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables()
    .AddCommandLine(args);

// Configuración dinámica de Puerto / URL según Entorno
var configuredUrl = builder.Configuration["Server:Url"];
if (string.IsNullOrEmpty(configuredUrl))
{
    var defaultPort = builder.Environment.IsDevelopment() ? 5188 : 5190;
    var port = builder.Configuration.GetValue<int?>("Server:Port") ?? defaultPort;
    configuredUrl = $"http://0.0.0.0:{port}";
}

// Respetar variable ASPNETCORE_URLS o argumento --urls si fueron pasados explícitamente
if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")) && 
    !args.Any(a => a.StartsWith("--urls", StringComparison.OrdinalIgnoreCase)))
{
    builder.WebHost.UseUrls(configuredUrl);
}

// 1. Inyección de Dependencias
builder.Services.AddHttpContextAccessor();
builder.Services.AddHttpClient();
builder.Services.AddScoped<Transporte.Core.Interfaces.ITenantService, Transporte.API.Multitenancy.TenantService>();
builder.Services.AddScoped<IDbConnectionFactory, SqlConnectionFactory>();
builder.Services.AddSingleton<IPasswordService, BcryptPasswordService>();
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IGeminiOcrService, GeminiOcrService>();

builder.Services.AddScoped<IAuthRepository, AuthRepository>();
builder.Services.AddScoped<IBcvRepository, BcvRepository>();
builder.Services.AddScoped<IRutasRepository, RutasRepository>();
builder.Services.AddScoped<IEntregasRepository, EntregasRepository>();
builder.Services.AddScoped<ICatalogosRepository, CatalogosRepository>();
builder.Services.AddScoped<ICiclosRepository, CiclosRepository>();
builder.Services.AddScoped<IReportesRepository, ReportesRepository>();
builder.Services.AddScoped<IAdelantosRepository, AdelantosRepository>();
builder.Services.AddScoped<IChatRepository, ChatRepository>();
builder.Services.AddScoped<IUsuariosRepository, UsuariosRepository>();
builder.Services.AddScoped<IControlRutasRepository, ControlRutasRepository>();
builder.Services.AddScoped<IControlCompaniasRepository, ControlCompaniasRepository>();
builder.Services.AddScoped<IPagosUsuariosRepository, PagosUsuariosRepository>();
builder.Services.AddScoped<IPermisosRepository, PermisosRepository>();
builder.Services.AddScoped<IConfiguracionRepository, ConfiguracionRepository>();
builder.Services.AddScoped<IRutasLogisticaRepository, RutasLogisticaRepository>();
builder.Services.AddScoped<IMapaRutasRepository, MapaRutasRepository>();
builder.Services.AddScoped<ICombustibleRepository, CombustibleRepository>();
builder.Services.AddScoped<IMantenimientoCamionesRepository, MantenimientoCamionesRepository>();
builder.Services.AddScoped<IRepuestosRepository, RepuestosRepository>();
builder.Services.AddScoped<INotificacionesRepository, NotificacionesRepository>();
builder.Services.AddScoped<IExamenesLecheRepository, ExamenesLecheRepository>();

// 2. Controladores
builder.Services.AddControllers();

// 3. CORS Configurable (sin AllowAll abierto en Producción)
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        if (allowedOrigins.Length > 0)
        {
            policy.SetIsOriginAllowed(origin =>
            {
                if (allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)) return true;
                if (Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                {
                    return allowedOrigins.Any(ao => ao.StartsWith("*.", StringComparison.Ordinal) &&
                        uri.Host.EndsWith(ao[1..], StringComparison.OrdinalIgnoreCase));
                }
                return false;
            })
            .AllowAnyMethod()
            .AllowAnyHeader();
        }
        else
        {
            policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
        }
    });
});

// 4. JWT (sin clave hardcodeada en Producción)
var jwtKey = builder.Configuration["Jwt:SecretKey"] ?? builder.Configuration["Jwt:Key"] ?? Environment.GetEnvironmentVariable("JWT_SECRET_KEY");
if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.StartsWith("__INYECTAR", StringComparison.OrdinalIgnoreCase))
{
    if (!builder.Environment.IsDevelopment())
    {
        throw new InvalidOperationException("Jwt:SecretKey (o variable JWT_SECRET_KEY) es obligatoria en QA/Producción.");
    }
    jwtKey = "DevLocalOnly_TransporteJwtSecretKey_Minimum32Chars!";
}
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "TransporteAPI";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "TransporteApp";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateIssuer = true,
        ValidIssuer = jwtIssuer,
        ValidateAudience = true,
        ValidAudience = jwtAudience,
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddAuthorization();

// 4.5 Rate Limiting nativo (.NET 8) contra fuerza bruta en autenticación y vinculación móvil
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            message = "Demasiados intentos en poco tiempo. Por favor espera 1 minuto e intenta nuevamente."
        }, token);
    };

    options.AddPolicy("auth-strict", httpContext =>
    {
        var forwardedFor = httpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        var clientIp = !string.IsNullOrWhiteSpace(forwardedFor)
            ? forwardedFor.Split(',')[0].Trim()
            : (httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown");

        return System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: clientIp,
            factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = 15,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
});

// 5. Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "API Transporte y Rutas de Leche",
        Version = "v1",
        Description = "API REST para gestiÃ³n de recolecciÃ³n de leche, mermas, tasas BCV y liquidaciones"
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Ingresa únicamente tu token JWT generado en /api/Auth/login"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });

    c.ResolveConflictingActions(apiDescriptions => apiDescriptions.First());
    c.CustomSchemaIds(type => type.FullName ?? type.Name);
});

var app = builder.Build();

// Middleware global de excepciones para evitar filtrar detalles internos o stack traces
app.UseExceptionHandler(errApp =>
{
    errApp.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            message = "Ocurrió un error interno en el servidor. Intenta nuevamente o contacta soporte."
        });
    });
});

// Redirección opcional configurable desde RedirectDomains en appsettings/env (Cero dominios hardcodeados)
var redirectDomains = builder.Configuration.GetSection("RedirectDomains").Get<Dictionary<string, string>>() ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
if (redirectDomains.Count > 0)
{
    app.Use(async (context, next) =>
    {
        var host = context.Request.Host.Host.ToLower();
        var path = context.Request.Path.Value ?? "";

        if (!path.StartsWith("/api", StringComparison.OrdinalIgnoreCase) &&
            !path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase) &&
            !path.StartsWith("/_", StringComparison.OrdinalIgnoreCase) &&
            redirectDomains.TryGetValue(host, out var targetHost) &&
            !string.IsNullOrWhiteSpace(targetHost))
        {
            var targetUrl = $"https://{targetHost}{path}{context.Request.QueryString}";
            context.Response.Redirect(targetUrl, permanent: false);
            return;
        }
        await next();
    });
}

// Habilitar archivos estáticos para la UI (Frontend PWA en wwwroot)
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        var path = ctx.File.Name.ToLower();

        // En desarrollo o archivos de UI SPA, evitar caché obsoleta en el navegador del usuario
        if (app.Environment.IsDevelopment() || path.EndsWith(".html") || path.EndsWith(".js") || path.EndsWith(".css"))
        {
            ctx.Context.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
            ctx.Context.Response.Headers["Pragma"] = "no-cache";
            ctx.Context.Response.Headers["Expires"] = "0";
        }

        if (path.EndsWith(".html"))
        {
            ctx.Context.Response.ContentType = "text/html; charset=utf-8";
        }
        else if (path.EndsWith(".js"))
        {
            ctx.Context.Response.ContentType = "application/javascript; charset=utf-8";
        }
        else if (path.EndsWith(".css"))
        {
            ctx.Context.Response.ContentType = "text/css; charset=utf-8";
        }
    }
});

app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "API Transporte v1");
    c.RoutePrefix = "swagger"; // Swagger en /swagger
});

app.UseCors("AllowAll");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Endpoint de diagnóstico del Entorno y Base de Datos (solo Admin/SuperAdmin)
app.MapGet("/api/system/environment", [Microsoft.AspNetCore.Authorization.Authorize(Roles = "ADMIN,SUPERADMIN")] (IConfiguration config, IWebHostEnvironment env) =>
{
    var connStr = config.GetConnectionString("DefaultConnection") 
                  ?? config.GetConnectionString("BD_TRANSPORTE") 
                  ?? config["ConnectionStrings:DefaultConnection"] 
                  ?? config["ConnectionStrings:BD_TRANSPORTE"] 
                  ?? "";
    var dbName = "Unknown";
    var match = System.Text.RegularExpressions.Regex.Match(connStr, @"Initial Catalog=([^;]+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    if (match.Success) dbName = match.Groups[1].Value.Trim();

    var defaultPort = env.IsDevelopment() ? 5188 : 5190;
    var port = config.GetValue<int?>("Server:Port") ?? defaultPort;

    return Results.Ok(new
    {
        environment = env.EnvironmentName,
        database = dbName,
        port = port,
        serverTime = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
        status = "ONLINE"
    });
});

// Fallback inteligente para SPA / PWA (excluye /api, /swagger, /_vs, /_framework)
app.MapFallback(async context =>
{
    var path = context.Request.Path.Value ?? "";
    if (path.StartsWith("/api", StringComparison.OrdinalIgnoreCase) || 
        path.StartsWith("/_", StringComparison.OrdinalIgnoreCase) || 
        path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    var indexPath = Path.Combine(app.Environment.WebRootPath ?? "wwwroot", "index.html");
    if (File.Exists(indexPath))
    {
        context.Response.ContentType = "text/html; charset=utf-8";
        await context.Response.SendFileAsync(indexPath);
    }
    else
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
    }
});

app.Run();