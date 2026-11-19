import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

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
  autoFocus?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '-- Seleccionar opción --',
  searchPlaceholder,
  disabled = false,
  required = false,
  allowClear = true,
  className = '',
  style,
  dropDirection = 'down',
  autoFocus = false,
}) => {
  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState(selectedOption?.label ?? '');
  const [isFiltering, setIsFiltering] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropUp, setDropUp] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  // Sincronizar texto mostrado cuando cambia value o options externamente y no se está escribiendo
  useEffect(() => {
    if (!isOpen || !isFiltering) {
      setInputText(selectedOption?.label ?? '');
    }
  }, [value, selectedOption?.label, isOpen, isFiltering]);

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
        setIsFiltering(false);
        setInputText(selectedOption?.label ?? '');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, selectedOption?.label]);

  const filteredOptions = options.filter((opt) => {
    if (!isFiltering || !inputText.trim()) return true;
    const term = inputText.toLowerCase();
    const matchesLabel = opt.label.toLowerCase().includes(term);
    const matchesSub = opt.subLabel ? opt.subLabel.toLowerCase().includes(term) : false;
    return matchesLabel || matchesSub;
  });

  // Asegurar que highlightedIndex esté en rango
  useEffect(() => {
    if (!isOpen) return;
    if (!isFiltering && selectedOption) {
      const idx = filteredOptions.findIndex((o) => String(o.value) === String(selectedOption.value));
      setHighlightedIndex(idx >= 0 ? idx : 0);
    } else {
      setHighlightedIndex((prev) => {
        if (filteredOptions.length === 0) return 0;
        return prev >= filteredOptions.length ? 0 : prev;
      });
    }
  }, [filteredOptions.length, isOpen, isFiltering, selectedOption?.value]);

  // Scroll automático hacia la opción destacada
  useEffect(() => {
    if (isOpen && optionsListRef.current) {
      const activeEl = optionsListRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const openDropdown = (selectText = true) => {
    if (disabled) return;
    setIsFiltering(false);
    setIsOpen(true);
    if (selectText) {
      setTimeout(() => {
        try {
          inputRef.current?.select();
        } catch {
          // ignore
        }
      }, 0);
    }
  };

  const handleSelect = (val: string | number) => {
    justSelectedRef.current = true;
    const chosen = options.find((o) => String(o.value) === String(val));
    setInputText(chosen?.label ?? '');
    setIsFiltering(false);
    setIsOpen(false);
    onChange(val);
    setTimeout(() => {
      justSelectedRef.current = false;
    }, 120);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setInputText('');
    setIsFiltering(false);
    onChange(undefined);
    inputRef.current?.focus();
    setIsOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    setIsFiltering(true);
    setHighlightedIndex(0);
    if (!isOpen) setIsOpen(true);
    if (!val.trim() && allowClear && value !== undefined && value !== null && value !== '') {
      onChange(undefined);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      openDropdown(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < filteredOptions.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(0, filteredOptions.length - 1)));
    } else if (e.key === 'Enter') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        if (filteredOptions[highlightedIndex] && !filteredOptions[highlightedIndex].disabled) {
          handleSelect(filteredOptions[highlightedIndex].value);
        }
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setIsFiltering(false);
        setInputText(selectedOption?.label ?? '');
      }
    } else if (e.key === 'Tab') {
      if (isOpen && isFiltering && filteredOptions[highlightedIndex] && !filteredOptions[highlightedIndex].disabled) {
        handleSelect(filteredOptions[highlightedIndex].value);
      } else {
        setIsOpen(false);
        setIsFiltering(false);
        setInputText(selectedOption?.label ?? '');
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      style={{ position: 'relative', width: '100%', ...style }}
    >
      {/* Campo de entrada directo estilo V2_3_11_26 (escribe y filtra al instante sin segundo clic) */}
      <div
        onClick={() => {
          if (!disabled && !isOpen) {
            inputRef.current?.focus();
            openDropdown(true);
          }
        }}
        className={`form-input flex items-center justify-between transition ${
          disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'bg-white hover:border-blue-400'
        } ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px 0 12px',
          minHeight: '38px',
          height: '38px',
          border: isOpen ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
          borderRadius: '8px',
          cursor: disabled ? 'not-allowed' : 'text',
          backgroundColor: disabled ? '#f1f5f9' : '#ffffff',
          gap: '6px',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onFocus={() => {
            if (!disabled && !justSelectedRef.current) {
              openDropdown(true);
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled && !isOpen) {
              openDropdown(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || searchPlaceholder}
          disabled={disabled}
          required={required && !selectedOption}
          autoFocus={autoFocus}
          autoComplete="off"
          style={{
            width: '100%',
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            fontSize: '13.5px',
            fontWeight: selectedOption && !isFiltering ? 600 : 500,
            color: '#0f172a',
            padding: 0,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {allowClear && (selectedOption || inputText) && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={handleClear}
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
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (disabled) return;
              if (isOpen) {
                setIsOpen(false);
                setIsFiltering(false);
                setInputText(selectedOption?.label ?? '');
              } else {
                inputRef.current?.focus();
                openDropdown(true);
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronDown
              size={16}
              style={{
                color: '#64748b',
                transform: isOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
              }}
            />
          </button>
        </div>
      </div>

      {/* Lista de opciones desplegable */}
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
          <div
            ref={optionsListRef}
            style={{
              maxHeight: '240px',
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
                    onMouseDown={(e) => {
                      e.preventDefault();
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
