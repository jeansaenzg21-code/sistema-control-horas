'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { ChevronDown, ChevronRight, FolderClosed, GripVertical, MoreHorizontal, Plus } from 'lucide-react'
import type { ServicioPlan, TareaCronograma } from '@/lib/planificacion/modelo'
import { duracion, fechaCorta, hoy, indice, sumarDias } from '@/lib/planificacion/fechas'
import type { FilaPlan } from './arbol'
import { BarraActividad } from './barra-actividad'
import { COLOR_ADICIONAL } from './colores'
import styles from './editor.module.css'

export type CrearIntervalo = (servicioId: number | null, padreId: number | null, inicio: string | null, fin: string | null) => void
export const ALTO_FILA_PLAN = 44, ALTO_CABECERA_PLAN = 64
const ALTO = ALTO_FILA_PLAN, CABECERA = ALTO_CABECERA_PLAN
const SeleccionIntervalo = memo(function SeleccionIntervalo({ origen, dias, anchoDia, servicioId, padreId, onCrear, sinFecha = false }: {
  origen: string; dias: number; anchoDia: number; servicioId: number | null; padreId: number | null; onCrear: CrearIntervalo; sinFecha?: boolean
}) {
  const [intervalo, setIntervalo] = useState<[number, number] | null>(null)
  const seleccion = useRef<[number, number] | null>(null)
  return <div role="button" tabIndex={0} aria-label={sinFecha ? 'Programar actividad: selecciona un intervalo' : 'Seleccionar intervalo para crear actividad'}
    className="absolute inset-0 cursor-crosshair outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-300" style={{ touchAction: 'pan-y' }}
    onKeyDown={e => { if (e.key === 'Enter') onCrear(servicioId, padreId, origen, origen) }}
    onPointerDown={e => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const dia = Math.max(0, Math.min(dias - 1, Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / anchoDia)))
      seleccion.current = [dia, dia]; setIntervalo([dia, dia])
    }}
    onPointerMove={e => {
      if (!seleccion.current) return
      const dia = Math.max(0, Math.min(dias - 1, Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / anchoDia)))
      seleccion.current = [seleccion.current[0], dia]; setIntervalo(seleccion.current)
    }}
    onPointerUp={() => {
      if (!seleccion.current) return
      const [a, b] = seleccion.current; seleccion.current = null; setIntervalo(null)
      onCrear(servicioId, padreId, sumarDias(origen, Math.min(a, b)), sumarDias(origen, Math.max(a, b)))
    }} onPointerCancel={() => { seleccion.current = null; setIntervalo(null) }}>
    {intervalo ? <div className="absolute top-2 h-7 rounded border border-violet-300 bg-violet-500/30" style={{ left: Math.min(...intervalo) * anchoDia, width: (Math.abs(intervalo[1] - intervalo[0]) + 1) * anchoDia }}>
      <span className="absolute left-1 top-1 whitespace-nowrap text-[10px] text-violet-100">{fechaCorta(sumarDias(origen, Math.min(...intervalo)))} → {fechaCorta(sumarDias(origen, Math.max(...intervalo)))}</span>
    </div> : <span className="pointer-events-none absolute left-3 top-3 text-[10px] text-violet-300/40">{sinFecha ? 'Selecciona los días para programar →' : '+ Arrastra sobre los días para crear'}</span>}
  </div>
})

export function LienzoGantt({ filas, colores, cerrados, origen, finExclusivo, foco, anchoDia: escalaDia, seleccionado, editable, scrollRef, onToggle, onSeleccionar, onCambiar, onCrear, onRenombrar, onMoverFila, onMenu, serviciosEliminables = new Set<number>(), onMenuServicio }: {
  colores: Map<number, string>
  filas: FilaPlan[]; cerrados: Set<string>; origen: string; finExclusivo: string; foco: { fecha: string; clave: number } | null; anchoDia: number; seleccionado: number | null; editable: boolean
  scrollRef: RefObject<HTMLDivElement | null>; onToggle: (clave: string) => void
  onSeleccionar: (id: number) => void; onCambiar: (id: number, cambio: { fechaInicio: string; fechaFin: string }) => void
  onCrear: CrearIntervalo; onRenombrar: (t: TareaCronograma, nombre: string) => void
  onMoverFila: (id: number, destino: FilaPlan) => void
  onMenu: (t: TareaCronograma, x: number, y: number) => void
  serviciosEliminables?: Set<number>
  onMenuServicio?: (servicio: ServicioPlan, x: number, y: number) => void
}) {
  const [anchoPanel, setAnchoPanel] = useState(350)
  const [scrollTop, setScrollTop] = useState(0)
  const [drop, setDrop] = useState<string | null>(null)
  const [renombrando, setRenombrando] = useState<number | null>(null)
  const arrastrada = useRef<number | null>(null)
  const [anchoViewport, setAnchoViewport] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const medir = () => setAnchoViewport(el.clientWidth)
    const observer = new ResizeObserver(medir)
    observer.observe(el); medir()
    return () => observer.disconnect()
  }, [scrollRef])
  const dias = indice(finExclusivo) - indice(origen)
  const anchoDia = Math.max(escalaDia, Math.max(0, anchoViewport - anchoPanel) / dias)
  useEffect(() => {
    // Al contraer grupos el contenido se acorta: sincroniza el scroll real con
    // el estado para que la virtualización y la barra no queden desfasadas.
    const el = scrollRef.current
    if (!el) return
    const maximo = Math.max(0, el.scrollHeight - el.clientHeight)
    if (el.scrollTop > maximo) { el.scrollTop = maximo; setScrollTop(maximo) }
  }, [filas.length, scrollRef])
  useEffect(() => {
    if (foco && scrollRef.current) scrollRef.current.scrollTo({ left: Math.max(0, (indice(foco.fecha) - indice(origen)) * anchoDia - 30), behavior: 'smooth' })
  }, [foco, origen, anchoDia, scrollRef])
  const ancho = dias * anchoDia
  const altura = filas.length * ALTO
  const principio = Math.min(Math.max(0, filas.length - 30), Math.max(0, Math.floor((scrollTop - CABECERA) / ALTO) - 10))
  const visibles = filas.slice(principio, principio + 40)
  const indiceHoy = indice(hoy()) - indice(origen)
  const mesesCabecera = useMemo(() => {
    const grupos: { inicio: number; dias: number; texto: string }[] = []
    for (let d = 0; d < dias; d++) {
      const fecha = sumarDias(origen, d)
      if (d === 0 || fecha.slice(8) === '01') grupos.push({ inicio: d, dias: 1, texto: new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${fecha}T00:00:00Z`)) })
      else grupos[grupos.length - 1].dias++
    }
    return grupos
  }, [origen, dias])
  const conexiones = useMemo(() => {
    const posiciones = new Map(filas.flatMap((f, i) => f.tipo === 'tarea' ? [[f.tarea.id, { tarea: f.tarea, y: i * ALTO + 22 }] as const] : []))
    const paths: { key: string; d: string; advertencia: boolean }[] = []
    for (const { tarea, y } of posiciones.values()) for (const id of tarea.dependencias) {
      const padre = posiciones.get(id)
      if (!padre?.tarea.fechaFin || !tarea.fechaInicio) continue
      if ((y < scrollTop - 100 && padre.y < scrollTop - 100) || (y > scrollTop + 850 && padre.y > scrollTop + 850)) continue
      const x1 = (indice(padre.tarea.fechaFin) - indice(origen) + 1) * anchoDia
      const x2 = (indice(tarea.fechaInicio) - indice(origen)) * anchoDia
      const medio = x2 > x1 + 15 ? x1 + (x2 - x1) / 2 : Math.max(x1, x2) + 12
      paths.push({ key: `${id}-${tarea.id}`, d: `M ${x1} ${padre.y} H ${medio} V ${y - 17} H ${x2 - 7} V ${y} H ${x2}`, advertencia: tarea.fechaInicio <= padre.tarea.fechaFin })
    }
    return paths
  }, [filas, origen, anchoDia, scrollTop])
  return <div ref={scrollRef} data-plan-scroll className={styles.scroll} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
    <div style={{ width: anchoPanel + ancho }}>
      <div className="sticky top-0 z-30 flex border-b border-white/10 bg-[#1c1825]" style={{ height: CABECERA }}>
        <div className="sticky left-0 z-40 flex shrink-0 items-center gap-2 border-r border-white/10 bg-[#211b2c] px-4 text-[11px]" style={{ width: anchoPanel }}>
          <span className="flex-1 text-[#cbc1dd]">Actividad / Servicio</span><span className="w-12 text-center text-[#958aa8]">Días</span><span className="w-12 text-center text-[#958aa8]">Avance</span>
          <div role="separator" tabIndex={0} aria-label="Ancho del panel de actividades" aria-orientation="vertical" aria-valuenow={anchoPanel} aria-valuemin={270} aria-valuemax={550}
            className="absolute inset-y-0 -right-1 z-50 w-2 cursor-col-resize hover:bg-violet-400/40"
            onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setAnchoPanel(w => Math.max(270, Math.min(550, w + (e.key === 'ArrowRight' ? 10 : -10)))) } }}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId) }}
            onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setAnchoPanel(Math.max(270, Math.min(550, e.clientX - scrollRef.current!.getBoundingClientRect().left))) }} />
        </div>
        <div className="relative shrink-0" style={{ width: ancho }}>
          {mesesCabecera.map(m => {
            const anchoMes = m.dias * anchoDia
            return <div key={m.inicio} className="pointer-events-none absolute top-0 flex h-8 items-center justify-center border-b border-r border-white/[.06] px-2 text-center text-[11px] font-medium text-violet-100" style={{ left: m.inicio * anchoDia, width: anchoMes }}>
              <span data-plan-mes title={m.texto} className="pointer-events-auto whitespace-nowrap first-letter:uppercase">{m.texto}</span>
            </div>
          })}
          {Array.from({ length: Math.ceil(dias / (anchoDia < 15 ? 5 : 1)) }, (_, i) => {
            const paso = anchoDia < 15 ? 5 : 1, d = i * paso, iso = sumarDias(origen, d)
            return <span key={d} title={iso} className={`absolute bottom-0 flex h-8 items-center justify-center text-[10px] ${iso === hoy() ? 'bg-rose-500/20 text-rose-200' : 'text-[#9d93af]'}`} style={{ left: d * anchoDia, width: anchoDia }}>{Number(iso.slice(8))}</span>
          })}
        </div>
      </div>
      <div className="relative" style={{ height: altura, backgroundImage: 'linear-gradient(to right,rgba(191,175,220,.055) 1px,transparent 1px)', backgroundSize: `${anchoDia * (anchoDia < 15 ? 7 : 1)}px 100%`, backgroundPositionX: anchoPanel }}>
        {mesesCabecera.map(m => <div key={m.inicio} aria-hidden className="pointer-events-none absolute inset-y-0 border-l border-white/[.08]" style={{ left: anchoPanel + m.inicio * anchoDia }} />)}
        {indiceHoy >= 0 && indiceHoy < dias && <div aria-label={`Fecha actual: ${hoy()}`} className="pointer-events-none absolute inset-y-0 z-[5] border-l border-dashed border-red-400/90" style={{ left: anchoPanel + (indiceHoy + .5) * anchoDia }}>
          <span className="sticky top-16 -ml-3 rounded bg-red-500 px-1 py-0.5 text-[9px] font-semibold text-white">Hoy</span>
        </div>}
        <svg aria-hidden className="pointer-events-none absolute top-0 z-[4] overflow-hidden" style={{ left: anchoPanel, width: ancho, height: altura }}>
          <defs><marker id="flecha-plan" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5" fill="#b8a6d4" /></marker></defs>
          {conexiones.map(c => <path key={c.key} d={c.d} stroke={c.advertencia ? '#d6b577' : '#b8a6d4'} strokeWidth="1.2" fill="none" opacity=".65" markerEnd="url(#flecha-plan)" />)}
        </svg>
        <div style={{ paddingTop: principio * ALTO }}>
          {visibles.map(fila => {
            const tarea = fila.tipo === 'tarea' ? fila.tarea : null
            const nombre = tarea?.nombre ?? (fila.tipo === 'servicio' ? fila.nombre : '')
            const agrupada = fila.tipo === 'servicio'
            const puedeContraer = agrupada || (fila.tipo === 'tarea' && fila.hijos)
            const grupoTareas = fila.tipo === 'servicio' ? fila.tareas : []
            const programadas = grupoTareas.filter(t => t.fechaInicio && t.fechaFin)
            const inicio = programadas.length ? programadas.reduce((m, t) => t.fechaInicio! < m ? t.fechaInicio! : m, programadas[0].fechaInicio!) : null
            const fin = programadas.length ? programadas.reduce((m, t) => t.fechaFin! > m ? t.fechaFin! : m, programadas[0].fechaFin!) : null
            const progreso = tarea?.progreso ?? (grupoTareas.length ? Math.round(grupoTareas.reduce((s, t) => s + t.progreso, 0) / grupoTareas.length) : 0)
            const servicioId = tarea?.servicioId ?? (fila.tipo === 'servicio' ? fila.servicio?.id : null)
            const tono = servicioId == null ? COLOR_ADICIONAL : colores.get(servicioId) ?? COLOR_ADICIONAL
            return <div key={fila.clave} className={`${styles.fila} ${agrupada ? styles.grupo : ''} ${tarea?.id === seleccionado ? styles.seleccionada : ''} ${drop === fila.clave ? styles.drop : ''}`}
              onDragOver={e => { if (editable && arrastrada.current !== null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDrop(fila.clave) } }}
              onDrop={e => { e.preventDefault(); const id = arrastrada.current; arrastrada.current = null; setDrop(null); if (id !== null) onMoverFila(id, fila) }}
              onContextMenu={e => {
                if (tarea) { e.preventDefault(); onMenu(tarea, e.clientX, e.clientY) }
                else if (onMenuServicio && fila.tipo === 'servicio' && fila.servicio && serviciosEliminables.has(fila.servicio.id)) {
                  e.preventDefault(); onMenuServicio(fila.servicio, e.clientX, e.clientY)
                }
              }}>
              <div className={styles.izquierda} style={{ width: anchoPanel, paddingLeft: 10 + Math.min(fila.profundidad, 6) * 12,
                ...(agrupada ? { background: `linear-gradient(90deg,${tono}20,#191620)` } : {}),
                ...(tarea?.id === seleccionado ? { background: `linear-gradient(90deg,${tono}40,#251e31)`, boxShadow: `inset 3px 0 ${tono}` } : {}),
              }}>
                {tarea && editable && <span draggable role="button" tabIndex={0} title="Arrastra para reordenar; usa el inspector para cambiar de padre" aria-label={`Reordenar ${nombre}`} className="cursor-grab text-[#8d7ba6] active:cursor-grabbing"
                  onKeyDown={e => { if (e.key === 'Enter') onSeleccionar(tarea.id) }}
                  onDragStart={e => { arrastrada.current = tarea.id; e.dataTransfer.setData('text/plain', String(tarea.id)); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { arrastrada.current = null; setDrop(null) }}><GripVertical size={13} /></span>}
                {puedeContraer ? <button className="shrink-0 text-[#b09aca]" aria-expanded={!cerrados.has(fila.clave)} aria-label={`${cerrados.has(fila.clave) ? 'Expandir' : 'Contraer'} ${nombre}`} onClick={() => onToggle(fila.clave)}>{cerrados.has(fila.clave) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button> : <span className="w-3 shrink-0" />}
                {agrupada && <FolderClosed size={15} className="shrink-0" style={{ color: tono }} />}
                {tarea && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tono }} />}
                {renombrando === tarea?.id ? <input autoFocus aria-label="Renombrar actividad" className="min-w-0 flex-1 rounded border border-violet-400/50 bg-[#30253f] px-1 py-1 text-xs outline-none" defaultValue={nombre} maxLength={200}
                  onBlur={e => { const valor = e.target.value.trim(); setRenombrando(null); if (tarea && valor.length >= 2 && valor !== tarea.nombre) onRenombrar(tarea, valor) }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = nombre; e.currentTarget.blur() } }} /> : <button title={nombre} className={`min-w-0 flex-1 truncate text-left text-[11px] ${tarea?.estado === 'COMPLETADA' ? 'text-[#aaa1b9] line-through' : ''}`}
                    onClick={() => tarea ? onSeleccionar(tarea.id) : onToggle(fila.clave)} onDoubleClick={() => { if (tarea && editable) setRenombrando(tarea.id) }}>{nombre}</button>}
                {agrupada && editable && <button title={`Añadir actividad en ${nombre}`} aria-label={`Añadir actividad en ${nombre}`} className="text-violet-300" onClick={() => onCrear(fila.tipo === 'servicio' ? fila.servicio?.id ?? null : null, null, null, null)}><Plus size={13} /></button>}
                <span className="w-10 shrink-0 text-center text-[10px] tabular-nums text-[#a79ab9]">{duracion(tarea?.fechaInicio ?? inicio, tarea?.fechaFin ?? fin) || '—'}</span>
                <span className={`w-10 shrink-0 rounded-md py-0.5 text-center text-[10px] tabular-nums ${progreso === 100 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-violet-300/10 text-violet-200'}`}>{progreso}%</span>
                {tarea && <button aria-label={`Acciones de ${nombre}`} className="shrink-0 text-[#9c8ab4]" onClick={e => onMenu(tarea, e.clientX, e.clientY)}><MoreHorizontal size={14} /></button>}
              </div>
              <div className={styles.celda} style={{ width: ancho }}>
                {agrupada && inicio && fin && <span className="pointer-events-none absolute top-[18px] h-2 rounded-full" style={{ backgroundColor: `${tono}b3`, left: Math.max(0, (indice(inicio) - indice(origen)) * anchoDia), width: Math.max(0, Math.min(ancho, (indice(fin) - indice(origen) + 1) * anchoDia) - Math.max(0, (indice(inicio) - indice(origen)) * anchoDia)) }} />}
                {editable && (agrupada || !tarea?.fechaInicio) && <SeleccionIntervalo origen={origen} dias={dias} anchoDia={anchoDia} servicioId={tarea?.servicioId ?? (fila.tipo === 'servicio' ? fila.servicio?.id ?? null : null)} padreId={null}
                  sinFecha={!!tarea} onCrear={tarea ? (_s, _p, a, b) => { if (a && b) onCambiar(tarea.id, { fechaInicio: a, fechaFin: b }) } : onCrear} />}
                {tarea && <BarraActividad tarea={tarea} tono={tono} origen={origen} anchoDia={anchoDia} seleccionada={seleccionado === tarea.id} editable={editable} onSeleccionar={onSeleccionar} onCambiar={onCambiar} />}
                {tarea?.fechaInicio && (tarea.fechaInicio < origen || tarea.fechaFin! >= finExclusivo) && <span className="pointer-events-none absolute left-2 top-1 text-[9px] text-amber-200/70">Fuera del período · selecciona y usa «Ver actividad»</span>}
              </div>
            </div>
          })}
        </div>
      </div>
    </div>
  </div>
}
