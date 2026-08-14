import { obtenerEstiloEstado } from '@/lib/estado'
import type { EstadoActividad } from '@/lib/types'
import { cn } from '@/lib/utils'

export function StatusBadge({ estado }: { estado: EstadoActividad }) {
  const estilo = obtenerEstiloEstado(estado)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        estilo.badge,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', estilo.dot)} />
      {estilo.label}
    </span>
  )
}
