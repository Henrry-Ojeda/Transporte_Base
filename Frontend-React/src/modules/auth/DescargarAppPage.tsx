import React, { useState } from 'react';
import { Smartphone, Download, Copy, Check, ShieldCheck, FolderDown } from 'lucide-react';

const APK_URL = '/downloads/transporte-vergel-carrillo.apk';
const FULL_APK_URL = 'https://transporte-vergel-carrillo.vercel.app/downloads/transporte-vergel-carrillo.apk';

export const DescargarAppPage: React.FC = () => {
  const [copiado, setCopiado] = useState(false);

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(FULL_APK_URL);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {}
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#ffffff',
          borderRadius: '22px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
            padding: '22px 20px',
            color: '#ffffff',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '16px',
              background: 'rgba(255,255,255,0.18)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '10px',
            }}
          >
            <Smartphone size={28} />
          </div>
          <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 900 }}>
            Transporte Vergel &amp; Carrillo
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', opacity: 0.9 }}>
            App Móvil Oficial Android • v1.0.5 (62 MB)
          </p>
        </div>

        <div style={{ padding: '22px 20px' }}>
          <div
            style={{
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '12px',
              padding: '10px 12px',
              fontSize: '12px',
              color: '#047857',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
            }}
          >
            <ShieldCheck size={18} style={{ flexShrink: 0 }} />
            <span>Funciona 100% Offline (SQLite), GPS cada 1 min y sincronización automática.</span>
          </div>

          <a
            href={APK_URL}
            download="transporte-vergel-carrillo.apk"
            style={{
              width: '100%',
              height: '50px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#ffffff',
              fontWeight: 900,
              fontSize: '15px',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 6px 16px rgba(5, 150, 105, 0.3)',
            }}
          >
            <Download size={18} />
            <span>Descargar APK (v1.0.5)</span>
          </a>

          <button
            type="button"
            onClick={handleCopiar}
            style={{
              width: '100%',
              height: '42px',
              marginTop: '10px',
              borderRadius: '12px',
              border: '1.5px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {copiado ? <Check size={15} color="#059669" /> : <Copy size={15} />}
            <span>{copiado ? '¡Enlace copiado! Pégalo en Chrome' : 'Copiar enlace para abrir en Chrome'}</span>
          </button>

          <div
            style={{
              marginTop: '16px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px',
              fontSize: '11.5px',
              color: '#475569',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FolderDown size={14} color="#2563eb" />
              <span>¿Ya descargó (62.6 MB) y no abrió el instalador?</span>
            </div>
            1. Abre la app <b>Mis Archivos</b> (o <b>Descargas</b>) en tu teléfono.
            <br />
            2. Entra a la carpeta <b>Descargas (Downloads)</b>.
            <br />
            3. Toca <b>transporte-vergel-carrillo.apk</b> e instala.
          </div>
        </div>
      </div>
    </div>
  );
};

export default DescargarAppPage;
