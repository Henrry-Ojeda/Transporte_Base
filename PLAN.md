# PLAN.md — Transporte Base (ERP / SaaS Transporte de Leche & Queseras)

- **Ruta:** `C:\Users\Usuario\source\repos\Transporte_Base`
- **Propósito:** Producto `TRANSPORTE` multiempresa (clientes actuales en PROD: Vergel & Carrillo y Campo Verde). Evolución progresiva hacia SaaS comercial sin interrumpir producción.
- **Reglas Permanentes:** Ver [AGENTS.md](AGENTS.md) — Reglas Maestras #1–#7 (incluyendo **CERO HARDCODEO**, `<DataTable />`, `<SearchableSelect />`, `develop -> qa -> main`, no alterar lógica de `Relación Compañías` ni `Relación Chofer`).

## Estado Actual (En QA — Pendiente validación del usuario antes de PROD)
- ✅ **P0-B1..B4:** Secretos removidos de `appsettings.json` / `AuthController.cs` / `ImportacionDataController.cs`, CORS configurable, cero hardcodes de clientes (`vergel`, `campoverde`, `5028`), códigos `MOD_*` alineados y limpieza de carpetas legacy.
- ✅ **P1-B1 / P1-B2:** Migración SQL `22_ExplicitMovementAndStates.sql` aplicada + proyecto `Backend/tests/Transporte.Tests` (5/5 xUnit tests).
- ✅ **P2-B1..B4:** `BalanceVolumetricoService` único en Backend + RBAC real en Backend/Fail-Closed en Frontend + sync Usuarios CHOFER ↔ Conductores.
- ✅ **P3-B1..B5:** Vistas consolidadas (`LogisticaRutasPage`, `AdelantosUnificadoPage`, `PagosNominaPage` con redirecciones legacy) + `<SearchableSelect />` aplicado en vistas pendientes (`BufalaPage`, `BalanceLechePage`, `EvolucionFincasPage`, `PagosPersonalPage`).
- ✅ **P4-B1 / P4-B3:** `Repositories.cs` (14.7k líneas) dividido en 12 repositorios por dominio + migración `23_LocalUuidIdempotency.sql` e idempotencia `UuidLocal` en `RutasRepository.RegistrarRutaAsync`.
- ✅ **Rediseño UI Dual-Rail + Temas (E/F):** Menú Dual-Rail expandido colapsable a Mini-Rail con Popover por clic (`Sidebar.tsx`), selector Modo Claro (**E: Glass SaaS**) y Modo Oscuro (**F: Torre de Control**) en `Header.tsx`, `LoginPage.tsx` y variables globales en `index.css` (`themeStore.ts`).
- ✅ Reorganización de `ReceptoriaPage.tsx` (3 pestañas: Entradas / Salidas / Control Diario), edición de tickets de salida en espera, diferimiento desde Receptoría, orden por fecha/ticket en `BalanceLechePage.tsx` y `ControlTanquesPage.tsx`, y parámetro persistente `BALANCE_INCLUIR_DIFERIDOS` en `ConfiguracionPage.tsx`.
- ✅ APK nativo `Transporte_App_Movil` (`v1.0.8`) con `expo-sqlite` y bloqueo de usuarios inactivos.

## Plan Pendiente (Siguiente fase / Post-QA)
- [ ] **P4-B2:** Dividir `CatalogosController.cs` (57 endpoints) en controladores por dominio.
- [ ] **P5:** Límites SaaS por plan (`MaxCamiones`, `MaxUsuarios`) + módulo Calidad de Leche.
