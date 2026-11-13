## Descripción del Cambio
- ¿Qué se corrigió o agregó en Transporte?

## Ambiente Destino
- [ ] `develop` (Desarrollo)
- [ ] `qa` (Pruebas QA — viene desde `develop`)
- [ ] `main` (PRODUCCIÓN — **solo desde `qa` o `hotfix/*` y con autorización**)

## Checklist Obligatorio antes de Aprobar
- [ ] `npm run build` (`tsc && vite build && inject-sw-assets.js`) en `Frontend-React/` sin errores.
- [ ] `dotnet build Backend/Transporte.sln` sin errores.
- [ ] Si hubo cambios en SQL (`Database/`), el script fue probado primero en **DEV** y **QA**.
- [ ] Probado funcionalmente en **QA** (roles: `SUPERADMIN`, `ADMIN`, `DESPACHO`, `CHOFER`, etc.).

