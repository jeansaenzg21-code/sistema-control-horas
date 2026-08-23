import { TrendingUp, Wallet, HelpCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { esFacturable, esNoFacturable, cn } from '@/lib/utils'

type VarianteFacturable = 'si' | 'no' | 'por_definir'

const estilos: Record<VarianteFacturable, { label: string; clases: string; Icono: LucideIcon }> = {
  si: {
    label: 'Facturable',
    clases: 'border border-emerald-500/40 bg-emerald-500/5 text-emerald-400',
    Icono: TrendingUp,
  },
  no: {
    label: 'No facturable',
    clases: 'border border-zinc-500/40 bg-zinc-500/5 text-zinc-400',
    Icono: Wallet,
  },
  por_definir: {
    label: 'Por definir',
    clases: 'border border-dashed border-[#a78bfa]/60 bg-transparent text-[#c4b5fd]',
    Icono: HelpCircle,
  },
}

export function obtenerVarianteFacturable(valor: unknown): VarianteFacturable {
  if (esFacturable(valor)) return 'si'
  if (esNoFacturable(valor)) return 'no'
  return 'por_definir'
}

export function FacturableBadge({ valor }: { valor: unknown }) {
  const variante = obtenerVarianteFacturable(valor)
  const estilo = estilos[variante]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap',
        estilo.clases,
      )}
    >
      <estilo.Icono size={11} />
      {estilo.label}
    </span>
  )
}
