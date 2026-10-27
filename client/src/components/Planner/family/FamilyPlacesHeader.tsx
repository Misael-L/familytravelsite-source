// Header controls copied from TREK PlacesSidebarHeader.tsx d4da05b. Family controller supplies supported filters.
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Search, Plus, X, Upload, ArrowDownUp, Tag, ChevronDown, Check } from 'lucide-react'
import Tooltip from '../../shared/Tooltip'
import { fs, NEUTRAL_TINT } from '../../shared/DialogShell'
import { useTranslation } from '../../../i18n'
const CONTROL = 'h-8 rounded-[10px] shadow-sm'

/** A 32px icon control on the head band, named by its tooltip. `on` fills it in the accent (a mode that is switched on). */
function BandButton({ label, onClick, on = false, lit = false, ariaPressed, ariaExpanded, ariaHaspopup, children }: {
  label: string
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
  on?: boolean
  /** Brighter while its panel or menu is open, or while it is filtering. */
  lit?: boolean
  ariaPressed?: boolean
  ariaExpanded?: boolean
  ariaHaspopup?: 'dialog' | 'menu'
  children: ReactNode
}) {
  let tone = 'bg-surface-card text-content-secondary hover:text-content'
  if (on) tone = 'bg-accent text-accent-text'
  else if (lit) tone = 'bg-surface-card text-content'
  return (
    <Tooltip label={label}>
      <button type="button" onClick={onClick} aria-label={label}
        aria-pressed={ariaPressed} aria-expanded={ariaExpanded} aria-haspopup={ariaHaspopup}
        className={`${CONTROL} relative grid w-8 flex-none place-items-center transition-colors ${tone}`}>
        {children}
      </button>
    </Tooltip>
  )
}

function SearchField({ t, search, setSearch, updateSearch }: { t: (key: string) => string; search: string; setSearch: (value: string) => void; updateSearch: (value: string) => void }) {
  return (
    <label className={`${CONTROL} flex min-w-0 flex-1 items-center gap-2 bg-surface-card ps-2.5 pe-1.5 text-content-faint focus-within:ring-2 focus-within:ring-[color:var(--text-primary)]`}>
      <Search size={13} strokeWidth={2} className="flex-none" />
      <input
        type="text"
        value={search}
        onChange={e => updateSearch(e.target.value)}
        placeholder={t('common.search')}
        aria-label={t('common.search')}
        className="min-w-0 flex-1 border-0 bg-transparent text-content outline-none placeholder:text-content-faint"
        style={fs(12.5, 'body')}
      />
      {search && (
        <Tooltip label={t('places.clearSearch')}>
          <button type="button" onClick={() => setSearch('')} aria-label={t('places.clearSearch')}
            className="grid h-5 w-5 flex-none place-items-center rounded-full text-content-faint hover:bg-surface-hover hover:text-content">
            <X size={12} strokeWidth={2.2} />
          </button>
        </Tooltip>
      )}
    </label>
  )
}


function FilterDropdown({ label, active, badge, icon, open, setOpen, name, children, wide = false, count }: {
  /** What is in force: on the trigger when `wide`, else in the tooltip ("All categories", "4+"). */
  label: string
  active: boolean
  badge?: string | number
  icon?: ReactNode
  /** Takes the row's free width and shows its label (and `count`) on the trigger. */
  wide?: boolean
  count?: number
  open: boolean
  setOpen: (v: boolean | ((v: boolean) => boolean)) => void
  /** The trigger's accessible name: what it filters by. */
  name: string
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    // Captured and stopped, so the key takes back the list and nothing under it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      wrapRef.current?.querySelector('button')?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, setOpen])
  return (
    <div ref={wrapRef} className={wide ? 'min-w-0 flex-1' : 'flex-none'}>
      {wide ? (
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="listbox" aria-label={name}
          className={`${CONTROL} flex w-full min-w-0 items-center gap-1.5 bg-surface-card px-2.5 font-semibold transition-colors ${active || open ? 'text-content' : 'text-content-secondary hover:text-content'}`}
          style={fs(12, 'body')}>
          <span className="min-w-0 truncate text-start">{label}</span>
          {count != null && <span className="font-geist tabular-nums text-content-faint" style={fs(10.5)}>{count}</span>}
          <ChevronDown size={13} strokeWidth={2.2} className={`ms-auto flex-none text-content-faint transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : (
      <Tooltip label={active ? `${name}: ${label}` : name} disabled={open}>
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="listbox" aria-label={name}
          className={`${CONTROL} relative grid w-8 place-items-center bg-surface-card transition-colors ${active || open ? 'text-content' : 'text-content-secondary hover:text-content'}`}>
          {icon}
          {active && badge != null && (
            <span className="absolute -end-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-geist font-bold tabular-nums text-accent-text" style={fs(9)}>
              {badge}
            </span>
          )}
        </button>
      </Tooltip>
      )}
      {open && (
        <div className="trek-popover-enter absolute inset-x-0 top-full z-50 mt-1.5 flex max-h-[min(60vh,360px)] flex-col overflow-y-auto rounded-[12px] border border-edge-secondary bg-surface-card p-1.5 shadow-popover">
          {children}
        </div>
      )}
    </div>
  )
}


export function FamilyPlacesHeader({ search, setSearch, filter, setFilter, tabs, counts, onAddPlace, onImportFile, children, sortByName, onSort }: {
 search: string; setSearch: (value: string) => void; filter: string; setFilter: (value: string) => void;
 tabs: {id: string; label: string}[]; counts: Record<string, number>;
 onAddPlace: () => void; onImportFile: () => void; children?: ReactNode; sortByName: boolean; onSort: () => void
}) {
 const { t } = useTranslation()
 const [showOpen, setShowOpen] = useState(false)
 const current = tabs.find(tab => tab.id === filter) ?? tabs[0]
 return <div className="flex flex-none flex-col gap-2 border-b border-edge-faint px-3 py-2.5" style={{background: NEUTRAL_TINT}}>
   <div className="flex min-w-0 items-center gap-1.5">
     <button type="button" onClick={onAddPlace} className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-accent px-3 font-semibold text-accent-text hover:opacity-90" style={fs(12.5, 'body')}>
       <Plus size={14} strokeWidth={2.2}/><span className="truncate">{t('places.addPlace')}</span>
     </button>
     <BandButton label={t('places.importFile')} onClick={onImportFile}><Upload size={15} strokeWidth={2}/></BandButton>
   </div>
   <div className="relative flex items-center gap-1.5"><SearchField t={t} search={search} setSearch={setSearch} updateSearch={setSearch}/></div>
   <div className="relative flex min-w-0 items-center gap-1.5">
     <FilterDropdown wide name={t('places.filterShow')} label={current.label} count={counts[current.id]}
       active={filter !== 'all'} open={showOpen} setOpen={setShowOpen}>
       {tabs.map(tab => <button key={tab.id} type="button" role="option" aria-selected={filter === tab.id}
         onClick={() => {setFilter(tab.id); setShowOpen(false)}}
         className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-start text-content hover:bg-surface-hover" style={fs(12.5, 'body')}>
         <span className="min-w-0 flex-1 truncate">{tab.label}</span><span className="font-geist tabular-nums text-content-faint" style={fs(10.5)}>{counts[tab.id]}</span>
         {filter === tab.id && <Check size={13} strokeWidth={2.4}/>}
       </button>)}
     </FilterDropdown>
     {children}
     <BandButton label={t('places.sortBy')} on={sortByName} ariaPressed={sortByName} onClick={onSort}><ArrowDownUp size={15} strokeWidth={2}/></BandButton>
   </div>
 </div>
}
