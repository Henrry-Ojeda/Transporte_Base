using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using TrazaLac.Core.DTOs;

namespace TrazaLac.Infrastructure.Repositories
{
    public interface IConfiguracionRepository
    {
        Task<IEnumerable<ParametroSistemaDto>> ObtenerParametrosAsync(string? categoria = null);
        Task<ParametroSistemaDto?> ObtenerParametroPorClaveAsync(string clave);
        Task<bool> GuardarParametroAsync(GuardarParametroDto dto, string? usuario = null);
        Task<bool> EliminarParametroAsync(string clave);

        Task<IEnumerable<TipoLecheDto>> ObtenerTiposLecheAsync(bool soloActivos = false);
        Task<TipoLecheDto?> ObtenerTipoLechePorIdAsync(int id);
        Task<bool> GuardarTipoLecheAsync(GuardarTipoLecheDto dto);
        Task<bool> ToggleTipoLecheAsync(int id, bool activo);
        Task<bool> EliminarTipoLecheAsync(int id);
        
        Task<IEnumerable<ModuloMenuDto>> ObtenerModulosMenuAsync(bool soloActivos = true);
        Task<IEnumerable<ReporteConfigDto>> ObtenerReportesConfigAsync(bool soloActivos = true);
        Task<IEnumerable<DashboardWidgetDto>> ObtenerWidgetsDashboardAsync(bool soloActivos = true);
        
        Task<bool> ToggleWidgetDashboardAsync(int id, bool activo);
        Task<bool> ToggleReporteConfigAsync(int id, bool activo);
        Task<bool> ToggleModuloMenuAsync(int id, bool activo);
        Task<bool> ActualizarOrdenModuloAsync(int id, int nuevoOrden);
    }

    public class ConfiguracionRepository : IConfiguracionRepository
    {
        private readonly string _connectionString;

        public ConfiguracionRepository(IConfiguration configuration, TrazaLac.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection") 
                ?? configuration.GetConnectionString("BD_TRANSPORTE") 
                ?? "Server=localhost;Database=BD_TRANSPORTE_V2;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        private IDbConnection CreateConnection() => new SqlConnection(_connectionString);

        // ====================================================================
        // PARÁMETROS DEL SISTEMA
        // ====================================================================
        public async Task<IEnumerable<ParametroSistemaDto>> ObtenerParametrosAsync(string? categoria = null)
        {
            using var db = CreateConnection();
            string sql = "SELECT * FROM TB_PARAMETROS_SISTEMA WHERE 1=1";
            if (!string.IsNullOrWhiteSpace(categoria))
            {
                sql += " AND Categoria = @categoria";
            }
            sql += " ORDER BY Categoria, Clave";
            return await db.QueryAsync<ParametroSistemaDto>(sql, new { categoria });
        }

        public async Task<ParametroSistemaDto?> ObtenerParametroPorClaveAsync(string clave)
        {
            using var db = CreateConnection();
            const string sql = "SELECT * FROM TB_PARAMETROS_SISTEMA WHERE Clave = @clave";
            return await db.QueryFirstOrDefaultAsync<ParametroSistemaDto>(sql, new { clave });
        }

        public async Task<bool> GuardarParametroAsync(GuardarParametroDto dto, string? usuario = null)
        {
            using var db = CreateConnection();
            const string sql = @"
                IF EXISTS (SELECT 1 FROM TB_PARAMETROS_SISTEMA WHERE Clave = @Clave)
                BEGIN
                    UPDATE TB_PARAMETROS_SISTEMA 
                    SET Valor = @Valor, 
                        Descripcion = COALESCE(@Descripcion, Descripcion),
                        Categoria = COALESCE(@Categoria, Categoria),
                        FechaModificacion = GETDATE(),
                        ModificadoPor = @usuario
                    WHERE Clave = @Clave
                END
                ELSE
                BEGIN
                    INSERT INTO TB_PARAMETROS_SISTEMA (Clave, Valor, Descripcion, Categoria, ModificadoPor)
                    VALUES (@Clave, @Valor, @Descripcion, COALESCE(@Categoria, 'GENERAL'), @usuario)
                END";

            var rows = await db.ExecuteAsync(sql, new {
                dto.Clave,
                dto.Valor,
                dto.Descripcion,
                dto.Categoria,
                usuario
            });

            return rows > 0;
        }

        public async Task<bool> EliminarParametroAsync(string clave)
        {
            using var db = CreateConnection();
            const string sql = "DELETE FROM TB_PARAMETROS_SISTEMA WHERE Clave = @clave";
            var rows = await db.ExecuteAsync(sql, new { clave });
            return rows > 0;
        }

        // ====================================================================
        // TIPOS DE LECHE
        // ====================================================================
        public async Task<IEnumerable<TipoLecheDto>> ObtenerTiposLecheAsync(bool soloActivos = false)
        {
            using var db = CreateConnection();
            string sql = "SELECT * FROM TB_TIPOS_LECHE WHERE 1=1";
            if (soloActivos) sql += " AND Activo = 1";
            sql += " ORDER BY Orden ASC, Nombre ASC";
            return await db.QueryAsync<TipoLecheDto>(sql);
        }

        public async Task<TipoLecheDto?> ObtenerTipoLechePorIdAsync(int id)
        {
            using var db = CreateConnection();
            const string sql = "SELECT * FROM TB_TIPOS_LECHE WHERE Id = @id";
            return await db.QueryFirstOrDefaultAsync<TipoLecheDto>(sql, new { id });
        }

        public async Task<bool> GuardarTipoLecheAsync(GuardarTipoLecheDto dto)
        {
            using var db = CreateConnection();
            if (dto.Id.HasValue && dto.Id.Value > 0)
            {
                const string sqlUpdate = @"
                    UPDATE TB_TIPOS_LECHE 
                    SET Codigo = @Codigo,
                        Nombre = @Nombre,
                        FactorPrecio = @FactorPrecio,
                        EsAcida = @EsAcida,
                        ColorBadge = @ColorBadge,
                        Activo = @Activo,
                        Orden = @Orden
                    WHERE Id = @Id";
                var rows = await db.ExecuteAsync(sqlUpdate, dto);
                return rows > 0;
            }
            else
            {
                const string sqlInsert = @"
                    INSERT INTO TB_TIPOS_LECHE (Codigo, Nombre, FactorPrecio, EsAcida, ColorBadge, Activo, Orden)
                    VALUES (@Codigo, @Nombre, @FactorPrecio, @EsAcida, @ColorBadge, @Activo, @Orden)";
                var rows = await db.ExecuteAsync(sqlInsert, dto);
                return rows > 0;
            }
        }

        public async Task<bool> ToggleTipoLecheAsync(int id, bool activo)
        {
            using var db = CreateConnection();
            const string sql = "UPDATE TB_TIPOS_LECHE SET Activo = @activo WHERE Id = @id";
            var rows = await db.ExecuteAsync(sql, new { id, activo });
            return rows > 0;
        }

        public async Task<bool> EliminarTipoLecheAsync(int id)
        {
            using var db = CreateConnection();
            const string sql = "DELETE FROM TB_TIPOS_LECHE WHERE Id = @id";
            var rows = await db.ExecuteAsync(sql, new { id });
            return rows > 0;
        }

        // ====================================================================
        // NAVEGACIÓN Y MENÚ DINÁMICO
        // ====================================================================
        public async Task<IEnumerable<ModuloMenuDto>> ObtenerModulosMenuAsync(bool soloActivos = true)
        {
            using var db = CreateConnection();
            string sql = @"
                SELECT 
                    Id, 
                    Codigo, 
                    Nombre, 
                    Icono, 
                    RutaVista, 
                    PermisoRequerido, 
                    EsMenuLateral, 
                    BadgeTexto, 
                    Orden, 
                    Activo 
                FROM TB_MODULOS 
                WHERE 1=1";

            if (soloActivos) sql += " AND Activo = 1 AND EsMenuLateral = 1";
            sql += " ORDER BY Orden ASC, Nombre ASC";

            return await db.QueryAsync<ModuloMenuDto>(sql);
        }

        public async Task<bool> ToggleModuloMenuAsync(int id, bool activo)
        {
            using var db = CreateConnection();
            const string sql = "UPDATE TB_MODULOS SET Activo = @activo WHERE Id = @id";
            var rows = await db.ExecuteAsync(sql, new { id, activo });
            return rows > 0;
        }

        public async Task<bool> ActualizarOrdenModuloAsync(int id, int nuevoOrden)
        {
            using var db = CreateConnection();
            const string sql = "UPDATE TB_MODULOS SET Orden = @nuevoOrden WHERE Id = @id";
            var rows = await db.ExecuteAsync(sql, new { id, nuevoOrden });
            return rows > 0;
        }

        // ====================================================================
        // REPORTES DINÁMICOS
        // ====================================================================
        public async Task<IEnumerable<ReporteConfigDto>> ObtenerReportesConfigAsync(bool soloActivos = true)
        {
            using var db = CreateConnection();
            string sql = "SELECT * FROM TB_REPORTES_CONFIG WHERE 1=1";
            if (soloActivos) sql += " AND Activo = 1";
            sql += " ORDER BY Orden ASC, Titulo ASC";
            return await db.QueryAsync<ReporteConfigDto>(sql);
        }

        public async Task<bool> ToggleReporteConfigAsync(int id, bool activo)
        {
            using var db = CreateConnection();
            const string sql = "UPDATE TB_REPORTES_CONFIG SET Activo = @activo WHERE Id = @id";
            var rows = await db.ExecuteAsync(sql, new { id, activo });
            return rows > 0;
        }

        // ====================================================================
        // WIDGETS DEL DASHBOARD
        // ====================================================================
        public async Task<IEnumerable<DashboardWidgetDto>> ObtenerWidgetsDashboardAsync(bool soloActivos = true)
        {
            using var db = CreateConnection();
            try
            {
                const string seedMetricasSql = @"
                    IF NOT EXISTS (SELECT 1 FROM TB_DASHBOARD_WIDGETS WHERE Codigo = 'DASHBOARD_METRICAS_RUTA')
                        INSERT INTO TB_DASHBOARD_WIDGETS (Codigo, Titulo, Subtitulo, TipoWidget, EndpointDatos, AnchoColumnas, ColorTema, Icono, PermisoRequerido, Orden, Activo)
                        VALUES ('DASHBOARD_METRICAS_RUTA', '1. Métricas de Servicio de Ruta', 'Recolección en fincas de ruta, entradas a silos, stock, despachos y merma de ruta', 'SECCION_METRICAS', '/api/rutas/hoy', 12, 'blue', 'fa-road', 'DASHBOARD_VER', 10, 1);

                    IF NOT EXISTS (SELECT 1 FROM TB_DASHBOARD_WIDGETS WHERE Codigo = 'DASHBOARD_METRICAS_TRANSPORTE')
                        INSERT INTO TB_DASHBOARD_WIDGETS (Codigo, Titulo, Subtitulo, TipoWidget, EndpointDatos, AnchoColumnas, ColorTema, Icono, PermisoRequerido, Orden, Activo)
                        VALUES ('DASHBOARD_METRICAS_TRANSPORTE', '2. Métricas de Servicio de Transporte', 'Recolección transporte, entrega directa a planta, custodia en silos y merma transporte', 'SECCION_METRICAS', '/api/rutas/hoy', 12, 'purple', 'fa-truck-fast', 'DASHBOARD_VER', 11, 1);

                    IF NOT EXISTS (SELECT 1 FROM TB_DASHBOARD_WIDGETS WHERE Codigo = 'DASHBOARD_METRICAS_CONSOLIDADO')
                        INSERT INTO TB_DASHBOARD_WIDGETS (Codigo, Titulo, Subtitulo, TipoWidget, EndpointDatos, AnchoColumnas, ColorTema, Icono, PermisoRequerido, Orden, Activo)
                        VALUES ('DASHBOARD_METRICAS_CONSOLIDADO', '3. Consolidado General (Ruta + Transporte)', 'Total recolectado, entradas a silos, stock en tanques, total despachado y merma consolidada', 'SECCION_METRICAS', '/api/receptoria/balance-volumetrico', 12, 'emerald', 'fa-chart-pie', 'DASHBOARD_VER', 12, 1);

                    IF NOT EXISTS (SELECT 1 FROM TB_DASHBOARD_WIDGETS WHERE Codigo = 'DASHBOARD_GRAFICOS')
                        INSERT INTO TB_DASHBOARD_WIDGETS (Codigo, Titulo, Subtitulo, TipoWidget, EndpointDatos, AnchoColumnas, ColorTema, Icono, PermisoRequerido, Orden, Activo)
                        VALUES ('DASHBOARD_GRAFICOS', '4. Tablero de Gráficos y Tendencia', 'Tendencia operativa histórica, desempeño por chofer, distribución por servicio, destino y leche ácida', 'SECCION_METRICAS', '/api/reportes/dashboard-avanzado', 12, 'indigo', 'fa-chart-line', 'DASHBOARD_VER', 13, 1);";
                await db.ExecuteAsync(seedMetricasSql);
            }
            catch { /* Tolerante si la tabla o columnas varían */ }

            string sql = "SELECT * FROM TB_DASHBOARD_WIDGETS WHERE 1=1";
            if (soloActivos) sql += " AND Activo = 1";
            sql += " ORDER BY Orden ASC";
            return await db.QueryAsync<DashboardWidgetDto>(sql);
        }

        public async Task<bool> ToggleWidgetDashboardAsync(int id, bool activo)
        {
            using var db = CreateConnection();
            const string sql = "UPDATE TB_DASHBOARD_WIDGETS SET Activo = @activo WHERE Id = @id";
            var rows = await db.ExecuteAsync(sql, new { id, activo });
            return rows > 0;
        }
    }
}
