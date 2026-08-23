import type { EstadoActividad } from './types'

interface EstadoEstilo {
  label: string
  dot: string
  text: string
  badge: string
}

export const ESTADO_ACTIVIDAD: Record<EstadoActividad, EstadoEstilo> = {
  EN_CURSO: {
    label: 'En curso',
    dot: 'bg-[#a78bfa]',
    text: 'text-[#a78bfa]',
    badge: 'bg-[#7c3aed]/15 text-[#c4b5fd] border border-[#7c3aed]/25',
  },
  PAUSADA: {
    label: 'Pausada',
    dot: 'bg-[#6b7280]',
    text: 'text-[#9ca3af]',
    badge: 'bg-[#6b7280]/15 text-[#cbd5e1] border border-[#6b7280]/25',
  },
  PENDIENTE_APROBACION: {
    label: 'Pendiente de aprobación',
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    badge: 'bg-amber-400/10 text-amber-400 border border-amber-400/25',
  },
  APROBADA: {
    label: 'Aprobada',
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    badge: 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/25',
  },
  RECHAZADA: {
    label: 'Rechazada',
    dot: 'bg-rose-400',
    text: 'text-rose-400',
    badge: 'bg-rose-400/10 text-rose-400 border border-rose-400/25',
  },
}

export function obtenerEstiloEstado(estado: EstadoActividad): EstadoEstilo {
  return ESTADO_ACTIVIDAD[estado]
}