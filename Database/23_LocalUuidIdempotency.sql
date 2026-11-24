-- ============================================================================
-- Migración 23: Idempotencia Offline Móvil (UuidLocal / LocalUuid)
-- Evita duplicados cuando la App Móvil reintenta sincronizar con señal inestable
-- ============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('TB_CONTROL_RUTAS', 'LocalUuid') IS NULL
    ALTER TABLE TB_CONTROL_RUTAS ADD LocalUuid NVARCHAR(64) NULL;

IF COL_LENGTH('TB_RUTAS_RECOLECCION', 'UuidLocal') IS NULL
    ALTER TABLE TB_RUTAS_RECOLECCION ADD UuidLocal NVARCHAR(64) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_TB_CONTROL_RUTAS_LocalUuid' AND object_id = OBJECT_ID('TB_CONTROL_RUTAS'))
    CREATE UNIQUE INDEX UX_TB_CONTROL_RUTAS_LocalUuid
    ON TB_CONTROL_RUTAS (LocalUuid)
    WHERE LocalUuid IS NOT NULL;
GO
