'use client'

import { FileText } from 'lucide-react'

interface DateRangeFilterProps {
  desde: string
  hasta: string
  disabled?: boolean
  onChange: (desde: string, hasta: string) => void
}

export function DateRangeFilter({ desde, hasta, disabled = false, onChange }: DateRangeFilterProps) {
  const estiloControl =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FileText size={13} />
          Desde
        </label>
        <input
          type="date"
          value={desde}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value, hasta)}
          className={estiloControl}
        />
      </div>
      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FileText size={13} />
          Hasta
        </label>
        <input
          type="date"
          value={hasta}
          disabled={disabled}
          onChange={(e) => onChange(desde, e.target.value)}
          className={estiloControl}
        />
      </div>
    </div>
  )
}
