-- ============================================================================
-- Migración 20: Módulo Mapa de Rutas, Coordenadas de Fincas y GPS (OpenStreetMap)
-- Regla de Privacidad: Solo se capturan puntos GPS cuando el ticket está ABIERTO (ProcesoActualId = 1).
-- Estado SaaS por defecto: DESHABILITADO (Habilitado = 0) para todos los tenants.
-- ============================================================================

-- 1) Registrar en cada Base de Datos de Tenant (DB_PRODUCTO_BASE, DB_PROD_CAMPO_VERDE, DB_PROD_TRANSPORTE_VERGEL_CARRILLO)
IF COL_LENGTH('TB_FINCAS', 'Latitud') IS NULL
BEGIN
    ALTER TABLE TB_FINCAS ADD Latitud DECIMAL(9,6) NULL, Longitud DECIMAL(9,6) NULL;
END
GO

IF COL_LENGTH('TB_RUTAS_RECOLECCION', 'Latitud') IS NULL
BEGIN
    ALTER TABLE TB_RUTAS_RECOLECCION ADD Latitud DECIMAL(9,6) NULL, Longitud DECIMAL(9,6) NULL, GpsCapturadoAt DATETIME2 NULL;
END
GO

IF OBJECT_ID('TB_GPS_PUNTOS_VIAJE', 'U') IS NULL
BEGIN
    CREATE TABLE TB_GPS_PUNTOS_VIAJE (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        ControlRutaId BIGINT NOT NULL,
        UsuarioId INT NOT NULL,
        CamionId INT NULL,
        FincaId INT NULL,
        Latitud DECIMAL(9,6) NOT NULL,
        Longitud DECIMAL(9,6) NOT NULL,
        PrecisionMetros DECIMAL(8,2) NULL,
        Evento VARCHAR(30) NOT NULL, -- 'ENTRADA_APP', 'REGISTRO_LITROS', 'INICIO_VIAJE'
        FechaHoraDispositivo DATETIME2 NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_TB_GPS_PUNTOS_VIAJE_ControlRuta ON TB_GPS_PUNTOS_VIAJE (ControlRutaId, FechaHoraDispositivo);
    CREATE INDEX IX_TB_GPS_PUNTOS_VIAJE_Usuario ON TB_GPS_PUNTOS_VIAJE (UsuarioId, FechaHoraDispositivo);
END
GO

-- 2) Registrar módulo RBAC interno en la BD del tenant (desactivado en SaaS hasta que se habilite por empresa)
IF NOT EXISTS (SELECT 1 FROM TB_MODULOS WHERE Codigo = 'MAPA_RUTAS')
BEGIN
    INSERT INTO TB_MODULOS (Codigo, Nombre, Icono, Orden, Activo, RutaVista, PermisoRequerido, EsMenuLateral, BadgeTexto)
    VALUES ('MAPA_RUTAS', 'Mapa de Rutas & GPS', 'fa-map-location-dot', 18, 1, 'mapa-rutas', 'MAPA_RUTAS_VER', 1, NULL);
END
GO

DECLARE @ModuloId INT = (SELECT TOP 1 Id FROM TB_MODULOS WHERE Codigo = 'MAPA_RUTAS');
IF @ModuloId IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM TB_PERMISOS WHERE Codigo = 'MAPA_RUTAS_VER')
        INSERT INTO TB_PERMISOS (ModuloId, Codigo, Nombre, Accion, Descripcion, Activo)
        VALUES (@ModuloId, 'MAPA_RUTAS_VER', 'Ver Mapa de Rutas & GPS', 'VER', 'Permite visualizar fincas, recorridos GPS y análisis de rutas en OpenStreetMap', 1);

    IF NOT EXISTS (SELECT 1 FROM TB_PERMISOS WHERE Codigo = 'MAPA_RUTAS_EDITAR')
        INSERT INTO TB_PERMISOS (ModuloId, Codigo, Nombre, Accion, Descripcion, Activo)
        VALUES (@ModuloId, 'MAPA_RUTAS_EDITAR', 'Editar Coordenadas en Mapa', 'EDITAR', 'Permite registrar y actualizar coordenadas de fincas', 1);

    -- Asignar permisos al rol ADMIN
    DECLARE @AdminRolId INT = (SELECT TOP 1 Id FROM TB_ROLES WHERE UPPER(Nombre) = 'ADMIN');
    IF @AdminRolId IS NOT NULL
    BEGIN
        INSERT INTO TB_ROL_PERMISOS (RolId, PermisoId)
        SELECT @AdminRolId, p.Id
        FROM TB_PERMISOS p
        WHERE p.Codigo IN ('MAPA_RUTAS_VER', 'MAPA_RUTAS_EDITAR')
          AND NOT EXISTS (SELECT 1 FROM TB_ROL_PERMISOS rp WHERE rp.RolId = @AdminRolId AND rp.PermisoId = p.Id);
    END
END
GO
