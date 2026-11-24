import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PagosPersonalPage } from './PagosPersonalPage';
import { HistorialPagosPage } from './HistorialPagosPage';

type TabPagos = 'nomina' | 'historial';

export const PagosNominaPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabPagos>(() =>
    searchParams.get('tab') === 'historial' ? 'historial' : 'nomina'
  );

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'nomina' || t === 'historial') setActiveTab(t);
  }, [searchParams]);

  const handleTab = (tab: TabPagos) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

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
        <button
          type="button"
          onClick={() => handleTab('nomina')}
          className="btn btn-sm"
          style={{
            borderRadius: '10px',
            fontWeight: 800,
            padding: '7px 14px',
            background: activeTab === 'nomina' ? '#0284c7' : '#f8fafc',
            color: activeTab === 'nomina' ? '#ffffff' : '#475569',
            border: activeTab === 'nomina' ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
          }}
        >
          <i className="fa-solid fa-money-check-dollar" style={{ marginRight: '6px' }}></i>
          1. Pagos Choferes & Personal
        </button>

        <button
          type="button"
          onClick={() => handleTab('historial')}
          className="btn btn-sm"
          style={{
            borderRadius: '10px',
            fontWeight: 800,
            padding: '7px 14px',
            background: activeTab === 'historial' ? '#6366f1' : '#f8fafc',
            color: activeTab === 'historial' ? '#ffffff' : '#475569',
            border: activeTab === 'historial' ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
          }}
        >
          <i className="fa-solid fa-receipt" style={{ marginRight: '6px' }}></i>
          2. Historial de Pagos
        </button>
      </div>

      {activeTab === 'nomina' && <PagosPersonalPage />}
      {activeTab === 'historial' && <HistorialPagosPage />}
    </div>
  );
};
