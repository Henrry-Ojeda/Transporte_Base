# PLAN.md — Transporte Base (ERP / SaaS Transporte de Leche & Queseras)

- **Ruta:** `C:\Users\Usuario\source\repos\Transporte_Base`
- **Propósito:** Producto `TRANSPORTE` multiempresa (clientes actuales en PROD: Vergel & Carrillo y Campo Verde). Evolución progresiva hacia SaaS comercial sin interrumpir producción.
- **Reglas Permanentes:** Ver [AGENTS.md](AGENTS.md) — Reglas Maestras #1–#7 (incluyendo **CERO HARDCODEO**, `<DataTable />`, `<SearchableSelect />`, `develop -> qa -> main`, no alterar lógica de `Relación Compañías` ni `Relación Chofer`).

## Estado Actual (Reciente en PROD)
- ✅ Reorganización de `ReceptoriaPage.tsx` (3 pestañas: Entradas / Salidas / Control Diario), edición de tickets de salida en espera, diferimiento desde Receptoría, orden por fecha/ticket en `BalanceLechePage.tsx` y `ControlTanquesPage.tsx`, y parámetro persistente `BALANCE_INCLUIR_DIFERIDOS` en `ConfiguracionPage.tsx`.
- ✅ APK nativo `Transporte_App_Movil` (`v1.0.8`) con `expo-sqlite` y bloqueo de usuarios inactivos.

## Plan en Curso (Hacia QA -> PROD)
- [ ] **P0-B1:** Eliminar secretos de `appsettings.json` e `ImportacionDataController.cs`; quitar fallback `Jwt:SecretKey` en `Program.cs`; CORS configurable (`AllowedOrigins`).
- [ ] **P0-B2:** Eliminar hardcodes de clientes (`vergel`, `campoverde`, `5028`) en `App.tsx`, `client.ts`, `authStore.ts`, `procesoViaje.ts`, `Header.tsx`, `LoginPage.tsx`, `DescargarAppPage.tsx` y `TenantService.cs`.
- [ ] **P0-B3:** Alinear códigos `MOD_*` (`MOD_LECHE_BUFALA`, `MOD_LOGISTICA_RUTAS`, `MOD_MAPA_RUTAS`, `MOD_TOLERANCIA_MERMA`).
- [ ] **P0-B4:** Limpiar carpetas legacy/basura (`Frontend/`, `Ejecutables/`, `publish_linux/`, `scratch/`, `*.apk.idsig`).
- [ ] **P1-B1 / P1-B2:** Migración SQL explícita (`TipoMovimiento`, `TipoServicioId`, `EstadoCodigo`) + proyecto `Backend/tests/Transporte.Tests` (xUnit) en CI.
- [ ] **P2-B1..B4:** `BalanceVolumetricoService` único en Backend + RBAC real en Backend/Fail-Closed en Frontend + sync Usuarios CHOFER ↔ Conductores.
- [ ] **P3-B1..B5:** Consolidar vistas redundantes (`Recoleccion` + `Viajes`, `Logística`, `Adelantos`, `Pagos`), modularizar `Receptoria`/`Reportes` y cumplir 100% `<DataTable />` + `<SearchableSelect />`.
- [ ] **P4 / P5:** Dividir `Repositories.cs` (14.7k L) y `CatalogosController` (57 endpoints), endurecer sync `LocalUuid` en APK y preparar límites SaaS / Calidad de Leche.
