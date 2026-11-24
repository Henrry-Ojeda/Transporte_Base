-- ============================================================================
-- Migración 22: Columnas explícitas de TipoMovimiento, TipoServicioId y EstadoCodigo
-- Patrón Expand -> Migrate -> Contract (100% idempotente y seguro para PROD/QA)
-- ============================================================================

IF COL_LENGTH('TB_ENTREGAS_COMPANIA', 'TipoMovimiento') IS NULL
    ALTER TABLE TB_ENTREGAS_COMPANIA ADD TipoMovimiento VARCHAR(30) NULL;

IF COL_LENGTH('TB_ENTREGAS_COMPANIA', 'TipoServicioId') IS NULL
    ALTER TABLE TB_ENTREGAS_COMPANIA ADD TipoServicioId INT NULL;

IF COL_LENGTH('TB_CONTROL_RUTAS', 'EstadoCodigo') IS NULL
    ALTER TABLE TB_CONTROL_RUTAS ADD EstadoCodigo VARCHAR(30) NULL;
GO

-- Backfill seguro de TipoMovimiento en TB_ENTREGAS_COMPANIA (sin alterar registros ya clasificados)
UPDATE e
SET TipoMovimiento = CASE
    WHEN e.Litros < 0 OR UPPER(ISNULL(e.Observacion, '')) LIKE '%SALIDA DESDE RECEPTOR%' THEN 'SALIDA_PLANTA'
    WHEN c.EsPrincipal = 1 OR UPPER(ISNULL(c.Nombre, '')) LIKE '%RECEPTOR%' OR UPPER(ISNULL(c.Nombre, '')) LIKE '%MATRIZ%' THEN 'ENTRADA_SILO'
    WHEN e.ControlRutaId IS NOT NULL AND UPPER(ISNULL(e.Observacion, '')) NOT LIKE '%CONTROL COMPA%' THEN 'ENTREGA_DIRECTA'
    ELSE 'SALIDA_PLANTA'
END
FROM TB_ENTREGAS_COMPANIA e
LEFT JOIN TB_COMPANIAS c ON e.CompaniaId = c.Id
WHERE e.TipoMovimiento IS NULL;

-- Backfill de EstadoCodigo normalizado (5 estados formales)
UPDATE TB_CONTROL_RUTAS
SET EstadoCodigo = CASE
    WHEN ProcesoActualId >= 4 OR UPPER(ISNULL(Estado, '')) IN ('FINALIZADO', 'CERRADO', 'ENTREGADO') THEN 'FINALIZADO'
    WHEN ProcesoActualId = 3 OR UPPER(ISNULL(Estado, '')) IN ('CAMINO_COMPANIA', 'CAMINO A COMPAÑIA', 'EN VIA') THEN 'EN_DESPACHO'
    WHEN ProcesoActualId = 2 OR FechaLlegadaReceptoria IS NOT NULL THEN 'EN_RECEPTORIA'
    WHEN UPPER(ISNULL(Estado, '')) IN ('ANULADO', 'CANCELADO') THEN 'ANULADO'
    ELSE 'EN_RUTA'
END
WHERE EstadoCodigo IS NULL;
GO
