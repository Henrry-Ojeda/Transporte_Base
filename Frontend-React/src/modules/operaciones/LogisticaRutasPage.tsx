import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RutasLogisticaPage } from './RutasLogisticaPage';
import { PlanificacionRutasChoferesPage } from './PlanificacionRutasChoferesPage';
import { MapaRutasPage } from './MapaRutasPage';
import { useAuthStore } from '@/stores/authStore';

type TabLogistica = 'circuitos' | 'planificacion' | 'mapa';

export const LogisticaRutasPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const hasMapa = useAuthStore((s) => s.hasTenantModule('MOD_MAPA_RUTAS'));

  const resolveInitialTab = (): TabLogistica => {
    const t = searchParams.get('tab');
    if (t === 'planificacion') return 'planificacion';
    if (t === 'mapa' && hasMapa) return 'mapa';
    return 'circuitos';
  };

  const [activeTab, setActiveTab] = useState<TabLogistica>(resolveInitialTab);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'circuitos' || t === 'planificacion' || (t === 'mapa' && hasMapa)) {
      setActiveTab(t);
    }
  }, [searchParams, hasMapa]);

  const handleTab = (tab: TabLogistica) => {
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
          onClick={() => handleTab('circuitos')}
          className="btn btn-sm"
          style={{
            borderRadius: '10px',
            fontWeight: 800,
            padding: '7px 14px',
            background: activeTab === 'circuitos' ? '#2563eb' : '#f8fafc',
            color: activeTab === 'circuitos' ? '#ffffff' : '#475569',
            border: activeTab === 'circuitos' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
          }}
        >
          <i className="fa-solid fa-route" style={{ marginRight: '6px' }}></i>
          1. Circuitos y Rutas Base
        </button>

        <button
          type="button"
          onClick={() => handleTab('planificacion')}
          className="btn btn-sm"
          style={{
            borderRadius: '10px',
            fontWeight: 800,
            padding: '7px 14px',
            background: activeTab === 'planificacion' ? '#059669' : '#f8fafc',
            color: activeTab === 'planificacion' ? '#ffffff' : '#475569',
            border: activeTab === 'planificacion' ? '1.5px solid #059669' : '1px solid #cbd5e1',
          }}
        >
          <i className="fa-solid fa-calendar-check" style={{ marginRight: '6px' }}></i>
          2. Planificación Rutas-Choferes
        </button>

        {hasMapa && (
          <button
            type="button"
            onClick={() => handleTab('mapa')}
            className="btn btn-sm"
            style={{
              borderRadius: '10px',
              fontWeight: 800,
              padding: '7px 14px',
              background: activeTab === 'mapa' ? '#0d9488' : '#f8fafc',
              color: activeTab === 'mapa' ? '#ffffff' : '#475569',
              border: activeTab === 'mapa' ? '1.5px solid #0d9488' : '1px solid #cbd5e1',
            }}
          >
            <i className="fa-solid fa-map-location-dot" style={{ marginRight: '6px' }}></i>
            3. Mapa de Rutas & GPS
          </button>
        )}
      </div>

      {activeTab === 'circuitos' && <RutasLogisticaPage />}
      {activeTab === 'planificacion' && <PlanificacionRutasChoferesPage />}
      {activeTab === 'mapa' && hasMapa && <MapaRutasPage />}
    </div>
  );
};
