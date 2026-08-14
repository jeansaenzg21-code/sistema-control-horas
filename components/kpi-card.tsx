'use client'

import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type VarianteColor = 'morado' | 'verde' | 'ambar' | 'rojo' | 'gris'

interface KPICardProps {
  titulo: string
  valor: string | number
  icono: LucideIcon
  tendencia?: {
    direccion: 'up' | 'down'
    porcentaje: number
  }
  color?: VarianteColor
  detalle?: string
  className?: string
}

const iconoMap: Record<VarianteColor, string> = {
  morado: 'text-[#c4b5fd] bg-[#7c3aed]/15',
  verde: 'text-emerald-400 bg-emerald-400/10',
  ambar: 'text-amber-400 bg-amber-400/10',
  rojo: 'text-rose-400 bg-rose-400/10',
  gris: 'text-muted-foreground bg-muted',
}

export function KPICard({
  titulo,
  valor,
  icono: Icono,
  tendencia,
  color = 'morado',
  detalle,
  className,
}: KPICardProps) {
  const tendenciaAlta = tendencia?.direccion === 'up'
  const mostrarTendencia = tendencia && tendenciaAlta && tendencia.porcentaje > 0

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 transition-colors hover:border-[#7c3aed]/40', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {titulo}
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <h3 className="text-3xl font-bold tracking-tight text-foreground">{valor}</h3>
            {mostrarTendencia && (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-400">
                <ArrowUpRight size={13} />
                {tendencia.porcentaje}%
              </span>
            )}
          </div>
          {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
        </div>
        <div className={cn('flex h-9 w-9 flex-none items-center justify-center rounded-lg', iconoMap[color])}>
          <Icono size={17} />
        </div>
      </div>
    </div>
  )
}