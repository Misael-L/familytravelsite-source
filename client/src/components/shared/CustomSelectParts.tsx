import { Check, ChevronDown } from 'lucide-react';
import type { ComponentPropsWithRef } from 'react';
import type { SelectOption } from './selectOptions';

function SelectBadge({ children, inTrigger = false }: { children: string; inTrigger?: boolean }) {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: 'calc(10px * var(--fs-scale-caption, 1))',
        fontWeight: 600,
        color: 'var(--text-muted)',
        background: 'var(--bg-tertiary)',
        padding: '2px 7px',
        borderRadius: 999,
        letterSpacing: inTrigger ? '0.01em' : undefined,
      }}
    >
      {children}
    </span>
  );
}

export function SelectTrigger({
  open,
  size,
  selected,
  placeholder,
  disabled,
  ...buttonProps
}: ComponentPropsWithRef<'button'> & {
  open: boolean;
  size: 'sm' | 'md';
  selected?: SelectOption;
  placeholder: string;
}) {
  const compact = size === 'sm';
  return (
    <button
      {...buttonProps}
      type="button"
      disabled={disabled}
      aria-expanded={open}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: compact ? '8px 12px' : '8px 14px',
        borderRadius: 10,
        border: '1px solid var(--border-primary)',
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        fontSize: 'calc(13px * var(--fs-scale-body, 1))',
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        outline: 'none',
        textAlign: 'start',
        transition: 'border-color 0.15s',
        overflow: 'hidden',
        minWidth: 0,
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(event) => {
        if (!disabled) event.currentTarget.style.borderColor = 'var(--text-faint)';
      }}
      onMouseLeave={(event) => {
        if (!open) event.currentTarget.style.borderColor = 'var(--border-primary)';
      }}
    >
      {selected?.icon && <span style={{ display: 'flex', flexShrink: 0 }}>{selected.icon}</span>}
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: selected ? 'var(--text-primary)' : 'var(--text-faint)',
        }}
      >
        {selected ? selected.label : placeholder}
      </span>
      {selected?.badge && <SelectBadge inTrigger>{selected.badge}</SelectBadge>}
      <ChevronDown
        size={compact ? 12 : 14}
        style={{
          flexShrink: 0,
          color: 'var(--text-faint)',
          transition: 'transform 200ms cubic-bezier(0.23,1,0.32,1)',
          transform: open ? 'rotate(180deg)' : 'none',
        }}
      />
    </button>
  );
}

export function SelectOptionContent({ option, selected }: { option: SelectOption; selected: boolean }) {
  return (
    <>
      {option.icon && <span style={{ display: 'flex', flexShrink: 0 }}>{option.icon}</span>}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {option.label}
      </span>
      {option.badge && <SelectBadge>{option.badge}</SelectBadge>}
      {selected && <Check size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
    </>
  );
}
