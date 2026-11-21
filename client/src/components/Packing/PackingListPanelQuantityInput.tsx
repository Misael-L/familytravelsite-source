import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { NumericInput } from '../shared/NumericInput'

/** `style` lays over the frame, for a row that wants the field quieter at rest. */
export function QuantityInput({ value, onSave, style, onBegin, readOnly }: { readOnly?: boolean; value: number; onSave: (qty: number) => void | Promise<void>; onBegin?: () => void | (() => boolean); style?: CSSProperties }) {
  const owner = useRef<() => boolean>(() => true)
  const begin = () => { const current = onBegin?.(); owner.current = typeof current === 'function' ? current : () => true }
  const [local, setLocal] = useState(String(value))
  const focused = useRef(false), saving = useRef(false), retained = useRef(false)
  const [pending, setPending] = useState(false)
  useEffect(() => { if (!onBegin || (!focused.current && !saving.current && !retained.current)) setLocal(String(value)) }, [value, onBegin])

  const commit = () => {
    if (readOnly || (onBegin && saving.current)) return
    focused.current = false
    const qty = Math.max(1, Math.min(999, Number(local) || 1))
    setLocal(String(qty))
    if (qty !== value || (!!onBegin && retained.current)) {
      if (!onBegin) { void onSave(qty); return }
      saving.current = true; setPending(true)
      const current = owner.current
      void Promise.resolve(onSave(qty)).then(() => { if (current()) retained.current = false }, () => { if (current()) retained.current = true }).finally(() => { if (current()) { saving.current = false; setPending(false) } })
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border-primary)', borderRadius: 8, padding: '3px 6px', background: 'transparent', flexShrink: 0, ...style }}>
      <NumericInput
        value={local}
        readOnly={readOnly || (!!onBegin && pending)}
        onFocus={() => { if (onBegin) { focused.current = true; begin() } }}
        onValueChange={next => { if (onBegin && !focused.current) { focused.current = true; begin() }; setLocal(next) }}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { if (!onBegin) commit(); (e.target as HTMLInputElement).blur() } }}
        style={{ width: 24, border: 'none', outline: 'none', background: 'transparent', fontSize: 'calc(12px * var(--fs-scale-body, 1))', textAlign: 'end', fontFamily: 'inherit', color: 'var(--text-secondary)', padding: 0 }}
      />
      <span style={{ fontSize: 'calc(10px * var(--fs-scale-caption, 1))', color: 'var(--text-faint)', fontWeight: 500 }}>x</span>
    </div>
  )
}
