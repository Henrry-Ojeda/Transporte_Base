# Gobernanza de Ambientes: DEV → QA → PRODUCCIÓN (Transporte V2)

Este repositorio está configurado para **impedir técnicamente** que un cambio pase de Desarrollo a Producción sin pasar por QA y sin autorización explícita.

## 1. Ramas
- `develop` → **Desarrollo**
- `qa` → **QA / Pruebas**
- `main` → **Producción**

El workflow `.github/workflows/ci.yml` (`promotion-gate`) bloquea automáticamente cualquier Pull Request hacia `main` que no venga de `qa` (o `hotfix/*`).

## 2. Configuración Obligatoria en GitHub (1 sola vez)
1. **Branch Protection Rules** (`Settings → Branches → Add rule`):
   - Para `qa` y `main`:
     - Activar **Require a pull request before merging** (mínimo 1 aprobación).
     - Activar **Require review from Code Owners** (edita `@tu-usuario-github` en `.github/CODEOWNERS`).
     - Activar **Require status checks to pass before merging** (`Validar Flujo de Promoción`, `Frontend-React`, `Backend`).
     - Activar **Do not allow bypassing the above settings**.
2. **Environments** (`Settings → Environments`):
   - Crear `development`, `qa` y `production`.
   - En `production`:
     - Activar **Required reviewers** y agregar a los responsables autorizados.
     - En **Deployment branches**, seleccionar **Selected branches** → `main`.
     - Guardar aquí los secretos reales (`PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY`, cadena de conexión a `BD_TRANSPORTE_PROD`, clave JWT).

