'use client'

import { memo, useRef, useState } from 'react'
import type { TareaCronograma } from '@/lib/planificacion/modelo'
import { fechaCorta, indice, moverIntervalo } from '@/lib/planificacion/fechas'
import { COLOR_COMPLETADA } from './colores'

type Props = {
  tarea: TareaCronograma; origen: string; anchoDia: number; seleccionada: boolean; editable: boolean
  tono: string
  onSeleccionar: (id: number) => void
  onCambiar: (id: number, cambio: { fechaInicio: string; fechaFin: string }) => void
}
export const BarraActividad = memo(function BarraActividad({ tarea, origen, anchoDia, seleccionada, editable, tono, onSeleccionar, onCambiar }: Props) {
  const [preview, setPreview] = useState<{ fechaInicio: string; fechaFin: string } | null>(null)
  const drag = useRef<{ x: number; scroll: number; modo: 'mover' | 'inicio' | 'fin'; scrollEl: HTMLElement; cambio: { fechaInicio: string; fechaFin: string }; movido: boolean } | null>(null)
  if (!tarea.fechaInicio || !tarea.fechaFin) return null
  const inicio = preview?.fechaInicio ?? tarea.fechaInicio, fin = preview?.fechaFin ?? tarea.fechaFin
  const left = (indice(inicio) - indice(origen)) * anchoDia + 2
  const width = Math.max(12, (indice(fin) - indice(inicio) + 1) * anchoDia - 4)
  const color = tarea.estado === 'COMPLETADA' ? COLOR_COMPLETADA : tono
  const fondo = tarea.estado === 'PENDIENTE' ? `${color}40` : tarea.estado === 'PLANIFICADA' ? `${color}95` : `${color}d9`
  return <div className="absolute inset-y-0" style={{ left, width }}>
    {preview && <div className="pointer-events-none absolute bottom-[34px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-violet-400/40 bg-[#251d35] px-2 py-1 text-[10px] text-white shadow-xl">{fechaCorta(inicio)} → {fechaCorta(fin)}</div>}
    <div role="button" tabIndex={0} aria-label={`${tarea.nombre}, ${fechaCorta(inicio)} a ${fechaCorta(fin)}. Enter para editar; flechas para mover un día.`}
      title={`${tarea.nombre} · ${inicio} — ${fin}`}
      className={`absolute top-[9px] flex h-[26px] w-full items-center rounded-md shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-white ${seleccionada || preview ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-[#17141f]' : 'hover:ring-1 hover:ring-white/50'} ${editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      style={{ touchAction: 'none', userSelect: 'none', backgroundColor: fondo, border: `1px solid ${color}b3` }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeleccionar(tarea.id) }
        if (editable && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); onCambiar(tarea.id, moverIntervalo(tarea.fechaInicio!, tarea.fechaFin!, e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey ? 'fin' : 'mover')) }
      }}
      onPointerDown={e => {
        e.stopPropagation()
        onSeleccionar(tarea.id)
        if (!editable || e.button !== 0) return
        const scrollEl = e.currentTarget.closest('[data-plan-scroll]') as HTMLElement
        const modo = (e.target as HTMLElement).dataset.extremo as 'inicio' | 'fin' | undefined
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, scroll: scrollEl.scrollLeft, scrollEl, modo: modo ?? 'mover', cambio: { fechaInicio: tarea.fechaInicio!, fechaFin: tarea.fechaFin! }, movido: false }
      }}
      onPointerMove={e => {
        const d = drag.current
        if (!d) return
        const rect = d.scrollEl.getBoundingClientRect()
        if (e.clientX > rect.right - 40) d.scrollEl.scrollLeft += 18
        if (e.clientX < rect.left + 40) d.scrollEl.scrollLeft -= 18
        const delta = Math.round((e.clientX - d.x + d.scrollEl.scrollLeft - d.scroll) / anchoDia)
        d.movido = d.movido || Math.abs(e.clientX - d.x) > 3
        d.cambio = moverIntervalo(tarea.fechaInicio!, tarea.fechaFin!, delta, d.modo)
        setPreview(d.cambio)
      }}
      onPointerUp={e => {
        e.stopPropagation()
        const d = drag.current; drag.current = null; setPreview(null)
        if (d?.movido && (d.cambio.fechaInicio !== tarea.fechaInicio || d.cambio.fechaFin !== tarea.fechaFin)) onCambiar(tarea.id, d.cambio)
      }}
      onPointerCancel={() => { drag.current = null; setPreview(null) }}>
      <span className="pointer-events-none absolute inset-y-0 left-0 rounded-md bg-white/15" style={{ width: `${tarea.progreso}%` }} />
      {editable && <span data-extremo="inicio" title="Arrastra para cambiar el inicio" className="absolute inset-y-0 left-0 z-10 w-2.5 cursor-ew-resize rounded-l-md border-l-2 border-white/40 hover:bg-white/30" />}
      <span className="pointer-events-none relative truncate px-3 text-[10px] font-medium text-white">{width > 70 ? tarea.nombre : tarea.progreso === 100 ? '✓' : ''}</span>
      {editable && <span data-extremo="fin" title="Arrastra para cambiar el fin" className="absolute inset-y-0 right-0 z-10 w-2.5 cursor-ew-resize rounded-r-md border-r-2 border-white/40 hover:bg-white/30" />}
    </div>
  </div>
})
