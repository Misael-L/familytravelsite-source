import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useRegisterOwnedPicker } from './ownedPickerLayer';

import { SelectOptionContent, SelectTrigger } from '../../../../../components/shared/CustomSelectParts';
import { filterSelectOptions, type SelectOption } from '../../../../../components/shared/selectOptions';

interface CustomSelectProps {
  value: string | number;
  onChange: (value: string | number) => void;
  options?: SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  style?: React.CSSProperties;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = '',
  searchable = false,
  style = {},
  size = 'md',
  disabled = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useRegisterOwnedPicker(open, triggerRef, dropRef, () => setOpen(false));

  useEffect(() => {
    if (open && searchable && searchRef.current) searchRef.current.focus();
  }, [open, searchable]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = filterSelectOptions(options, searchable ? search : '');

  const handleEscape = (event: React.KeyboardEvent) => {
    if (!open || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    setSearch('');
    triggerRef.current?.focus();
  };

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <SelectTrigger
        ref={triggerRef}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((o) => !o);
            setSearch('');
          }
        }}
        onKeyDown={handleEscape}
        open={open}
        size={size}
        selected={selected}
        placeholder={placeholder}
      />

      {/* Dropdown */}
      {open &&
        ReactDOM.createPortal(
          <div
            ref={dropRef}
            onKeyDown={handleEscape}
            style={{
              position: 'fixed',
              ...(() => {
                const r = ref.current?.getBoundingClientRect();
                if (!r) return { top: 0, insetInlineStart: 0, width: 200 };
                const spaceBelow = window.innerHeight - r.bottom;
                const openUp = spaceBelow < 220 && r.top > spaceBelow;
                return openUp
                  ? { bottom: window.innerHeight - r.top + 4, insetInlineStart: r.left, width: r.width }
                  : { top: r.bottom + 4, insetInlineStart: r.left, width: r.width };
              })(),
              zIndex: 'var(--z-overlay)',
              background: 'var(--bg-card)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid var(--border-primary)',
              borderRadius: 10,
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
              animation: 'trek-menu-enter 200ms cubic-bezier(0.23, 1, 0.32, 1)',
              transformOrigin: 'top center',
              willChange: 'transform, opacity',
            }}
          >
            {/* Search */}
            {searchable && (
              <div style={{ padding: '6px 6px 2px' }}>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="..."
                  style={{
                    width: '100%',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    fontSize: 'calc(12px * var(--fs-scale-body, 1))',
                    outline: 'none',
                    fontFamily: 'inherit',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Options */}
            <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px' }}>
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: '10px 12px',
                    fontSize: 'calc(12px * var(--fs-scale-body, 1))',
                    color: 'var(--text-faint)',
                    textAlign: 'center',
                  }}
                >
                  —
                </div>
              ) : (
                filtered.map((option) => {
                  if (option.isHeader) {
                    return (
                      <div
                        key={option.value}
                        style={{
                          padding: '5px 10px',
                          fontSize: 'calc(10px * var(--fs-scale-caption, 1))',
                          fontWeight: 700,
                          color: 'var(--text-faint)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          background: 'var(--bg-tertiary)',
                          borderRadius: 4,
                          margin: '2px 0',
                        }}
                      >
                        {option.label}
                      </div>
                    );
                  }
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        setSearch('');
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 10px',
                        borderRadius: 6,
                        border: 'none',
                        background: isSelected ? 'var(--bg-hover)' : 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: 'calc(13px * var(--fs-scale-body, 1))',
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        textAlign: 'start',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = isSelected ? 'var(--bg-hover)' : 'transparent')
                      }
                    >
                      <SelectOptionContent option={option} selected={isSelected} />
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
