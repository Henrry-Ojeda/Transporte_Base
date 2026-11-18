import React, { useRef, useState } from 'react';

export interface FotoEvidenciaItem {
  titulo: string;
  imagen: string;
}

const ETIQUETAS_RAPIDAS = [
  'Foto del Tanque',
  'Foto de la Manguera',
  'Muestra de Leche',
  'Estado del Ordeño',
  'Otra Evidencia',
];

export function parseFotosEvidencia(raw?: string | null): FotoEvidenciaItem[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.imagen === 'string' && x.imagen.trim() !== '')
      .map((x) => ({
        titulo: typeof x.titulo === 'string' && x.titulo.trim() ? x.titulo.trim() : 'Evidencia',
        imagen: x.imagen,
      }));
  } catch {
    return [];
  }
}

async function comprimirImagen(file: File, maxDim = 1024, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(reader.result as string);
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

interface EvidenciasFincaSectionProps {
  fotos: FotoEvidenciaItem[];
  onChange: (next: FotoEvidenciaItem[]) => void;
  onPreview?: (img: string) => void;
}

export const EvidenciasFincaSection: React.FC<EvidenciasFincaSectionProps> = ({
  fotos,
  onChange,
  onPreview,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [etiquetaActiva, setEtiquetaActiva] = useState<string>('Foto del Tanque');
  const [procesando, setProcesando] = useState(false);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setProcesando(true);
    try {
      const nuevas: FotoEvidenciaItem[] = [];
      for (const f of files) {
        const b64 = await comprimirImagen(f);
        nuevas.push({
          titulo: etiquetaActiva || 'Evidencia',
          imagen: b64,
        });
      }
      onChange([...fotos, ...nuevas]);
    } finally {
      setProcesando(false);
      e.target.value = '';
    }
  };

  const handleTituloChange = (idx: number, titulo: string) => {
    const copia = [...fotos];
    copia[idx] = { ...copia[idx], titulo };
    onChange(copia);
  };

  const handleRemove = (idx: number) => {
    onChange(fotos.filter((_, i) => i !== idx));
  };

  return (
    <div
      style={{
        border: '1.5px solid #cbd5e1',
        borderRadius: '12px',
        padding: '12px',
        background: '#f8fafc',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="fa-solid fa-images text-indigo-600"></i>
          <span>Evidencias / Eventos en Finca (Varias Fotos)</span>
        </div>
        {fotos.length > 0 && (
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '999px',
              background: '#e0e7ff',
              color: '#3730a3',
            }}
          >
            {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}
          </span>
        )}
      </div>

      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
        Seleccione el tipo de evidencia antes de adjuntar (puede editar el título de cada foto para mostrar al propietario):
      </div>

      {/* Etiquetas rápidas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        {ETIQUETAS_RAPIDAS.map((tag) => {
          const active = etiquetaActiva === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setEtiquetaActiva(tag)}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 9px',
                borderRadius: '999px',
                border: active ? '1.5px solid #4f46e5' : '1px solid #cbd5e1',
                background: active ? '#eef2ff' : '#ffffff',
                color: active ? '#3730a3' : '#475569',
                cursor: 'pointer',
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesSelected}
      />

      <button
        type="button"
        disabled={procesando}
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%',
          padding: '9px 12px',
          borderRadius: '10px',
          border: '1.5px dashed #818cf8',
          background: '#eef2ff',
          color: '#3730a3',
          fontSize: '12px',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          cursor: procesando ? 'wait' : 'pointer',
        }}
      >
        <i className={`fa-solid ${procesando ? 'fa-spinner fa-spin' : 'fa-camera-retro'}`}></i>
        <span>{procesando ? 'Procesando fotos...' : `Agregar Foto(s): ${etiquetaActiva}`}</span>
      </button>

      {/* Lista de fotos adjuntas */}
      {fotos.length > 0 && (
        <div
          style={{
            marginTop: '10px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))',
            gap: '8px',
          }}
        >
          {fotos.map((f, idx) => (
            <div
              key={idx}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                onClick={() => onPreview?.(f.imagen)}
                style={{
                  position: 'relative',
                  height: '92px',
                  background: '#0f172a',
                  cursor: onPreview ? 'pointer' : 'default',
                }}
              >
                <img
                  src={f.imagen}
                  alt={f.titulo}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(idx);
                  }}
                  title="Quitar foto"
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(220, 38, 38, 0.9)',
                    color: '#ffffff',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div style={{ padding: '6px' }}>
                <input
                  type="text"
                  value={f.titulo}
                  onChange={(e) => handleTituloChange(idx, e.target.value)}
                  placeholder="Descripción..."
                  style={{
                    width: '100%',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#1e293b',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '4px 6px',
                    background: '#f8fafc',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface EvidenciasGaleriaModalProps {
  data: {
    fincaNombre: string;
    propietarioNombre?: string;
    telefono?: string;
    fecha?: string;
    litros?: number;
    observacion?: string;
    fotos: FotoEvidenciaItem[];
  } | null;
  onClose: () => void;
  onZoom?: (img: string) => void;
}

export const EvidenciasGaleriaModal: React.FC<EvidenciasGaleriaModalProps> = ({
  data,
  onClose,
  onZoom,
}) => {
  if (!data) return null;

  const enviarWhatsApp = () => {
    const fechaTxt = data.fecha ? String(data.fecha).split('T')[0] : '';
    const listaEvidencias = data.fotos
      .map((f, i) => `  ${i + 1}. ${f.titulo}`)
      .join('\n');

    const mensaje = [
      `🐄 *NOVEDAD / EVIDENCIA EN FINCA*`,
      `🏡 *Finca:* ${data.fincaNombre}`,
      data.propietarioNombre ? `👤 *Propietario:* ${data.propietarioNombre}` : '',
      fechaTxt ? `📅 *Fecha:* ${fechaTxt}` : '',
      data.litros ? `🥛 *Litros:* ${Number(data.litros).toLocaleString()} L` : '',
      data.observacion ? `📝 *Observación:* ${data.observacion}` : '',
      data.fotos.length > 0 ? `📸 *Evidencias adjuntas (${data.fotos.length}):*\n${listaEvidencias}` : '',
      `\n_(Descargue las fotos desde el sistema para adjuntarlas en este chat)_`,
    ]
      .filter(Boolean)
      .join('\n');

    let phone = (data.telefono || '').replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '58' + phone.substring(1);
    else if (phone.length === 10) phone = '58' + phone;

    const url =
      phone.length >= 10
        ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(mensaje)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(4px)',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '760px',
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: '16px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            background: 'linear-gradient(135deg, #312e81, #4338ca)',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '15px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-images"></i>
              <span>Evidencias y Observaciones — {data.fincaNombre}</span>
            </div>
            <div style={{ fontSize: '11.5px', color: '#c7d2fe', marginTop: '2px' }}>
              {data.propietarioNombre ? `Propietario: ${data.propietarioNombre}` : ''}
              {data.fecha ? ` • Fecha: ${String(data.fecha).split('T')[0]}` : ''}
              {data.litros ? ` • ${Number(data.litros).toLocaleString()} L` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#e0e7ff', fontSize: '20px', cursor: 'pointer' }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {data.observacion && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderLeft: '4px solid #f59e0b',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '14px',
                fontSize: '12.5px',
                color: '#78350f',
              }}
            >
              <strong>Observación:</strong> {data.observacion}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
              gap: '12px',
            }}
          >
            {data.fotos.map((f, idx) => (
              <div
                key={idx}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: '#f8fafc',
                }}
              >
                <div
                  onClick={() => onZoom?.(f.imagen)}
                  style={{ height: '160px', background: '#0f172a', cursor: onZoom ? 'pointer' : 'default' }}
                >
                  <img
                    src={f.imagen}
                    alt={f.titulo}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
                <div style={{ padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>{f.titulo}</span>
                  <a
                    href={f.imagen}
                    download={`${data.fincaNombre.replace(/\s+/g, '_')}_${f.titulo.replace(/\s+/g, '_')}_${idx + 1}.jpg`}
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#2563eb',
                      textDecoration: 'none',
                      padding: '3px 7px',
                      borderRadius: '6px',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                    }}
                    title="Descargar foto para enviar al propietario"
                  >
                    <i className="fa-solid fa-download"></i>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            padding: '12px 18px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={enviarWhatsApp}
            style={{
              background: '#16a34a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="fa-brands fa-whatsapp"></i> Enviar Observación al Propietario
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#ffffff',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
