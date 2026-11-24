# Instrucciones del Proyecto Transporte V2

Sistema de Gestión de Rutas y Transporte de Leche V2.

### 📋 REGLAS MAESTRAS DE OBLIGATORIO CUMPLIMIENTO
1. **Duda sobre módulos o diseños**: Buscar en la carpeta `C:\Users\Usuario\Downloads\Transporte_V2_3_11_26` para replicar el diseño exacto 1:1 de `V2_3_11_26`.
2. **Tablas**: Toda tabla debe usar obligatoriamente el componente `<DataTable />` con buscador, paginador y exportación.
3. **Campos desplegables**: Todo selector debe ser con filtro/búsqueda integrada (`<SearchableSelect />`, `<CamionSelect />`, `<ChoferSelect />`).
4. **Módulos relacionados (ej: Búfala, Diferir Litros)**: Estructurar de manera consistente en todas las vistas donde aplique (Reportes Fincas, Receptoría, Liquidación/Pagos, Balances). Si está habilitado en SaaS se muestra en todas las vistas; si está deshabilitado se oculta.
5. **Despliegues PADRE ➔ HIJOS**: Todo cambio subido a `main` de `Transporte_Base` debe desplegarse en Vercel (`npx vercel --prod`) y reasignar los alias de los HIJOS (`transporte-vergel-carrillo.vercel.app`, `lacteos-campoverde.vercel.app`, `transporte-base.vercel.app`).
6. **Validación Estricta de APIs**: SIEMPRE verificar en `Backend/src/Transporte.API/Controllers/*Controller.cs` la ruta exacta (`[HttpGet]`, `[HttpPost]`, etc.) y el DTO antes de conectar cualquier endpoint en `Frontend-React/src/api/*.ts`.
7. **CERO HARDCODEO (OBLIGATORIO — TODO 100% DINÁMICO)**: Prohibido escribir valores fijos en el código para empresas/tenants (`vergel`, `campoverde`, `5028`), roles (`TALLER`, `RECEPTOR`, `SUPERVISOR`, `CHOFER` con listas fijas de pestañas), permisos/acciones, módulos, dominios, rutas de archivos o textos mágicos (`observacion.includes(...)`). Todo rol, permiso, acción, módulo, tabla o regla configurable DEBE leerse dinámicamente desde Base de Datos / configuración del SaaS. Si se crea un nuevo rol o acción en BD, debe funcionar sin tocar una sola línea de código.
