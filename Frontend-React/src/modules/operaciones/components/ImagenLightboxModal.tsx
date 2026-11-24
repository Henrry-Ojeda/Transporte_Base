import React from 'react';

interface ImagenLightboxModalProps {
  src: string | null;
  title?: string;
  onClose: () => void;
}

export const ImagenLightboxModal: React.FC<ImagenLightboxModalProps> = ({ src, title, onClose }) => {
  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full max-h-[90vh] flex flex-col bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <span className="text-sm font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-image text-indigo-400"></i>
            {title || 'Evidencia Fotográfica'}
          </span>
          <div className="flex items-center gap-2">
            <a
              href={src}
              download={`${(title || 'evidencia').replace(/\s+/g, '_')}.jpg`}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition"
            >
              <i className="fa-solid fa-download mr-1.5"></i>Descargar
            </a>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
              aria-label="Cerrar visor"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950">
          <img
            src={src}
            alt={title || 'Evidencia'}
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg"
          />
        </div>
      </div>
    </div>
  );
};
