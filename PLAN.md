# PLAN.md — Transporte Base (ERP / SaaS Transporte de Leche & Queseras)

- **Ruta:** `C:\Users\Usuario\source\repos\Transporte_Base`
- **Propósito:** Producto `TRANSPORTE` multiempresa (clientes actuales en PROD: Vergel & Carrillo y Campo Verde). Evolución progresiva hacia SaaS comercial sin interrumpir producción.
- **Reglas Permanentes:** Ver [AGENTS.md](AGENTS.md) — Reglas Maestras #1–#7 (incluyendo **CERO HARDCODEO**, `<DataTable />`, `<SearchableSelect />`, `develop -> qa -> main`, no alterar lógica de `Relación Compañías` ni `Relación Chofer`).
- **Infraestructura Clave:**
  - **VPS Backend PROD:** `root@84.247.178.194` (`/opt/sql_server`, contenedores `sql_instancia` y `api_transporte` en `127.0.0.1:8080`, variable `SAAS_MASTER_CONNECTION`).
  - **Frontend PROD (Vercel):** Raíz del repo (`npx vercel --prod --yes`) + alias hijos: `transporte-vergel-carrillo.vercel.app`, `lacteos-campoverde.vercel.app`, `transporte-base.vercel.app`.
  - **Local QA:** Frontend `:3000` (`Frontend-React`), Backend `:5188` (`Backend/src/Transporte.API`).

## Estado Actual (Desplegado en PROD — P0 a P4 Completados)
- ✅ **P0-B1..B4 + Bloque 1 (Seguridad y Cero Hardcodeo):** Secretos removidos de `appsettings.json`, `TenantService.cs`, `AuthController.cs`, `Program.cs`, `SqlConnectionFactory.cs`, `CatalogosRepository.cs` y `ImportacionDataController.cs` (`SECRET_HITS: 0`), CORS configurable, cero hardcodes de clientes (`vergel`, `campoverde`, `5028`), códigos `MOD_*` alineados, y `[...slug].ts` eliminado de `Transporte_SaaS_Manager`.
- ✅ **P1-B1 / P1-B2:** Migraciones SQL `22_ExplicitMovementAndStates.sql` y `23_LocalUuidIdempotency.sql` aplicadas en PROD (`DB_PROD_CAMPO_VERDE` y `DB_PROD_TRANSPORTE_VERGEL_CARRILLO`) + proyecto `Backend/tests/Transporte.Tests` (5/5 xUnit tests).
- ✅ **P2-B1..B4 + Bloque 2 (RBAC Dinámico):** `BalanceVolumetricoService` único en Backend, `RequirePermissionAttribute` contra `TB_ROL_PERMISOS`/`TB_PERMISOS` aplicado a controladores críticos (`Adelantos`, `PagosUsuarios`, `Permisos`, `Usuarios`, `ImportacionData`, `Combustible`, `MantenimientoCamiones`, `Repuestos`), Fail-Closed en Frontend y sync Usuarios CHOFER ↔ Conductores.
- ✅ **P3-B1..B5:** Vistas consolidadas (`LogisticaRutasPage`, `AdelantosUnificadoPage`, `PagosNominaPage` con redirecciones legacy) + `<SearchableSelect />` aplicado en toda la app (0 `<select>` nativos en JSX).
- ✅ **P4-B1..B3 + Bloque 3 (Modularización Backend):**
  - `Repositories.cs` dividido en 12 repositorios por dominio.
  - `CatalogosController.cs` dividido en 4 archivos parciales (`CatalogosController.cs`, `.Fincas.cs`, `.Companias.cs`, `.Liquidacion.cs`) manteniendo rutas `/api/catalogos` intactas.
  - `DTOs.cs` dividido en 6 archivos por dominio (`AuthYCatalogosDtos.cs`, `ReportesYFinanzasDtos.cs`, `UsuariosYCamionesDtos.cs`, `ControlRutasYViajesDtos.cs`, `PagosYSeguridadDtos.cs`, `FlotaYOperacionesDtos.cs`).
  - Idempotencia `UuidLocal` en `RutasRepository.RegistrarRutaAsync`.
- ✅ **Rediseño UI Dual-Rail + Temas (E/F):** Menú Dual-Rail expandido colapsable a Mini-Rail con Popover por clic (`Sidebar.tsx`), selector Modo Claro (**E: Glass SaaS**) y Modo Oscuro (**F: Torre de Control**) en `Header.tsx`, `LoginPage.tsx` y variables globales en `index.css` (`themeStore.ts`), favicon y título dinámicos (`pwaIcons.ts`).
- ✅ **Operación y App Móvil:** Reorganización de `ReceptoriaPage.tsx` (Entradas / Salidas / Control Diario), fix de bucle de login chofer (`403` + `movil_device_info`), timeout 120s + fallback 1-a-1 en `syncEngine.ts`, permisos de tipo de leche por finca (`getPermisosTipoLecheFinca`), parámetro `BALANCE_INCLUIR_DIFERIDOS`, y APK nativo `Transporte_App_Movil` (`v1.0.8`).

## Roadmap Futuro (Siguiente Fase)
- [ ] **P4-M1 / P4-M2:** Mejoras futuras del APK nativo (cola offline avanzada / sincronización incremental).
- [ ] **P5:** Límites SaaS por plan (`MaxCamiones`, `MaxUsuarios`) + módulo Calidad de Leche.
