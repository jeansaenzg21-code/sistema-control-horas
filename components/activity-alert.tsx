'use client'

import { X, CalendarClock } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'

export function ActivityAlert() {
  const { alertaVisible, continuarActividad, finalizarActividad, actividadActual } =
    useActividad()
  const { usuario } = useAuth()

  if (usuario?.rol === 'admin') return null
  if (!alertaVisible || !actividadActual) return null

  return (
    <div className="no-print fixed bottom-24 left-1/2 z-[60] w-[22rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-in slide-in-from-bottom-4">
      <div className="overflow-hidden rounded-2xl border border-[#7c3aed]/30 bg-card shadow-2xl shadow-black/50">
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-[#7c3aed] to-transparent" />

        <div className="px-4 pt-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7c3aed]/15">
                <CalendarClock size={18} className="text-[#c4b5fd]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">¿Sigues trabajando?</h3>
                <p className="text-xs text-muted-foreground">Confirma si continúas con esta actividad</p>
              </div>
            </div>
            <button
              onClick={continuarActividad}
              aria-label="Cerrar"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="rounded-lg border border-border bg-muted px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Actividad</p>
            <p className="text-sm font-medium text-foreground">{actividadActual.titulo}</p>
          </div>
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={continuarActividad}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-[#7c3aed]/40"
          >
            Continuar
          </button>
          <button
            onClick={finalizarActividad}
            className="flex-1 rounded-lg bg-[#7c3aed] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
          >
            Finalizar
          </button>
        </div>
      </div>
    </div>
  )
}