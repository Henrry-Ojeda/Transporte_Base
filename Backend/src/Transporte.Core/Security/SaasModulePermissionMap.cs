using System;
using System.Collections.Generic;
using System.Linq;

namespace Transporte.Core.Security
{
    /// <summary>
    /// Fuente única de verdad para sincronizar los módulos contratados en SaaS_Manager (TB_EMPRESA_MODULOS: MOD_*)
    /// con los módulos y permisos RBAC del tenant (TB_MODULOS / TB_PERMISOS / TB_ROL_PERMISOS).
    /// Si un módulo no está habilitado en SaaS_Manager, sus permisos quedan vacíos para roles operativos
    /// (solo ADMIN y SUPERADMIN conservan sus privilegios administrativos).
    /// </summary>
    public static class SaasModulePermissionMap
    {
        // Módulos núcleo administrativos que siempre existen en todo tenant
        private static readonly HashSet<string> CoreAdminModulos = new(StringComparer.OrdinalIgnoreCase)
        {
            "EMPRESA",
            "USUARIOS_SEGURIDAD",
            "USUARIOS",
            "PERMISOS",
            "CONFIGURACION"
        };

        // Mapeo: TB_MODULOS.Codigo -> códigos MOD_* en DB_SAAS_MASTER (cualquiera habilitado activa el módulo)
        private static readonly Dictionary<string, string[]> ModuloToSaasCodes = new(StringComparer.OrdinalIgnoreCase)
        {
            ["DASHBOARD"] = new[] { "MOD_DASHBOARD" },
            ["RUTAS"] = new[] { "MOD_LECHE_VACA" },
            ["ENTREGAS"] = new[] { "MOD_RECEPTORIA" },
            ["BALANCE_LECHE"] = new[] { "MOD_BALANCE_LECHE", "MOD_CONTROL_TANQUES" },
            ["MERMAS"] = new[] { "MOD_BALANCE_LECHE" },
            ["CONTROL_RUTAS"] = new[] { "MOD_TICKETS_VIAJES", "MOD_LECHE_VACA" },
            ["TRAZABILIDAD_BUFALA"] = new[] { "MOD_LECHE_BUFALA", "MOD_BUFALA" },
            ["CALIDAD_LECHE"] = new[] { "MOD_CALIDAD_LECHE" },
            ["CALIDAD"] = new[] { "MOD_CALIDAD_LECHE" },
            ["RUTAS_PLANIFICACION"] = new[] { "MOD_LOGISTICA_RUTAS" },
            ["MAPA_RUTAS"] = new[] { "MOD_MAPA_RUTAS", "MOD_LOGISTICA_RUTAS" },

            // Catálogos
            ["FINCAS"] = new[] { "MOD_CATALOGOS" },
            ["PROPIETARIOS"] = new[] { "MOD_CATALOGOS" },
            ["CONDUCTORES"] = new[] { "MOD_CATALOGOS" },
            ["CAMIONES"] = new[] { "MOD_CATALOGOS" },
            ["COMPANIAS"] = new[] { "MOD_CATALOGOS" },
            ["BANCOS"] = new[] { "MOD_CATALOGOS" },

            // Flota & Taller
            ["COMBUSTIBLE"] = new[] { "MOD_COMBUSTIBLE" },
            ["HISTORIAL_CAMIONES"] = new[] { "MOD_MANTENIMIENTO" },
            ["REPUESTOS"] = new[] { "MOD_REPUESTOS" },

            // Finanzas & Liquidación
            ["CICLOS"] = new[] { "MOD_LIQUIDACIONES" },
            ["LIQUIDACIONES"] = new[] { "MOD_LIQUIDACIONES" },
            ["PAGOS_PERSONAL"] = new[] { "MOD_PAGOS_PERSONAL" },
            ["HISTORIAL_PAGOS"] = new[] { "MOD_HISTORIAL_PAGOS", "MOD_PAGOS_PERSONAL" },
            ["ADMINISTRACION"] = new[] { "MOD_ADMINISTRACION_GENERAL" },

            // Adelantos & Cobranzas
            ["ADELANTOS_FINCAS"] = new[] { "MOD_LIQUIDACIONES" },
            ["ADELANTOS_PERSONAL"] = new[] { "MOD_LIQUIDACIONES", "MOD_PAGOS_PERSONAL" },
            ["ABONOS_COMPANIAS"] = new[] { "MOD_LIQUIDACIONES", "MOD_ABONOS_AMORTIZACIONES" },
            ["ADELANTOS_RECEPTORIA"] = new[] { "MOD_ADELANTOS_RECEPTORIA", "MOD_RECEPTORIA" },
            ["ABONOS"] = new[] { "MOD_ABONOS_AMORTIZACIONES", "MOD_LIQUIDACIONES" },
            ["HISTORIAL_ADELANTOS"] = new[] { "MOD_HISTORIAL_ADELANTOS", "MOD_LIQUIDACIONES" },

            // Reportes & BCV & Sesión
            ["REPORTES"] = new[] { "MOD_REPORTES" },
            ["HISTORIAL_BCV"] = new[] { "MOD_HISTORIAL_BCV" },
            ["SESION"] = new[] { "MOD_TIEMPO_SESION" },
        };

        public static bool IsModuloRbacHabilitado(string? moduloRbacCodigo, IEnumerable<string>? modulosSaasActivos)
        {
            if (string.IsNullOrWhiteSpace(moduloRbacCodigo)) return true;

            var mod = moduloRbacCodigo.Trim().ToUpperInvariant();
            if (CoreAdminModulos.Contains(mod)) return true;

            // Si no hay configuración SaaS cargada (entorno local sin DB_SAAS_MASTER), permitir por defecto
            if (modulosSaasActivos == null) return true;
            var activosSet = new HashSet<string>(
                modulosSaasActivos.Where(m => !string.IsNullOrWhiteSpace(m)).Select(m => m.Trim().ToUpperInvariant()),
                StringComparer.OrdinalIgnoreCase);

            if (activosSet.Count == 0) return false;

            if (!ModuloToSaasCodes.TryGetValue(mod, out var requiredCodes))
            {
                // Módulos custom creados dinámicamente en BD que no dependen de un MOD_* específico
                return true;
            }

            return requiredCodes.Any(code => activosSet.Contains(code));
        }
    }
}
