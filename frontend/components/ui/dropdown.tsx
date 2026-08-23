'use client'
import { useEffect, useRef, useState } from 'react'

export type DropdownItem = {
  label: string
  onSelect?: () => void
  danger?: boolean
  icon?: React.ReactNode
}

export function Dropdown({
  trigger,
  items,
  ariaLabel,
}: {
  trigger: React.ReactNode
  items: DropdownItem[]
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="row-actions" ref={ref}>
      <button
        className="row-menu-btn"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && (
        <div className="row-menu" role="menu">
          {items.map((item, i) =>
            item.onSelect === undefined ? (
              <div key={i} className="menu-sep" />
            ) : (
              <button
                key={i}
                role="menuitem"
                className={item.danger ? 'danger' : ''}
                onClick={() => {
                  setOpen(false)
                  item.onSelect?.()
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}