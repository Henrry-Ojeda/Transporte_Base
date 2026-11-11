import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  subLabel?: string;
  badge?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string | number | undefined | null;
  onChange: (value: any) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  className?: string;
  style?: React.CSSProperties;
  dropDirection?: 'auto' | 'down' | 'up';
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '-- Seleccionar opción --',
  searchPlaceholder = 'Buscar...',
  disabled = false,
  required = false,
  allowClear = true,
  className = '',
  style,
  dropDirection = 'down',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);

  // Detección de dropup o forzado hacia abajo para evitar que tape la cabecera de los modales
  useEffect(() => {
    if (isOpen && containerRef.current) {
      if (dropDirection === 'down') {
        setDropUp(false);
        return;
      }
      if (dropDirection === 'up') {
        setDropUp(true);
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 220 && spaceAbove >= 360 && spaceAbove > spaceBelow) {
        setDropUp(true);
      } else {
        setDropUp(false);
      }
    }
  }, [isOpen, dropDirection]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Enfocar input al abrir y reiniciar índice destacado
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    } else {
      setSearchTerm('');
      setHighlightedIndex(0);
    }
  }, [isOpen]);

  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  const filteredOptions = options.filter((opt) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const matchesLabel = opt.label.toLowerCase().includes(term);
    const matchesSub = opt.subLabel ? opt.subLabel.toLowerCase().includes(term) : false;
    return matchesLabel || matchesSub;
  });

  // Asegurar que el highlightedIndex esté en rango si filteredOptions cambia
  useEffect(() => {
    setHighlightedIndex((prev) => {
      if (filteredOptions.length === 0) return 0;
      return prev >= filteredOptions.length ? 0 : prev;
    });
  }, [filteredOptions.length]);

  // Scroll automático hacia la opción destacada
  useEffect(() => {
    if (isOpen && optionsListRef.current) {
      const activeEl = optionsListRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (val: string | number) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < filteredOptions.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(0, filteredOptions.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex].value);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    } else if (e.key === 'Tab') {
      if (filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex].value);
      }
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      style={{ position: 'relative', width: '100%', ...style }}
    >
      {/* Botón selector principal */}
      <div
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        onKeyDown={(e) => {
          if (!disabled && !isOpen && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        className={`form-input flex items-center justify-between cursor-pointer select-none transition ${
          disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'bg-white hover:border-blue-400'
        } ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          minHeight: '38px',
          height: '38px',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor: disabled ? '#f1f5f9' : '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
          {selectedOption ? (
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {selectedOption.label}
            </span>
          ) : (
            <span style={{ fontSize: '13px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{placeholder}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {allowClear && selectedOption && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px',
                cursor: 'pointer',
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
              }}
              className="hover:text-red-500 transition"
              title="Limpiar selección"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={16}
            style={{
              color: '#64748b',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          />
        </div>
      </div>

      {/* Menú desplegable con filtro */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            ...(dropUp ? { bottom: '100%', marginBottom: '6px' } : { top: '100%', marginTop: '4px' }),
            left: 0,
            right: 0,
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.2), 0 8px 10px -6px rgba(15, 23, 42, 0.15)',
            zIndex: 99999,
            overflow: 'hidden',
          }}
        >
          {/* Barra de búsqueda interactiva */}
          <div
            style={{
              padding: '8px',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: '13px',
                color: '#1e293b',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Lista de opciones filtradas */}
          <div
            ref={optionsListRef}
            style={{
              maxHeight: '220px',
              overflowY: 'auto',
              padding: '4px 0',
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: '12px 16px',
                  textAlign: 'center',
                  fontSize: '12.5px',
                  color: '#94a3b8',
                }}
              >
                No se encontraron coincidencias
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                const isHighlighted = idx === highlightedIndex;
                return (
                  <div
                    key={opt.value}
                    onClick={() => {
                      if (!opt.disabled) handleSelect(opt.value);
                    }}
                    style={{
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      backgroundColor: opt.disabled ? '#f8fafc' : isSelected ? '#eff6ff' : isHighlighted ? '#f1f5f9' : 'transparent',
                      color: opt.disabled ? '#94a3b8' : isSelected ? '#1d4ed8' : '#1e293b',
                      opacity: opt.disabled ? 0.65 : 1,
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={() => {
                      if (!opt.disabled) setHighlightedIndex(idx);
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: isSelected ? 700 : 600, color: isSelected ? '#1d4ed8' : '#0f172a', fontSize: '13px' }}>
                        {opt.label}
                      </span>
                      {opt.subLabel && (
                        <span style={{ fontSize: '11px', color: isSelected ? '#3b82f6' : '#64748b' }}>
                          {opt.subLabel}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={16} style={{ color: '#2563eb', flexShrink: 0 }} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;

