'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import type { Cliente } from '@/lib/clientes-context'
import { cn } from '@/lib/utils'

export function ClienteSearch({
  clientes,
  value,
  onChange,
}: {
  clientes: Cliente[]
  value: number | ''
  onChange: (id: number | '') => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const contenedor = useRef<HTMLDivElement>(null)
  const seleccionado = clientes.find((cliente) => cliente.id === Number(value))
  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es')
    return termino.length >= 2
      ? clientes.filter((cliente) => cliente.nombre.toLocaleLowerCase('es').includes(termino))
      : []
  }, [clientes, busqueda])

  if (clientes.length <= 10) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
        className="w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
      >
        <option value="">Sin cliente (opcional)</option>
        {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}
      </select>
    )
  }

  return (
    <div className="relative" ref={contenedor}>
      <button type="button" aria-haspopup="listbox" aria-expanded={abierto} onClick={() => { setAbierto(!abierto); setBusqueda('') }}
        className={cn('flex w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/40', abierto ? 'border-[#7c3aed]/60' : 'border-border hover:border-[#7c3aed]/40')}>
        <span className="min-w-0 flex-1 truncate">
          {seleccionado ? <span className="block truncate text-foreground">{seleccionado.nombre}</span> : <span className="text-muted-foreground">Buscar cliente...</span>}
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-full min-w-[min(18rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/20">
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Escribe el nombre del cliente"
              onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(false) }}
              className="w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground" />
            {busqueda && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setBusqueda('')} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={14} /></button>}
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5" role="listbox" aria-label="Clientes">
            {busqueda.trim().length >= 2 && <>
            <button type="button" role="option" aria-selected={!value} onClick={() => { onChange(''); setAbierto(false) }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <span>Sin cliente <span className="text-xs">(opcional)</span></span>{!value && <Check size={15} className="text-[#c4b5fd]" />}
            </button>
            {filtrados.map((cliente) => (
              <button key={cliente.id} type="button" role="option" aria-selected={Number(value) === cliente.id}
                onClick={() => { onChange(cliente.id); setAbierto(false) }}
                className={cn('flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted', Number(value) === cliente.id && 'bg-[#7c3aed]/10 text-[#c4b5fd]')}>
                <span className="min-w-0"><span className="block truncate font-medium">{cliente.nombre}</span><span className="block truncate text-[11px] text-muted-foreground">{cliente.area_nombre}</span></span>
                {Number(value) === cliente.id && <Check size={16} className="shrink-0" />}
              </button>
            ))}
            {filtrados.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No se encontraron clientes.</p>}
            </>}
          </div>
          {busqueda.trim().length >= 2 && <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">{filtrados.length} {filtrados.length === 1 ? 'cliente' : 'clientes'}</div>}
        </div>
      )}
    </div>
  )
}
