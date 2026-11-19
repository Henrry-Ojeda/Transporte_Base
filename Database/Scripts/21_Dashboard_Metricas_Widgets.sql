-- ============================================================================
-- 21. CONFIGURACIÓN DE LAS 4 SECCIONES DE MÉTRICAS DEL DASHBOARD
-- Tabla existente: dbo.TB_DASHBOARD_WIDGETS
-- ============================================================================

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
    VALUES ('DASHBOARD_GRAFICOS', '4. Tablero de Gráficos y Tendencia', 'Tendencia operativa histórica, desempeño por chofer, distribución por servicio, destino y leche ácida', 'SECCION_METRICAS', '/api/reportes/dashboard-avanzado', 12, 'indigo', 'fa-chart-line', 'DASHBOARD_VER', 13, 1);
GO
