import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { APP_VERSION } from '@/config/version';
import { NAV_GROUPS, type NavSubItem, type NavGroupDef } from '@/config/navigation';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { canAccessTab, hasTenantModule } = useAuthStore();
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [pinnedGroupId, setPinnedGroupId] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isItemVisible = (item: NavSubItem): boolean => {
    if (item.subItems && item.subItems.length > 0) {
      return item.subItems.some(sub => isItemVisible(sub));
    }
    if (item.requiredTenantModule && !hasTenantModule(item.requiredTenantModule)) {
      return false;
    }
    return canAccessTab(item.tabId);
  };

  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>({
    'Balance Silos': true,
    'Logísticas': true,
  });

  const toggleSubMenu = (name: string) => {
    setOpenSubMenus(prev => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  useEffect(() => {
    if (location.pathname === '/balance' || location.pathname === '/control-tanques') {
      setOpenSubMenus(prev => ({ ...prev, 'Balance Silos': true }));
    }
    if (location.pathname === '/planificacion-rutas' || location.pathname === '/planificacion-rutas-choferes') {
      setOpenSubMenus(prev => ({ ...prev, 'Logísticas': true }));
    }
  }, [location.pathname]);

  const handleMouseEnter = (groupId: string) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHoveredGroupId(groupId);
  };

  const handleMouseLeave = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      if (!pinnedGroupId) {
        setHoveredGroupId(null);
      }
    }, 900); // 900ms de tolerancia para mover el cursor sin que se cierre apresuradamente
  };

  // Cerrar submenú fijado al hacer clic fuera del sidebar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const sidebar = document.getElementById('mainSidebar');
      if (sidebar && !sidebar.contains(e.target as Node)) {
        setPinnedGroupId(null);
        setHoveredGroupId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const groups = NAV_GROUPS;

  // Identificar qué grupo tiene la ruta actual activa
  const isGroupActive = (grp: NavGroupDef) => {
    return grp.items.some(it => {
      if (it.subItems && it.subItems.length > 0) {
        return it.subItems.some(sub => isItemVisible(sub) && location.pathname === sub.href);
      }
      return isItemVisible(it) && location.pathname === it.href;
    });
  };

  // Estado para contraer/achicar menú lateral
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1280;
    }
    return false;
  });

  // Estado para colapsar manualmente con clic en vista normal
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // En móvil con drawer abierto, forzar vista interactiva completa (no achicada a 78px)
  const isMobileDrawer = isOpen;
  const effectiveCollapsed = isSidebarCollapsed && !isMobileDrawer;

  return (
    <aside
      className={`sidebar ${isOpen ? 'open mobile-open' : ''} ${effectiveCollapsed ? 'is-collapsed' : 'hover-accordion-sidebar'}`}
      id="mainSidebar"
      style={{
        width: effectiveCollapsed ? '78px' : '260px',
        minWidth: effectiveCollapsed ? '78px' : '260px',
        maxWidth: effectiveCollapsed ? '78px' : '280px',
        padding: effectiveCollapsed ? '12px 6px' : '16px 12px 12px 12px',
        flexShrink: 0,
        height: '100%',
        overflowY: effectiveCollapsed ? 'visible' : 'auto',
        overflowX: 'visible',
        transition: 'width 0.25s cubic-bezier(0.25, 1, 0.5, 1), min-width 0.25s, max-width 0.25s',
      }}
    >
      {/* Cabecera Móvil con botón para cerrar menú en pantallas táctiles */}
      {isOpen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 6px 12px 6px',
            borderBottom: '1.5px solid #e2e8f0',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <i className="fa-solid fa-bars" style={{ fontSize: '13px' }}></i>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Menú del Sistema</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 800,
            }}
            title="Cerrar menú"
          >
            &times;
          </button>
        </div>
      )}

      {/* Botón para achicar/expandir menú lateral (solo en escritorio) */}
      {!isMobileDrawer && (
        <div
          style={{
            display: 'flex',
            justifyContent: effectiveCollapsed ? 'center' : 'flex-end',
            padding: effectiveCollapsed ? '2px 0 10px 0' : '4px 6px 10px 6px',
            borderBottom: '1px solid #f1f5f9',
            marginBottom: '8px',
          }}
        >
          {effectiveCollapsed ? (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              title="Expandir menú lateral"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-slate-500 hover:text-blue-600 transition-all shadow-xs cursor-pointer"
            >
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(true)}
              title="Achicar menú lateral"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-600 hover:text-slate-900 transition-all text-xs font-semibold shadow-xs cursor-pointer"
            >
              <i className="fa-solid fa-chevron-left text-[10px] text-slate-400"></i>
              <span>Achicar</span>
            </button>
          )}
        </div>
      )}

      <nav className="sidebar-nav" style={{ overflow: 'visible' }}>
        {effectiveCollapsed ? (
          /* MODO ACHICADO (78px): Ícono con categoría elegante + Menú flotante al pasar el mouse */
          <div className="flex flex-col items-center space-y-1.5" style={{ position: 'relative' }}>
            {groups.map((grp, idx) => {
              const visibleItems = grp.items.filter(isItemVisible);
              if (visibleItems.length === 0) return null;

              const active = isGroupActive(grp);
              const firstItem = visibleItems[0];
              const isMenuOpen = hoveredGroupId === grp.id || pinnedGroupId === grp.id;
              // Para los últimos grupos, alinear el popover hacia arriba para no salirse de pantalla
              const alignBottom = idx >= 4;

              return (
                <div
                  key={grp.id}
                  className="relative group"
                  onMouseEnter={() => handleMouseEnter(grp.id)}
                  onMouseLeave={handleMouseLeave}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPinnedGroupId(prev => (prev === grp.id ? null : grp.id));
                      setHoveredGroupId(grp.id);
                    }}
                    title={`${grp.title} (Clic para fijar menú)`}
                    className={`w-[66px] h-[52px] flex flex-col items-center justify-center rounded-xl transition-all duration-200 cursor-pointer ${
                      active
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/25 border border-blue-500'
                        : isMenuOpen
                        ? 'bg-white text-blue-700 border-2 border-blue-500 shadow-md ring-2 ring-blue-100'
                        : 'bg-slate-50/90 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 hover:border-slate-300 hover:shadow-sm'
                    }`}
                    style={{ textDecoration: 'none' }}
                  >
                    <i
                      className={`${grp.iconClass} text-[16px] mb-1`}
                      style={{
                        color: active ? '#ffffff' : (isMenuOpen ? '#2563eb' : grp.color),
                        filter: active ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' : 'none',
                      }}
                    ></i>
                    <span
                      style={{
                        fontSize: '7.5px',
                        fontWeight: active || isMenuOpen ? 800 : 700,
                        lineHeight: '9px',
                        textAlign: 'center',
                        letterSpacing: '0.015em',
                        whiteSpace: 'nowrap',
                        color: active ? '#ffffff' : (isMenuOpen ? '#1d4ed8' : '#475569'),
                      }}
                    >
                      {grp.shortTitle}
                    </span>
                  </button>

                  {/* FLYOUT POPOVER: Despliega los submenús al pasar el mouse por encima o al dar clic */}
                  {isMenuOpen && (
                    <div
                      onMouseEnter={() => handleMouseEnter(grp.id)}
                      onMouseLeave={handleMouseLeave}
                      className={`absolute left-[64px] w-64 bg-white rounded-xl shadow-2xl border border-slate-200 p-2.5 z-50 before:content-[''] before:absolute before:-left-5 before:top-0 before:w-6 before:h-full ${
                        alignBottom ? 'bottom-0' : 'top-0'
                      }`}
                      style={{
                        boxShadow: '0 16px 36px -4px rgba(15, 23, 42, 0.18), 0 6px 16px -2px rgba(15, 23, 42, 0.1)',
                        animation: 'fadeInMenu 0.15s ease-out',
                      }}
                    >
                      {/* Cabecera del flyout */}
                      <div className="flex items-center justify-between px-2.5 py-1.5 mb-1.5 border-b border-slate-100 bg-slate-50/70 rounded-lg">
                        <div className="flex items-center gap-2">
                          <i className={`${grp.iconClass} text-sm`} style={{ color: grp.color }}></i>
                          <span className="text-[11.5px] font-extrabold text-slate-800 uppercase tracking-wider">
                            {grp.title}
                          </span>
                        </div>
                        {pinnedGroupId === grp.id && (
                          <span className="text-[9.5px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">
                            Fijado
                          </span>
                        )}
                      </div>

                      {/* Lista de enlaces directos */}
                      <div className="flex flex-col gap-0.5 max-h-[360px] overflow-y-auto">
                        {visibleItems.map(item => {
                          if (item.subItems && item.subItems.length > 0) {
                            const visibleSubs = item.subItems.filter(isItemVisible);
                            if (visibleSubs.length === 0) return null;
                            return (
                              <div key={item.name} className="mt-1 pt-1 border-t border-slate-100">
                                <div className="px-2.5 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <i className={`${item.icon} text-[11px]`} style={item.color ? { color: item.color } : undefined}></i>
                                  <span>{item.name}</span>
                                </div>
                                <div className="flex flex-col gap-0.5 pl-1.5">
                                  {visibleSubs.map(sub => {
                                    const isSubActive = location.pathname === sub.href;
                                    return (
                                      <NavLink
                                        key={sub.href}
                                        to={sub.href!}
                                        onClick={() => {
                                          setHoveredGroupId(null);
                                          setPinnedGroupId(null);
                                          if (isOpen) onClose();
                                        }}
                                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                                          isSubActive
                                            ? 'bg-blue-50 text-blue-700 font-bold border-l-[3px] border-l-blue-600 shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
                                        }`}
                                        style={{ textDecoration: 'none' }}
                                      >
                                        <i
                                          className={`${sub.icon} text-[11px] w-3.5 text-center`}
                                          style={sub.color ? { color: sub.color } : undefined}
                                        ></i>
                                        <span className="truncate">{sub.name}</span>
                                      </NavLink>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }

                          const isItemActive = location.pathname === item.href;
                          return (
                            <NavLink
                              key={item.href}
                              to={item.href!}
                              onClick={() => {
                                setHoveredGroupId(null);
                                setPinnedGroupId(null);
                                if (isOpen) onClose();
                              }}
                              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                                isItemActive
                                  ? 'bg-blue-50 text-blue-700 font-bold border-l-[3px] border-l-blue-600 shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
                              }`}
                              style={{ textDecoration: 'none' }}
                            >
                              <i
                                className={`${item.icon} text-[12px] w-4 text-center`}
                                style={item.color ? { color: item.color } : undefined}
                              ></i>
                              <span className="truncate">{item.name}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* MODO EXPANDIDO: Acordeón normal interactivo */
          groups.map((grp) => {
            const visibleItems = grp.items.filter(isItemVisible);
            if (visibleItems.length === 0) return null;

            const groupActive = isGroupActive(grp);
            const isGroupCollapsed = collapsedGroups[grp.id] === true;
            const groupClasses = [
              'nav-accordion-group',
              groupActive ? 'has-active' : '',
              isGroupCollapsed ? 'collapsed' : (groupActive ? 'open' : ''),
            ].filter(Boolean).join(' ');

            return (
              <div key={grp.id} className={groupClasses} id={grp.id}>
                <div className="nav-accordion-header" onClick={() => toggleGroup(grp.id)}>
                  <div className="header-main">
                    <i className={`${grp.iconClass} group-icon ${grp.groupIconClass}`}></i>
                    <span className="group-title">{grp.title}</span>
                  </div>
                  <i className="fa-solid fa-chevron-right group-chevron"></i>
                </div>
                <div className="nav-accordion-body">
                  <div className="accordion-subitems">
                    {visibleItems.map((item) => {
                      if (item.subItems && item.subItems.length > 0) {
                        const visibleSubs = item.subItems.filter(isItemVisible);
                        if (visibleSubs.length === 0) return null;
                        const isSubActive = visibleSubs.some(s => location.pathname === s.href);
                        const isSubOpen = openSubMenus[item.name] !== false;

                        return (
                          <div key={item.name} className="nav-sub-group mb-1">
                            <button
                              type="button"
                              onClick={() => toggleSubMenu(item.name)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border-0 ${
                                isSubActive
                                  ? 'bg-blue-50/90 text-blue-700 font-bold'
                                  : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 bg-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <i className={`${item.icon} text-[12px] w-4 text-center`} style={item.color ? { color: item.color } : undefined}></i>
                                <span className="tracking-tight">{item.name}</span>
                              </div>
                              <i
                                className={`fa-solid fa-chevron-right text-[9px] text-slate-400 transition-transform duration-200 ${
                                  isSubOpen ? 'rotate-90 text-blue-600' : ''
                                }`}
                              ></i>
                            </button>

                            {isSubOpen && (
                              <div className="pl-3.5 pr-1 py-1 flex flex-col gap-0.5 border-l-2 border-blue-200 ml-4 my-1">
                                {visibleSubs.map((sub) => {
                                  const isActive = location.pathname === sub.href;
                                  return (
                                    <NavLink
                                      key={sub.href}
                                      to={sub.href!}
                                      onClick={() => {
                                        if (isOpen) onClose();
                                      }}
                                      title={sub.name}
                                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11.5px] transition-colors ${
                                        isActive
                                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                                      }`}
                                      style={{ textDecoration: 'none' }}
                                    >
                                      <i
                                        className={`${sub.icon} text-[11px] w-3.5 text-center`}
                                        style={!isActive && sub.color ? { color: sub.color } : undefined}
                                      ></i>
                                      <span className="truncate">{sub.name}</span>
                                    </NavLink>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <NavLink
                          key={item.href}
                          to={item.href!}
                          onClick={() => {
                            if (isOpen) onClose();
                          }}
                          title={item.name}
                          className={({ isActive }) =>
                            isActive ? 'nav-item active' : 'nav-item'
                          }
                        >
                          <i className={item.icon} style={item.color ? { color: item.color } : undefined}></i>
                          <span>{item.name}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </nav>

      <div className="sidebar-footer" style={{ borderTop: '1px solid #f1f5f9', marginTop: 'auto', paddingTop: '10px' }} title={`Sistema Conectado • ${APP_VERSION}`}>
        <div className="connection-status flex items-center justify-center" style={{ gap: '6px' }}>
          <span className="status-dot online"></span>
          {!isSidebarCollapsed && (
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Sistema Conectado • <strong style={{ color: '#0284c7', fontWeight: 700 }}>{APP_VERSION}</strong>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
