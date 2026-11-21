export interface NavSubItem {
  name: string;
  href?: string;
  tabId: string;
  icon: string;
  color?: string;
  requiredTenantModule?: string;
  subItems?: NavSubItem[];
}

export interface NavGroupDef {
  id: string;
  title: string;
  shortTitle: string;
  iconClass: string;
  groupIconClass: string;
  color: string;
  items: NavSubItem[];
}

/**
 * Registro central de navegación (Opción B - 7 grupos ordenados).
 * Consumido por Sidebar.tsx y sincronizado con App.tsx / authStore.ts.
 */
export const NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'grp-operaciones',
    title: 'Operaciones',
    shortTitle: 'OPERACIONES',
    iconClass: 'fa-solid fa-bolt-lightning',
    groupIconClass: 'icon-op',
    color: '#4f46e5',
    items: [
      { name: 'Principal', href: '/dashboard', tabId: 'dashboard', icon: 'fa-solid fa-chart-pie' },
      { name: 'Recolección en Ruta', href: '/rutas', tabId: 'rutas', icon: 'fa-solid fa-route' },
      { name: 'Entregas Receptoría', href: '/receptoria', tabId: 'receptoria', icon: 'fa-solid fa-truck-ramp-box', requiredTenantModule: 'MOD_RECEPTORIA' },
      { name: 'Control de Viajes', href: '/viajes', tabId: 'viajes', icon: 'fa-solid fa-clipboard-check' },
      {
        name: 'Balance Silos',
        tabId: 'balance',
        icon: 'fa-solid fa-cubes-stacked',
        color: '#2563eb',
        subItems: [
          { name: 'Balance General Silos', href: '/balance', tabId: 'balance', icon: 'fa-solid fa-chart-line' },
          { name: 'Formulario Silos-01', href: '/control-tanques', tabId: 'control-tanques', icon: 'fa-solid fa-clipboard-list', color: '#6366f1', requiredTenantModule: 'MOD_CONTROL_TANQUES' },
        ],
      },
      { name: 'Mapa de Rutas & GPS', href: '/mapa-rutas', tabId: 'mapa-rutas', icon: 'fa-solid fa-map-location-dot', color: '#0d9488', requiredTenantModule: 'MOD_MAPA_RUTAS' },
      { name: 'Trazabilidad Búfala', href: '/bufala', tabId: 'bufala', icon: 'fa-solid fa-gem', color: '#0d9488', requiredTenantModule: 'MOD_LECHE_BUFALA' },
      {
        name: 'Logísticas',
        tabId: 'rutas-planificacion',
        icon: 'fa-solid fa-map-location-dot',
        color: '#3b82f6',
        subItems: [
          { name: 'Circuitos y Rutas Base', href: '/planificacion-rutas', tabId: 'rutas-planificacion', icon: 'fa-solid fa-route', requiredTenantModule: 'MOD_LOGISTICA_RUTAS' },
          { name: 'Planificación de Rutas-choferes', href: '/planificacion-rutas-choferes', tabId: 'planificacion-rutas-choferes', icon: 'fa-solid fa-calendar-check', color: '#10b981', requiredTenantModule: 'MOD_LOGISTICA_RUTAS' },
        ],
      },
    ],
  },
  {
    id: 'grp-catalogos',
    title: 'Catálogos',
    shortTitle: 'CATÁLOGOS',
    iconClass: 'fa-solid fa-folder-tree',
    groupIconClass: 'icon-cat',
    color: '#16a34a',
    items: [
      { name: 'Fincas', href: '/fincas', tabId: 'fincas', icon: 'fa-solid fa-seedling' },
      { name: 'Propietarios', href: '/propietarios', tabId: 'propietarios', icon: 'fa-solid fa-users' },
      { name: 'Conductores', href: '/conductores', tabId: 'conductores', icon: 'fa-solid fa-id-card' },
      { name: 'Camiones (Flota)', href: '/camiones', tabId: 'camiones', icon: 'fa-solid fa-truck-front' },
      { name: 'Compañías', href: '/companias', tabId: 'companias', icon: 'fa-solid fa-building' },
      { name: 'Bancos', href: '/bancos', tabId: 'bancos', icon: 'fa-solid fa-building-columns' },
    ],
  },
  {
    id: 'grp-flota',
    title: 'Flota & Taller',
    shortTitle: 'FLOTA',
    iconClass: 'fa-solid fa-screwdriver-wrench',
    groupIconClass: 'icon-op',
    color: '#d97706',
    items: [
      { name: 'Gestión de Combustible', href: '/combustible', tabId: 'combustible', icon: 'fa-solid fa-gas-pump', color: '#ef4444', requiredTenantModule: 'MOD_COMBUSTIBLE' },
      { name: 'Historial & Mantenimiento', href: '/mantenimiento', tabId: 'mantenimiento', icon: 'fa-solid fa-wrench', color: '#f59e0b', requiredTenantModule: 'MOD_MANTENIMIENTO' },
      { name: 'Inventario de Repuestos', href: '/repuestos', tabId: 'repuestos', icon: 'fa-solid fa-boxes-stacked', color: '#10b981', requiredTenantModule: 'MOD_REPUESTOS' },
    ],
  },
  {
    id: 'grp-finanzas',
    title: 'Liquidación & Pagos',
    shortTitle: 'LIQUIDACIÓN',
    iconClass: 'fa-solid fa-calculator',
    groupIconClass: 'icon-fin',
    color: '#9333ea',
    items: [
      { name: 'Semanas Operativas', href: '/semanas', tabId: 'semanas', icon: 'fa-regular fa-calendar-check', requiredTenantModule: 'MOD_LIQUIDACIONES' },
      { name: 'Liquidación Fincas', href: '/liquidaciones', tabId: 'liquidaciones', icon: 'fa-solid fa-file-invoice-dollar', requiredTenantModule: 'MOD_LIQUIDACIONES' },
      { name: 'Pagos Choferes & Personal', href: '/pagos-personal', tabId: 'pagos-personal', icon: 'fa-solid fa-money-check-dollar', color: '#38bdf8', requiredTenantModule: 'MOD_PAGOS_PERSONAL' },
      { name: 'Historial de Pagos', href: '/historial-pagos', tabId: 'historial-pagos', icon: 'fa-solid fa-receipt', color: '#6366f1', requiredTenantModule: 'MOD_LIQUIDACIONES' },
      { name: 'Historial Tasas BCV', href: '/historial-bcv', tabId: 'historial-bcv', icon: 'fa-solid fa-coins', requiredTenantModule: 'MOD_HISTORIAL_BCV' },
    ],
  },
  {
    id: 'grp-adelantos',
    title: 'Adelantos & Cobranzas',
    shortTitle: 'ADELANTOS',
    iconClass: 'fa-solid fa-hand-holding-dollar',
    groupIconClass: 'icon-ade',
    color: '#ea580c',
    items: [
      { name: 'Adelantos a Fincas', href: '/adelantos-fincas', tabId: 'adelantos-fincas', icon: 'fa-solid fa-leaf', requiredTenantModule: 'MOD_LIQUIDACIONES' },
      { name: 'Abonos a Compañías', href: '/abonos-companias', tabId: 'abonos-companias', icon: 'fa-solid fa-building' },
      { name: 'Otros Adelantos & Historial', href: '/otros-adelantos', tabId: 'adelantos', icon: 'fa-solid fa-clock-rotate-left', color: '#0d9488' },
    ],
  },
  {
    id: 'grp-reportes',
    title: 'Reportes & Admin',
    shortTitle: 'REPORTES',
    iconClass: 'fa-solid fa-chart-line',
    groupIconClass: 'icon-rep',
    color: '#0284c7',
    items: [
      { name: 'Reportes Generales', href: '/reportes', tabId: 'reportes', icon: 'fa-solid fa-square-poll-vertical' },
      { name: 'Administración General', href: '/administracion', tabId: 'administracion', icon: 'fa-solid fa-scale-balanced', color: '#10b981' },
      { name: 'Evolución Fincas & Flota', href: '/evolucion-fincas', tabId: 'evolucion-fincas', icon: 'fa-solid fa-arrow-trend-up', color: '#10b981' },
    ],
  },
  {
    id: 'grp-sistema',
    title: 'Sistema',
    shortTitle: 'SISTEMA',
    iconClass: 'fa-solid fa-gears',
    groupIconClass: 'icon-sis',
    color: '#64748b',
    items: [
      { name: 'Usuarios & Roles', href: '/usuarios', tabId: 'usuarios', icon: 'fa-solid fa-user-gear' },
      { name: 'Módulos & Permisos', href: '/permisos', tabId: 'permisos', icon: 'fa-solid fa-shield-halved', color: '#38bdf8' },
      { name: 'Datos de Empresa', href: '/empresa', tabId: 'empresa', icon: 'fa-solid fa-building-flag', color: '#38bdf8' },
      { name: 'Parametrización Global', href: '/configuracion', tabId: 'configuracion-sistema', icon: 'fa-solid fa-sliders', color: '#a855f7' },
      { name: 'Gestión de Data (Excel)', href: '/gestion-data', tabId: 'data', icon: 'fa-solid fa-file-excel', color: '#10b981' },
    ],
  },
];
