import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ChatAssistantWidget } from '../common/ChatAssistantWidget';

export const MainLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
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
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            cursor: 'pointer',
          }}
        />
      )}

      {/* Contenedor Principal: Sidebar + Main Content */}
      <div className="main-layout" id="mainLayoutWrapper" style={{ backgroundColor: '#f8fafc' }}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="content-area main-content" id="mainContainer" style={{ backgroundColor: '#f8fafc' }}>
          <Outlet />
        </main>
      </div>

      {/* Asistente Virtual IA Flotante */}
      <ChatAssistantWidget />
    </div>
  );
};

export default MainLayout;
