'use client'

import { Bell } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { cn } from '@/lib/utils'

const opciones = [
  { minutos: 15, etiqueta: 'Cada 15 minutos' },
  { minutos: 30, etiqueta: 'Cada 30 minutos' },
]

export function SettingsAlerts() {
  const { alertasCada, configurarAlertas } = useActividad()

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7c3aed]/15">
          <Bell size={17} className="text-[#c4b5fd]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Recordatorios de actividad</h2>
          <p className="text-xs text-muted-foreground">
            Te avisaremos mientras tengas una actividad en curso.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {opciones.map((opcion) => (
          <button
            key={opcion.minutos}
            onClick={() => configurarAlertas(opcion.minutos)}
            className={cn(
              'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              alertasCada === opcion.minutos
                ? 'border-[#7c3aed]/50 bg-[#7c3aed]/15 text-[#c4b5fd]'
                : 'border-border bg-muted text-foreground hover:border-[#7c3aed]/40',
            )}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )
}