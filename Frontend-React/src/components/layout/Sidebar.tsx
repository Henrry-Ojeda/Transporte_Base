import React, { useState, useEffect, useMemo, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { APP_VERSION } from '@/config/version';
import { NAV_GROUPS, type NavSubItem, type NavGroupDef } from '@/config/navigation';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const SIDEBAR_COLLAPSED_KEY = 'transporte_sidebar_collapsed';

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { canAccessTab, hasTenantModule, user } = useAuthStore();
  const sidebarRef = useRef<HTMLElement>(null);

  const isItemVisible = (item: NavSubItem): boolean => {
    if (item.subItems && item.subItems.length > 0) {
      return item.subItems.some((sub) => isItemVisible(sub));
    }
    if (item.requiredTenantModule && !hasTenantModule(item.requiredTenantModule)) {
      return false;
    }
    return canAccessTab(item.tabId);
  };

  const visibleGroups = useMemo(() => {
    return NAV_GROUPS.map((grp) => ({
      ...grp,
      visibleItems: grp.items.filter(isItemVisible),
    })).filter((grp) => grp.visibleItems.length > 0);
  }, [canAccessTab, hasTenantModule]);

  const isGroupActive = (grp: NavGroupDef) => {
    return grp.items.some((it) => {
      if (it.subItems && it.subItems.length > 0) {
        return it.subItems.some((sub) => isItemVisible(sub) && location.pathname === sub.href);
      }
      return isItemVisible(it) && location.pathname === it.href;
    });
  };

  // Colapsable (Opción 1): Dual-Rail expandido (Opción 2) ⇄ Mini-Rail + Popover por clic (Opción 5)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved !== null) return saved === 'true';
    return window.innerWidth < 1280;
  });

  const toggleCollapse = (next?: boolean) => {
    setIsSidebarCollapsed((prev) => {
      const value = typeof next === 'boolean' ? next : !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
      return value;
    });
    setPopoverGroupId(null);
  };

  // Grupo activo en el panel secundario (Dual-Rail)
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => visibleGroups[0]?.id || 'grp-operaciones');
  // Popover abierto por clic cuando está en modo Mini-Rail
  const [popoverGroupId, setPopoverGroupId] = useState<string | null>(null);
  // Sub-items anidados dentro de un grupo
  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>({
    'Balance Silos': true,
    'Logísticas': true,
  });

  // Sincronizar grupo activo al cambiar de ruta
  useEffect(() => {
    const matched = visibleGroups.find((g) => isGroupActive(g));
    if (matched) {
      setSelectedGroupId(matched.id);
    } else if (visibleGroups.length > 0 && !visibleGroups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(visibleGroups[0].id);
    }
    setPopoverGroupId(null);
  }, [location.pathname, visibleGroups.length]);

  // Cerrar popover al hacer clic fuera del sidebar
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setPopoverGroupId(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const isMobileDrawer = isOpen;
  const effectiveCollapsed = isSidebarCollapsed && !isMobileDrawer;
  const activeGroup = visibleGroups.find((g) => g.id === selectedGroupId) || visibleGroups[0];

  const renderNavLinks = (items: NavSubItem[]) =>
    items.map((item) => {
      if (item.subItems && item.subItems.length > 0) {
        const subOpen = !!openSubMenus[item.name];
        return (
          <div key={item.name} className="space-y-0.5">
            <button
              type="button"
              onClick={() => setOpenSubMenus((prev) => ({ ...prev, [item.name]: !prev[item.name] }))}
              className="nav-sub-item w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold cursor-pointer"
              style={{ color: 'var(--t-text)' }}
            >
              <span className="flex items-center gap-2.5 truncate">
                <i className={`${item.icon} w-4 text-center text-xs`} style={{ color: item.color || 'var(--t-accent)' }}></i>
                <span className="truncate">{item.name}</span>
              </span>
              <i className={`fa-solid fa-chevron-${subOpen ? 'down' : 'right'} text-[10px]`} style={{ color: 'var(--t-muted)' }}></i>
            </button>
            {subOpen && (
              <div className="pl-5 space-y-0.5">
                {item.subItems.filter(isItemVisible).map((sub) => (
                  <NavLink
                    key={sub.href || sub.tabId}
                    to={sub.href || '#'}
                    onClick={() => {
                      setPopoverGroupId(null);
                      if (isMobileDrawer) onClose();
                    }}
                    className="nav-sub-item flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
                    style={({ isActive }) => ({
                      background: isActive ? 'var(--t-accent-soft)' : undefined,
                      color: isActive ? 'var(--t-accent-text)' : 'var(--t-muted)',
                      fontWeight: isActive ? 700 : 500,
                      textDecoration: 'none',
                    })}
                  >
                    <i className={`${sub.icon} w-3.5 text-center text-[11px]`}></i>
                    <span className="truncate">{sub.name}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      }

      return (
        <NavLink
          key={item.href || item.tabId}
          to={item.href || '#'}
          onClick={() => {
            setPopoverGroupId(null);
            if (isMobileDrawer) onClose();
          }}
          className="nav-sub-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs"
          style={({ isActive }) => ({
            background: isActive ? 'var(--t-accent-soft)' : undefined,
            color: isActive ? 'var(--t-accent-text)' : 'var(--t-text)',
            fontWeight: isActive ? 700 : 500,
            border: isActive ? '1px solid var(--t-accent-soft)' : '1px solid transparent',
            textDecoration: 'none',
          })}
        >
          {({ isActive }) => (
            <>
              <i
                className={`${item.icon} w-4 text-center text-xs shrink-0`}
                style={{ color: isActive ? 'var(--t-accent)' : item.color || 'var(--t-muted)' }}
              ></i>
              <span className="truncate">{item.name}</span>
            </>
          )}
        </NavLink>
      );
    });

  return (
    <aside
      ref={sidebarRef}
      id="mainSidebar"
      className={`sidebar ${isOpen ? 'open mobile-open' : ''} ${effectiveCollapsed ? 'is-collapsed' : 'dual-rail-sidebar'}`}
      style={{
        width: isMobileDrawer ? '280px' : effectiveCollapsed ? '62px' : '272px',
        minWidth: isMobileDrawer ? '280px' : effectiveCollapsed ? '62px' : '272px',
        maxWidth: isMobileDrawer ? '280px' : effectiveCollapsed ? '62px' : '272px',
        padding: 0,
        display: 'flex',
        flexDirection: 'row',
        flexShrink: 0,
        height: '100%',
        position: isMobileDrawer ? 'fixed' : 'relative',
        overflow: 'visible',
        background: 'transparent',
        borderRight: '1px solid var(--t-border)',
        transition: 'width 0.22s ease, min-width 0.22s ease, max-width 0.22s ease',
        zIndex: isMobileDrawer ? 9999 : 40,
      }}
    >
      {/* RAIL PRINCIPAL DE ICONOS (SIEMPRE VISIBLE - 62px) */}
      <div
        style={{
          width: '62px',
          minWidth: '62px',
          background: 'var(--t-rail-bg)',
          color: 'var(--t-rail-text)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 6px',
          borderRight: effectiveCollapsed ? 'none' : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex flex-col items-center gap-2 w-full">
          {visibleGroups.map((grp, idx) => {
            const isSelected = activeGroup?.id === grp.id;
            const isCurrentRouteGroup = isGroupActive(grp);
            const isPopOpen = popoverGroupId === grp.id;
            const highlighted = effectiveCollapsed ? (isPopOpen || isCurrentRouteGroup) : isSelected;
            const alignBottom = idx >= Math.max(3, visibleGroups.length - 3);

            return (
              <div key={grp.id} style={{ position: 'relative', display: 'flex', justifyContent: 'center', width: '100%' }}>
                <button
                  type="button"
                  title={grp.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (effectiveCollapsed) {
                      setPopoverGroupId((prev) => (prev === grp.id ? null : grp.id));
                      setSelectedGroupId(grp.id);
                    } else {
                      setSelectedGroupId(grp.id);
                    }
                  }}
                  className={`rail-item-btn w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer ${highlighted ? 'is-highlighted' : ''}`}
                  style={{
                    backgroundColor: highlighted ? 'var(--t-accent)' : undefined,
                    color: highlighted ? '#ffffff' : 'var(--t-rail-text)',
                    border: isCurrentRouteGroup && !highlighted ? '1px solid var(--t-accent)' : '1px solid transparent',
                    boxShadow: highlighted ? '0 4px 12px rgba(0, 0, 0, 0.25)' : 'none',
                  }}
                >
                  <i className={`${grp.iconClass} text-[14px]`}></i>
                  <span style={{ fontSize: '7.5px', fontWeight: 700, letterSpacing: '0.02em', lineHeight: '9px' }}>
                    {grp.shortTitle.slice(0, 6)}
                  </span>
                </button>

                {/* POPOVER ALINEADO AL ICONO CLICKEADO EN MODO COLAPSADO (OPCIÓN 5) */}
                {effectiveCollapsed && isPopOpen && (
                  <div
                    className="dual-rail-popover"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      left: '58px',
                      ...(alignBottom ? { bottom: 0 } : { top: 0 }),
                      width: '232px',
                      maxHeight: 'calc(100vh - 100px)',
                      overflowY: 'auto',
                      background: 'var(--t-surface-solid)',
                      border: '1px solid var(--t-border)',
                      borderRadius: '14px',
                      boxShadow: '0 18px 40px rgba(0, 0, 0, 0.22)',
                      padding: '10px',
                      zIndex: 9999,
                    }}
                  >
                    <div
                      className="flex items-center justify-between px-2 pb-2 mb-2"
                      style={{ borderBottom: '1px solid var(--t-border)' }}
                    >
                      <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--t-muted)' }}>
                        {grp.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPopoverGroupId(null)}
                        className="w-6 h-6 rounded-md flex items-center justify-center cursor-pointer text-xs"
                        style={{ color: 'var(--t-muted)' }}
                        title="Cerrar"
                      >
                        ✕
                      </button>
                    </div>
                    <nav className="space-y-1">{renderNavLinks(grp.visibleItems)}</nav>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Botón Colapsar / Expandir (Opción 1) */}
        {!isMobileDrawer && (
          <button
            type="button"
            onClick={() => toggleCollapse()}
            title={effectiveCollapsed ? 'Expandir panel de menú (Dual-Rail)' : 'Colapsar a Mini-Rail'}
            className="rail-collapse-btn w-10 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all"
            style={{
              background: 'rgba(255,255,255,0.07)',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <i className={`fa-solid fa-angles-${effectiveCollapsed ? 'right' : 'left'} text-xs`}></i>
          </button>
        )}
      </div>

      {/* PANEL SECUNDARIO EXPANDIDO (OPCIÓN 2 - DUAL RAIL) */}
      {!effectiveCollapsed && activeGroup && (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--t-sub-bg)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '14px 10px',
            overflowY: 'auto',
          }}
        >
          <div>
            <div
              className="flex items-center justify-between px-2 pb-2.5 mb-2.5"
              style={{ borderBottom: '1px solid var(--t-border)' }}
            >
              <span
                className="text-[11px] font-extrabold uppercase tracking-wider truncate"
                style={{ color: 'var(--t-muted)' }}
              >
                {activeGroup.title}
              </span>
              {isMobileDrawer ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer text-sm font-bold"
                  style={{ border: '1px solid var(--t-border)', color: 'var(--t-muted)' }}
                  title="Cerrar menú"
                >
                  &times;
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleCollapse(true)}
                  className="w-6 h-6 rounded-md flex items-center justify-center cursor-pointer text-[11px]"
                  style={{ border: '1px solid var(--t-border)', color: 'var(--t-muted)' }}
                  title="Colapsar menú"
                >
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
              )}
            </div>

            <nav className="space-y-1">{renderNavLinks(activeGroup.visibleItems)}</nav>
          </div>

          <div
            className="px-2 pt-2.5 mt-3 text-[11px]"
            style={{ borderTop: '1px solid var(--t-border)', color: 'var(--t-muted)' }}
          >
            <div className="font-semibold truncate" style={{ color: 'var(--t-text)' }}>
              {user?.nombreCompleto || user?.username || 'Sistema'}
            </div>
            <div className="text-[10px]">v{APP_VERSION}</div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
