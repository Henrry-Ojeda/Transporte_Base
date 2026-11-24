-- ============================================================================
-- Migración 24: Módulo SaaS Calidad de Leche (Lactoscan S50),
--               Parámetros Configurables Mín/Máx y Recibos en Receptoría
-- Idempotente: segura de ejecutar múltiples veces en QA y PROD
-- ============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Tabla de Parámetros de Calidad de Leche (Límites Mínimos y Máximos)
IF OBJECT_ID('TB_PARAMETROS_CALIDAD_LECHE', 'U') IS NULL
BEGIN
    CREATE TABLE TB_PARAMETROS_CALIDAD_LECHE (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Nombre NVARCHAR(120) NOT NULL,
        TipoLeche NVARCHAR(20) NOT NULL DEFAULT 'VACA',
        EsPrincipal BIT NOT NULL DEFAULT 0,
        Activo BIT NOT NULL DEFAULT 1,

        -- 12 Campos Lactoscan S50 (Mínimo / Máximo)
        GrasaMin DECIMAL(6,2) NULL,
        GrasaMax DECIMAL(6,2) NULL,
        SngMin DECIMAL(6,2) NULL,
        SngMax DECIMAL(6,2) NULL,
        DensidadMin DECIMAL(6,2) NULL,
        DensidadMax DECIMAL(6,2) NULL,
        LactosaMin DECIMAL(6,2) NULL,
        LactosaMax DECIMAL(6,2) NULL,
        SalesMin DECIMAL(6,2) NULL,
        SalesMax DECIMAL(6,2) NULL,
        ProteinaMin DECIMAL(6,2) NULL,
        ProteinaMax DECIMAL(6,2) NULL,
        SolidosTotalesMin DECIMAL(6,2) NULL,
        SolidosTotalesMax DECIMAL(6,2) NULL,
        AguaAdicionadaMin DECIMAL(6,2) NULL,
        AguaAdicionadaMax DECIMAL(6,2) NULL,
        TemperaturaMin DECIMAL(6,2) NULL,
        TemperaturaMax DECIMAL(6,2) NULL,
        PuntoCongelacionMin DECIMAL(6,3) NULL,
        PuntoCongelacionMax DECIMAL(6,3) NULL,
        PhMin DECIMAL(6,2) NULL,
        PhMax DECIMAL(6,2) NULL,
        ConductividadMin DECIMAL(6,2) NULL,
        ConductividadMax DECIMAL(6,2) NULL,

        Observacion NVARCHAR(300) NULL,
        IsDeleted BIT NOT NULL DEFAULT 0,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CreatedBy INT NULL,
        ModifiedAt DATETIME NULL,
        ModifiedBy INT NULL
    );
END
GO

-- Garantizar a nivel de BD que SOLO UN registro activo pueda ser Parámetro Principal
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_TB_PARAMETROS_CALIDAD_LECHE_PRINCIPAL'
      AND object_id = OBJECT_ID('TB_PARAMETROS_CALIDAD_LECHE')
)
BEGIN
    CREATE UNIQUE INDEX UX_TB_PARAMETROS_CALIDAD_LECHE_PRINCIPAL
    ON TB_PARAMETROS_CALIDAD_LECHE (EsPrincipal)
    WHERE EsPrincipal = 1 AND IsDeleted = 0;
END
GO

-- Semilla inicial (solo si la tabla está vacía) editable desde el CRUD
IF NOT EXISTS (SELECT 1 FROM TB_PARAMETROS_CALIDAD_LECHE WHERE IsDeleted = 0)
BEGIN
    INSERT INTO TB_PARAMETROS_CALIDAD_LECHE (
        Nombre, TipoLeche, EsPrincipal, Activo,
        GrasaMin, GrasaMax,
        SngMin, SngMax,
        DensidadMin, DensidadMax,
        LactosaMin, LactosaMax,
        SalesMin, SalesMax,
        ProteinaMin, ProteinaMax,
        SolidosTotalesMin, SolidosTotalesMax,
        AguaAdicionadaMin, AguaAdicionadaMax,
        TemperaturaMin, TemperaturaMax,
        PuntoCongelacionMin, PuntoCongelacionMax,
        PhMin, PhMax,
        ConductividadMin, ConductividadMax,
        Observacion, CreatedAt
    ) VALUES (
        'Estándar Leche Cruda (Lactoscan S50)', 'VACA', 1, 1,
        3.20, 5.50,
        8.00, 9.50,
        28.00, 33.00,
        4.30, 5.20,
        0.65, 0.85,
        2.90, 3.80,
        11.50, 14.50,
        0.00, 0.00,
        2.00, 10.00,
        -0.560, -0.515,
        6.50, 6.85,
        4.00, 5.50,
        'Parámetros de referencia inicial (editable desde Calidad de Leche > Parámetros)', GETDATE()
    );
END
GO

-- 2. Tabla Unificada de Exámenes de Calidad de Leche (Nivel TICKET y Nivel FINCA)
IF OBJECT_ID('TB_EXAMENES_LECHE', 'U') IS NULL
BEGIN
    CREATE TABLE TB_EXAMENES_LECHE (
        Id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Fecha DATE NOT NULL,
        HoraPrueba NVARCHAR(20) NULL,
        NivelPrueba NVARCHAR(20) NOT NULL DEFAULT 'TICKET', -- 'TICKET' | 'FINCA'
        ControlRutaId BIGINT NULL,
        ControlCompaniaId BIGINT NULL,
        RutaRecoleccionId BIGINT NULL,
        FincaId INT NULL,
        CamionId INT NULL,
        ChoferId INT NULL,
        ParametroCalidadId INT NULL,
        LitrosAsociados INT NULL,
        TipoLeche NVARCHAR(20) NOT NULL DEFAULT 'VACA',

        -- Metadatos del equipo (ej: Lactoscan S50)
        Equipo NVARCHAR(80) NULL,
        NumeroSerial NVARCHAR(50) NULL,
        Calibracion NVARCHAR(80) NULL,

        -- 12 Campos exactos de laboratorio (Lactoscan S50)
        GrasaPct DECIMAL(6,2) NULL,
        SngPct DECIMAL(6,2) NULL,
        Densidad DECIMAL(6,2) NULL,
        LactosaPct DECIMAL(6,2) NULL,
        SalesPct DECIMAL(6,2) NULL,
        ProteinaPct DECIMAL(6,2) NULL,
        SolidosTotalesPct DECIMAL(6,2) NULL,
        AguaAdicionadaPct DECIMAL(6,2) NULL,
        TemperaturaC DECIMAL(6,2) NULL,
        PuntoCongelacion DECIMAL(6,3) NULL,
        Ph DECIMAL(6,2) NULL,
        Conductividad DECIMAL(6,2) NULL,

        Resultado NVARCHAR(20) NOT NULL DEFAULT 'APROBADA', -- 'APROBADA' | 'OBSERVADA' | 'ACIDA' | 'RECHAZADA'
        FueraDeRango BIT NOT NULL DEFAULT 0,
        ImagenExamen NVARCHAR(MAX) NULL,
        ImagenRecibo NVARCHAR(MAX) NULL,
        Observacion NVARCHAR(500) NULL,

        IsDeleted BIT NOT NULL DEFAULT 0,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CreatedBy INT NULL,
        ModifiedAt DATETIME NULL,
        ModifiedBy INT NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TB_EXAMENES_LECHE_Fecha' AND object_id = OBJECT_ID('TB_EXAMENES_LECHE'))
    CREATE INDEX IX_TB_EXAMENES_LECHE_Fecha ON TB_EXAMENES_LECHE (Fecha DESC) WHERE IsDeleted = 0;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TB_EXAMENES_LECHE_ControlRutaId' AND object_id = OBJECT_ID('TB_EXAMENES_LECHE'))
    CREATE INDEX IX_TB_EXAMENES_LECHE_ControlRutaId ON TB_EXAMENES_LECHE (ControlRutaId) WHERE ControlRutaId IS NOT NULL AND IsDeleted = 0;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TB_EXAMENES_LECHE_FincaId' AND object_id = OBJECT_ID('TB_EXAMENES_LECHE'))
    CREATE INDEX IX_TB_EXAMENES_LECHE_FincaId ON TB_EXAMENES_LECHE (FincaId) WHERE FincaId IS NOT NULL AND IsDeleted = 0;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TB_EXAMENES_LECHE_ControlCompaniaId' AND object_id = OBJECT_ID('TB_EXAMENES_LECHE'))
    CREATE INDEX IX_TB_EXAMENES_LECHE_ControlCompaniaId ON TB_EXAMENES_LECHE (ControlCompaniaId) WHERE ControlCompaniaId IS NOT NULL AND IsDeleted = 0;
GO

-- 3. Columnas opcionales de fotos en Receptoría (TB_CONTROL_RUTAS y TB_CONTROL_COMPANIAS)
IF COL_LENGTH('TB_CONTROL_RUTAS', 'FotoExamenLeche') IS NULL
    ALTER TABLE TB_CONTROL_RUTAS ADD FotoExamenLeche NVARCHAR(MAX) NULL;

IF COL_LENGTH('TB_CONTROL_RUTAS', 'FotoReciboReceptoria') IS NULL
    ALTER TABLE TB_CONTROL_RUTAS ADD FotoReciboReceptoria NVARCHAR(MAX) NULL;

IF COL_LENGTH('TB_CONTROL_COMPANIAS', 'FotoExamenLeche') IS NULL
    ALTER TABLE TB_CONTROL_COMPANIAS ADD FotoExamenLeche NVARCHAR(MAX) NULL;

IF COL_LENGTH('TB_CONTROL_COMPANIAS', 'FotoReciboCompania') IS NULL
    ALTER TABLE TB_CONTROL_COMPANIAS ADD FotoReciboCompania NVARCHAR(MAX) NULL;
GO

-- 4. Registro dinámico de Módulo y Permisos RBAC en TB_MODULOS / TB_PERMISOS
IF OBJECT_ID('TB_MODULOS', 'U') IS NOT NULL AND OBJECT_ID('TB_PERMISOS', 'U') IS NOT NULL
BEGIN
    DECLARE @ModCalidadId INT;
    SELECT @ModCalidadId = Id FROM TB_MODULOS WHERE Codigo = 'CALIDAD_LECHE';

    IF @ModCalidadId IS NULL
    BEGIN
        INSERT INTO TB_MODULOS (Codigo, Nombre, Icono, Orden, Activo)
        VALUES ('CALIDAD_LECHE', 'Calidad de Leche', 'fa-flask-vial', 15, 1);
        SET @ModCalidadId = SCOPE_IDENTITY();
    END

    IF NOT EXISTS (SELECT 1 FROM TB_PERMISOS WHERE Codigo = 'CALIDAD_VER')
        INSERT INTO TB_PERMISOS (ModuloId, Codigo, Nombre, Accion, Descripcion, Activo)
        VALUES (@ModCalidadId, 'CALIDAD_VER', 'Ver Exámenes de Leche', 'VER', 'Permite consultar historial de exámenes de calidad y recibos', 1);

    IF NOT EXISTS (SELECT 1 FROM TB_PERMISOS WHERE Codigo = 'CALIDAD_CREAR')
        INSERT INTO TB_PERMISOS (ModuloId, Codigo, Nombre, Accion, Descripcion, Activo)
        VALUES (@ModCalidadId, 'CALIDAD_CREAR', 'Registrar Exámenes de Leche', 'CREAR', 'Permite registrar exámenes de leche por ticket o finca', 1);

    IF NOT EXISTS (SELECT 1 FROM TB_PERMISOS WHERE Codigo = 'CALIDAD_EDITAR')
        INSERT INTO TB_PERMISOS (ModuloId, Codigo, Nombre, Accion, Descripcion, Activo)
        VALUES (@ModCalidadId, 'CALIDAD_EDITAR', 'Editar Exámenes de Leche', 'EDITAR', 'Permite modificar exámenes de calidad registrados', 1);

    IF NOT EXISTS (SELECT 1 FROM TB_PERMISOS WHERE Codigo = 'CALIDAD_ELIMINAR')
        INSERT INTO TB_PERMISOS (ModuloId, Codigo, Nombre, Accion, Descripcion, Activo)
        VALUES (@ModCalidadId, 'CALIDAD_ELIMINAR', 'Eliminar Exámenes de Leche', 'ELIMINAR', 'Permite anular exámenes de calidad registrados', 1);

    IF NOT EXISTS (SELECT 1 FROM TB_PERMISOS WHERE Codigo = 'CALIDAD_PARAMETROS')
        INSERT INTO TB_PERMISOS (ModuloId, Codigo, Nombre, Accion, Descripcion, Activo)
        VALUES (@ModCalidadId, 'CALIDAD_PARAMETROS', 'Gestionar Parámetros de Leche', 'CONFIGURAR', 'Permite crear, editar y marcar el Parámetro Principal de calidad', 1);

    -- Conceder automáticamente a roles administradores / receptoría existentes si existe TB_ROL_PERMISOS
    IF OBJECT_ID('TB_ROL_PERMISOS', 'U') IS NOT NULL AND OBJECT_ID('TB_ROLES', 'U') IS NOT NULL
    BEGIN
        INSERT INTO TB_ROL_PERMISOS (RolId, PermisoId)
        SELECT r.Id, p.Id
        FROM TB_ROLES r
        CROSS JOIN TB_PERMISOS p
        WHERE p.Codigo IN ('CALIDAD_VER', 'CALIDAD_CREAR', 'CALIDAD_EDITAR', 'CALIDAD_ELIMINAR', 'CALIDAD_PARAMETROS')
          AND UPPER(r.Nombre) IN ('ADMIN', 'SUPERADMIN', 'SUPER_ADMIN', 'ADMINISTRADOR', 'ADMINISTRADOR GENERAL')
          AND NOT EXISTS (
              SELECT 1 FROM TB_ROL_PERMISOS rp WHERE rp.RolId = r.Id AND rp.PermisoId = p.Id
          );

        INSERT INTO TB_ROL_PERMISOS (RolId, PermisoId)
        SELECT r.Id, p.Id
        FROM TB_ROLES r
        CROSS JOIN TB_PERMISOS p
        WHERE p.Codigo IN ('CALIDAD_VER', 'CALIDAD_CREAR', 'CALIDAD_EDITAR')
          AND UPPER(r.Nombre) IN ('RECEPTOR', 'RECEPTORIA', 'SUPERVISOR')
          AND NOT EXISTS (
              SELECT 1 FROM TB_ROL_PERMISOS rp WHERE rp.RolId = r.Id AND rp.PermisoId = p.Id
          );
    END
END
GO
