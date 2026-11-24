-- ============================================================================
-- Registro SaaS Master: MOD_CALIDAD_LECHE (Calidad de Leche Lactoscan S50)
-- Ejecutar en DB_SAAS_MASTER (Idempotente)
-- ============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('TB_MODULOS_SISTEMA', 'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM TB_MODULOS_SISTEMA WHERE Codigo = 'MOD_CALIDAD_LECHE')
    BEGIN
        INSERT INTO TB_MODULOS_SISTEMA (Codigo, Nombre, Descripcion, Icono, RutaFrontend, Categoria, EsModuloBase, Orden)
        VALUES (
            'MOD_CALIDAD_LECHE',
            'Calidad de Leche (Lactoscan)',
            'Exámenes de calidad de leche (12 parámetros Lactoscan S50), recibos en receptoría, historial por finca y parámetros Mín/Máx configurables',
            'fa-flask-vial',
            '/calidad-leche',
            'OPERACIONES',
            0,
            25
        );
    END
END
GO

IF OBJECT_ID('TB_EMPRESA_MODULOS', 'U') IS NOT NULL AND OBJECT_ID('TB_EMPRESAS', 'U') IS NOT NULL
BEGIN
    INSERT INTO TB_EMPRESA_MODULOS (EmpresaId, ModuloCodigo, Habilitado)
    SELECT e.Id, 'MOD_CALIDAD_LECHE', 1
    FROM TB_EMPRESAS e
    WHERE e.Estado = 'ACTIVA'
      AND NOT EXISTS (
          SELECT 1 FROM TB_EMPRESA_MODULOS em
          WHERE em.EmpresaId = e.Id AND em.ModuloCodigo = 'MOD_CALIDAD_LECHE'
      );
END
GO
