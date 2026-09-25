'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, FolderKanban, Pause, Play, Square, Tag, UserRound } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { cn, formatFecha, formatHora } from '@/lib/utils'

function formatearTiempo(ms: number): string {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000))
  const horas = Math.floor(totalSegundos / 3600)
  const minutos = Math.floor((totalSegundos % 3600) / 60)
  const segundos = totalSegundos % 60
  const dos = (n: number) => String(n).padStart(2, '0')
  if (horas > 0) return `${horas}:${dos(minutos)}:${dos(segundos)}`
  return `${dos(minutos)}:${dos(segundos)}`
}

export function ActivityCard() {
  const { actividadActual, pausarActividad, reanudarActividad, finalizarActividad, tiempoPausaMs } =
    useActividad()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!actividadActual) return
    const id = window.setInterval(() => setTick((v) => v + 1), 1000)
    return () => window.clearInterval(id)
  }, [actividadActual])

  if (!actividadActual) return null
  if (actividadActual.estado !== 'EN_CURSO' && actividadActual.estado !== 'PAUSADA') return null

  const pausada = actividadActual.estado === 'PAUSADA'
  const enCurso = actividadActual.estado === 'EN_CURSO'
  void tick

  const tiempoTranscurrido = (() => {
    if (!actividadActual) return 0
    if (pausada && tiempoPausaMs != null) return tiempoPausaMs
    const inicioMs = new Date(actividadActual.inicio).getTime()
    const ahoraMs = enCurso ? Date.now() : inicioMs
    const finMs = actividadActual.fin ? new Date(actividadActual.fin).getTime() : ahoraMs
    const totalBruto = Math.max(0, finMs - inicioMs)
    return Math.max(0, totalBruto - (actividadActual.pausa_acumulada_segundos || 0) * 1000)
  })()

  const campos = [
    { etiqueta: 'Cargo', valor: actividadActual.cargo || '—', icono: <UserRound size={14} /> },
    { etiqueta: 'Tipo de actividad', valor: actividadActual.tipo_actividad_nombre || '—', icono: <Tag size={14} /> },
    { etiqueta: 'Cliente', valor: actividadActual.cliente_nombre || 'Sin cliente', icono: <UserRound size={14} /> },
    ...(actividadActual.proyecto_nombre ? [{ etiqueta: 'Proyecto', valor: actividadActual.proyecto_nombre, icono: <FolderKanban size={14} /> }] : []),
    { etiqueta: 'Fecha', valor: formatFecha(actividadActual.inicio), icono: <CalendarDays size={14} /> },
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-[#7c3aed]/30 bg-card shadow-xl shadow-[#7c3aed]/5">
      <div className="flex items-center justify-between border-b border-border bg-header/80 px-4 py-2.5 lg:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7c3aed]/15 text-[#c4b5fd]"><Clock3 size={18} /></div>
          <div>
          <p className="text-sm font-semibold text-foreground">Actividad en curso</p>
          <p className="text-xs text-muted-foreground">Controla el registro desde este panel</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border-r border-border pr-3" aria-label="Tiempo transcurrido">
            <Clock3 size={15} className="text-[#a78bfa]" />
            <span className="text-base font-bold tabular-nums text-[#c4b5fd]">{formatearTiempo(tiempoTranscurrido)}</span>
          </div>
          <span className={cn('flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium', pausada ? 'border-border bg-muted text-muted-foreground' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300')}>
            <span className={cn('h-1.5 w-1.5 rounded-full', pausada ? 'bg-muted-foreground' : 'animate-pulse bg-emerald-400')} />
            {pausada ? 'Pausada' : 'Activa'}
          </span>
        </div>
      </div>

      <div className="px-4 py-4 lg:px-5 lg:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[#a78bfa]">Descripción</p>
            <h3 className="text-base font-semibold leading-snug text-foreground">{actividadActual.descripcion || 'Actividad sin descripción'}</h3>
          </div>

        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {campos.map((campo) => (
            <div key={campo.etiqueta} className="min-w-0 rounded-xl border border-border/80 bg-muted/50 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{campo.icono}{campo.etiqueta}</p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">{campo.valor}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-border bg-muted/50 px-3 py-1.5">
              <p className="text-[11px] text-muted-foreground">Iniciada a las</p>
              <p className="text-sm font-bold leading-tight text-[#c4b5fd]">
                {formatHora(actividadActual.inicio)}
              </p>
            </div>
          </div>

          <div className="flex w-full gap-2 sm:w-auto">
            <button
              onClick={pausada ? reanudarActividad : pausarActividad}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors sm:flex-none',
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
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90 sm:flex-none"
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
