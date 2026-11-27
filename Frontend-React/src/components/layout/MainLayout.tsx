import React, { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ChatAssistantWidget } from '../common/ChatAssistantWidget';
import { useAuthStore } from '@/stores/authStore';

export const MainLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const refreshPermissions = useAuthStore((s) => s.refreshPermissions);
  const lastSyncRef = useRef<number>(0);

  // Sincronizar permisos en vivo desde /api/auth/me al montar y al volver a la pestaña (throttle 20s)
  useEffect(() => {
    const sync = () => {
      const now = Date.now();
      if (now - lastSyncRef.current < 20_000) return;
      lastSyncRef.current = now;
      refreshPermissions();
    };
    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, [refreshPermissions]);

  return (
    <div
      className="app-shell"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--t-bg)',
        color: 'var(--t-text)',
        transition: 'background 0.25s ease, color 0.2s ease',
      }}
    >
      {/* Header Superior Fijo */}
      <Header onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />

      {/* Backdrop Móvil */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop active"
          id="sidebarBackdrop"
          onClick={() => setSidebarOpen(false)}
          onTouchEnd={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            backgroundColor: 'rgba(9, 13, 20, 0.65)',
            backdropFilter: 'blur(4px)',
            cursor: 'pointer',
          }}
        />
      )}

      {/* Contenedor Principal: Dual-Rail Sidebar + Main Content */}
      <div className="main-layout" id="mainLayoutWrapper" style={{ background: 'transparent' }}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main
          className="content-area main-content"
          id="mainContainer"
          style={{ background: 'transparent', color: 'var(--t-text)' }}
        >
          <Outlet />
        </main>
      </div>

      {/* Asistente Virtual IA Flotante */}
      <ChatAssistantWidget />
    </div>
  );
};

export default MainLayout;
