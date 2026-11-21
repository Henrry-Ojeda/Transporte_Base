import React, { useState, useEffect } from 'react';
import { User, Landmark, Clock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { PerfilPage } from '@/modules/sistema/PerfilPage';
import { DatosBancariosPage } from '@/modules/sistema/DatosBancariosPage';
import { TiempoSesionPage } from '@/modules/sistema/TiempoSesionPage';

export type MiCuentaTab = 'perfil' | 'banco' | 'sesion';

interface MiCuentaPageProps {
  defaultTab?: MiCuentaTab;
}

export const MiCuentaPage: React.FC<MiCuentaPageProps> = ({ defaultTab = 'perfil' }) => {
  const [tab, setTab] = useState<MiCuentaTab>(defaultTab);
  const [bancoVisible, setBancoVisible] = useState<boolean>(false);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  // Al cambiar fuera de la pestaña bancaria, volver a ocultar por seguridad
  const handleTabChange = (next: MiCuentaTab) => {
    if (next !== 'banco') {
      setBancoVisible(false);
    }
    setTab(next);
  };

  return (
    <div className="page-container fade-in">
      <PageHeader
        title="Mi Cuenta"
        subtitle="Perfil de usuario, información bancaria protegida y tiempo de inactividad de sesión"
        icon={<User className="w-5 h-5" />}
      />

      <div className="bg-white rounded-2xl border border-slate-200 px-5 pt-2 mb-5 shadow-xs">
        <Tabs<MiCuentaTab>
          activeId={tab}
          onChange={handleTabChange}
          items={[
            { id: 'perfil', label: 'Perfil & Seguridad', icon: <User className="w-4 h-4" /> },
            { id: 'banco', label: 'Datos Bancarios', icon: <Landmark className="w-4 h-4" /> },
            { id: 'sesion', label: 'Tiempo de Sesión', icon: <Clock className="w-4 h-4" /> },
          ]}
        />
      </div>

      {tab === 'perfil' && <PerfilPage />}

      {tab === 'banco' && (
        <div>
          {!bancoVisible ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs max-w-xl mx-auto my-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-extrabold text-slate-900 m-0">
                Información Bancaria Protegida
              </h2>
              <p className="text-sm text-slate-500 mt-2 mb-5 leading-relaxed">
                Tus cuentas bancarias y datos de Pago Móvil permanecen ocultos por privacidad para evitar exposición accidental en pantalla.
              </p>
              <button
                type="button"
                onClick={() => setBancoVisible(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold border-none cursor-pointer shadow-sm transition-colors"
              >
                <Eye className="w-4 h-4" /> Mostrar Datos Bancarios
              </button>
            </div>
          ) : (
            <div>
              <div className="flex justify-end mb-3">
                <button
                  type="button"
                  onClick={() => setBancoVisible(false)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer"
                >
                  <EyeOff className="w-4 h-4" /> Ocultar Datos Bancarios
                </button>
              </div>
              <DatosBancariosPage />
            </div>
          )}
        </div>
      )}

      {tab === 'sesion' && <TiempoSesionPage />}
    </div>
  );
};
