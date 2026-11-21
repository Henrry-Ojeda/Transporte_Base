import React, { useState, useEffect } from 'react';
import { Wallet, Users, Truck, Coins, History } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { useAuthStore } from '@/stores/authStore';
import { AdelantosPersonalPage } from '@/modules/finanzas/AdelantosPersonalPage';
import { AdelantosReceptoriaPage } from '@/modules/finanzas/AdelantosReceptoriaPage';
import { AbonosAmortizacionesPage } from '@/modules/finanzas/AbonosAmortizacionesPage';
import { HistorialAdelantosPage } from '@/modules/finanzas/HistorialAdelantosPage';

export type OtrosAdelantosTab = 'personal' | 'receptoria' | 'amortizaciones' | 'historial';

interface OtrosAdelantosPageProps {
  defaultTab?: OtrosAdelantosTab;
}

export const OtrosAdelantosPage: React.FC<OtrosAdelantosPageProps> = ({ defaultTab = 'personal' }) => {
  const hasTenantModule = useAuthStore((s) => s.hasTenantModule);
  const tieneLiquidaciones = hasTenantModule('MOD_LIQUIDACIONES');

  const [tab, setTab] = useState<OtrosAdelantosTab>(defaultTab);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const tabItems = [
    ...(tieneLiquidaciones
      ? [{ id: 'personal' as const, label: 'Personal & Choferes', icon: <Users className="w-4 h-4" /> }]
      : []),
    { id: 'receptoria' as const, label: 'Receptoría', icon: <Truck className="w-4 h-4" /> },
    { id: 'amortizaciones' as const, label: 'Abonos & Amortizaciones', icon: <Coins className="w-4 h-4" /> },
    ...(tieneLiquidaciones
      ? [{ id: 'historial' as const, label: 'Historial General', icon: <History className="w-4 h-4" /> }]
      : []),
  ];

  const activeTab = tabItems.some((t) => t.id === tab) ? tab : (tabItems[0]?.id ?? 'receptoria');

  return (
    <div className="page-container fade-in">
      <PageHeader
        title="Otros Adelantos e Historial"
        subtitle="Gestión unificada de adelantos al personal, receptoría, amortizaciones e historial consolidado"
        icon={<Wallet className="w-5 h-5" />}
      />

      <div className="bg-white rounded-2xl border border-slate-200 px-5 pt-2 mb-5 shadow-xs">
        <Tabs<OtrosAdelantosTab>
          activeId={activeTab}
          onChange={setTab}
          items={tabItems}
        />
      </div>

      {activeTab === 'personal' && <AdelantosPersonalPage />}
      {activeTab === 'receptoria' && <AdelantosReceptoriaPage />}
      {activeTab === 'amortizaciones' && <AbonosAmortizacionesPage />}
      {activeTab === 'historial' && <HistorialAdelantosPage />}
    </div>
  );
};
