import React, { useState } from 'react';
import { QrCode, Copy, Check, ExternalLink, X, Smartphone } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface QrDescargaAppModalProps {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY_URL_APP = 'app_movil_descarga_url_v2';
const getDefaultUrlApp = () =>
  typeof window !== 'undefined' && window.location.origin
    ? `${window.location.origin}/descargar-app`
    : '/descargar-app';

/**
 * Determina dinámicamente si el tenant actual tiene habilitado el módulo de App Móvil (Cero Hardcodeo).
 */
export const esTenantVergelCarrillo = (_empresaCodigo?: string | null): boolean => {
  try {
    return useAuthStore.getState().hasTenantModule('MOD_APP_MOVIL');
  } catch {
    return false;
  }
};

export const QrDescargaAppModal: React.FC<QrDescargaAppModalProps> = ({ open, onClose }) => {
  const DEFAULT_URL_APP = getDefaultUrlApp();
  const [urlDescarga, setUrlDescarga] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_URL_APP) || DEFAULT_URL_APP;
    } catch {
      return DEFAULT_URL_APP;
    }
  });
  const [copiado, setCopiado] = useState(false);

  if (!open) return null;

  const urlEfectiva = urlDescarga.trim() || DEFAULT_URL_APP;
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(urlEfectiva)}`;

  const handleChangeUrl = (val: string) => {
    setUrlDescarga(val);
    try {
      localStorage.setItem(STORAGE_KEY_URL_APP, val);
    } catch {}
  };

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(urlEfectiva);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {}
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '390px',
          overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
            padding: '16px 20px',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Smartphone size={20} />
            <div>
              <div style={{ fontSize: '15px', fontWeight: 900 }}>Descargar App Móvil</div>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>{useAuthStore.getState().user?.empresaNombre || 'Sistema de Transporte'}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-block',
              padding: '12px',
              borderRadius: '16px',
              border: '2px solid #e2e8f0',
              background: '#ffffff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}
          >
            <img
              src={qrImgUrl}
              alt="QR Descargar App Móvil"
              style={{ width: '210px', height: '210px', display: 'block', borderRadius: '8px' }}
            />
          </div>

          <p style={{ fontSize: '12px', color: '#475569', marginTop: '12px', marginBottom: '12px', lineHeight: 1.4 }}>
            Escanea este código QR con la cámara del teléfono del chofer para descargar/abrir la App Móvil.
          </p>

          <div style={{ textAlign: 'left', marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
              <QrCode size={12} style={{ display: 'inline', marginRight: '4px' }} />
              Enlace del APK / App Móvil:
            </label>
            <input
              type="url"
              value={urlDescarga}
              onChange={(e) => handleChangeUrl(e.target.value)}
              placeholder={DEFAULT_URL_APP}
              style={{
                width: '100%',
                height: '38px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                padding: '0 10px',
                fontSize: '12px',
                color: '#0f172a',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleCopiar}
              style={{
                flex: 1,
                height: '40px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                background: '#f8fafc',
                color: '#1e293b',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {copiado ? <Check size={14} color="#059669" /> : <Copy size={14} />}
              <span>{copiado ? '¡Copiado!' : 'Copiar Link'}</span>
            </button>
            <a
              href={urlEfectiva}
              download="transporte-app-movil.apk"
              style={{
                flex: 1,
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '12.5px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <ExternalLink size={14} />
              <span>Abrir / Bajar</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
