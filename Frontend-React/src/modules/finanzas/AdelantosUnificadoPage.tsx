import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdelantosFincasPage } from './AdelantosFincasPage';
import { AdelantosPersonalPage } from './AdelantosPersonalPage';
import { AdelantosReceptoriaPage } from './AdelantosReceptoriaPage';
import { AbonosAmortizacionesPage } from './AbonosAmortizacionesPage';
import { HistorialAdelantosPage } from './HistorialAdelantosPage';

type TabAdelantos = 'fincas' | 'personal' | 'receptoria' | 'amortizaciones' | 'historial';

export const AdelantosUnificadoPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const resolveTab = (): TabAdelantos => {
    const t = searchParams.get('tab');
    if (t === 'personal' || t === 'receptoria' || t === 'amortizaciones' || t === 'historial') return t;
    return 'fincas';
  };

  const [activeTab, setActiveTab] = useState<TabAdelantos>(resolveTab);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'fincas' || t === 'personal' || t === 'receptoria' || t === 'amortizaciones' || t === 'historial') {
      setActiveTab(t);
    }
  }, [searchParams]);

  const handleTab = (tab: TabAdelantos) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const tabs: { id: TabAdelantos; label: string; icon: string; color: string }[] = [
    { id: 'fincas', label: 'Adelantos a Fincas', icon: 'fa-solid fa-leaf', color: '#16a34a' },
    { id: 'personal', label: 'Adelantos Personal', icon: 'fa-solid fa-users', color: '#0284c7' },
    { id: 'receptoria', label: 'Adelantos Receptoría', icon: 'fa-solid fa-warehouse', color: '#7c3aed' },
    { id: 'amortizaciones', label: 'Abonos & Amortizaciones', icon: 'fa-solid fa-hand-holding-dollar', color: '#ea580c' },
    { id: 'historial', label: 'Historial Completo', icon: 'fa-solid fa-clock-rotate-left', color: '#0f766e' },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '16px',
          background: '#ffffff',
          padding: '10px 14px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
        }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTab(tab.id)}
              className="btn btn-sm"
              style={{
                borderRadius: '10px',
                fontWeight: 800,
                padding: '7px 14px',
                background: active ? tab.color : '#f8fafc',
                color: active ? '#ffffff' : '#475569',
                border: active ? `1.5px solid ${tab.color}` : '1px solid #cbd5e1',
              }}
            >
              <i className={tab.icon} style={{ marginRight: '6px' }}></i>
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'fincas' && <AdelantosFincasPage />}
      {activeTab === 'personal' && <AdelantosPersonalPage />}
      {activeTab === 'receptoria' && <AdelantosReceptoriaPage />}
      {activeTab === 'amortizaciones' && <AbonosAmortizacionesPage />}
      {activeTab === 'historial' && <HistorialAdelantosPage />}
    </div>
  );
};
