'use client'

import { Pause, Play, Square } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { obtenerEstiloEstado } from '@/lib/estado'
import { cn } from '@/lib/utils'

export function ActivityCard() {
  const { actividadActual, pausarActividad, reanudarActividad, finalizarActividad } =
    useActividad()

  if (!actividadActual) return null

  const pausada = actividadActual.estado === 'pausada'
  const estado = obtenerEstiloEstado(actividadActual.estado)

  const campos = [
    { etiqueta: 'Especialidad', valor: actividadActual.especialidad },
    { etiqueta: 'Tipo', valor: actividadActual.tipo },
    { etiqueta: 'Fecha', valor: actividadActual.fecha },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-[#7c3aed]/30 bg-card">
      <div className="flex items-center gap-3 border-b border-border bg-header px-5 py-3">
        <span className={cn('h-2.5 w-2.5 rounded-full', pausada ? 'bg-[#6b7280]' : 'bg-[#a78bfa] animate-pulse')} />
        <div>
          <p className="text-sm font-semibold text-foreground">Actividad en curso</p>
          <p className="text-xs text-muted-foreground">
            La duración se mostrará al finalizar la actividad
          </p>
        </div>
      </div>

      <div className="px-5 py-4">
        <h3 className="text-base font-semibold text-foreground">{actividadActual.titulo}</h3>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {campos.map((campo) => (
            <div key={campo.etiqueta} className="rounded-lg border border-border bg-muted px-3 py-2">
              <p className="text-xs text-muted-foreground">{campo.etiqueta}</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">{campo.valor}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#7c3aed]/10 px-3 py-1.5">
              <p className="text-[11px] text-muted-foreground">Iniciada a las</p>
              <p className="text-lg font-bold leading-tight text-[#c4b5fd]">
                {actividadActual.horaInicio}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <span className={cn('h-2 w-2 rounded-full', estado.dot)} />
              <span className={cn('font-medium', estado.text)}>{estado.label}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={pausada ? reanudarActividad : pausarActividad}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                pausada
                  ? 'border-[#7c3aed]/40 bg-[#7c3aed]/15 text-[#c4b5fd] hover:bg-[#7c3aed]/25'
                  : 'border-border bg-muted text-foreground hover:border-[#7c3aed]/40',
              )}
            >
              {pausada ? <Play size={15} /> : <Pause size={15} />}
              {pausada ? 'Reanudar' : 'Pausar'}
            </button>
            <button
              onClick={finalizarActividad}
              className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
            >
              <Square size={14} />
              Finalizar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}