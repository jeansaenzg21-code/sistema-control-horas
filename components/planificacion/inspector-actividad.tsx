'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Copy, CornerDownRight, Eye, Link2, Trash2, X } from 'lucide-react'
import type { ResponsablePlan, ServicioPlan, TareaCronograma } from '@/lib/planificacion/modelo'
import { descendientes } from '@/lib/planificacion/modelo'
import { duracion, estadoPlanificado, hoy, progresoPlanificado, sumarDias } from '@/lib/planificacion/fechas'
import { esquemaEditarPlan } from '@/lib/planificacion/validacion'
import { cuerpoTarea } from './use-editor-plan'
import styles from './editor.module.css'

const ETIQUETA_ESTADO: Record<TareaCronograma['estado'], string> = { PENDIENTE: 'Pendiente', PLANIFICADA: 'Planificada', EN_CURSO: 'En curso', COMPLETADA: 'Completada' }

export function InspectorActividad({ tarea, tono, tareas, servicios, responsables, editable, ocupado, onGuardar, onCerrar, onVer, onDuplicar, onSubactividad, onEliminar }: {
  tono: string
  tarea: TareaCronograma; tareas: TareaCronograma[]; servicios: ServicioPlan[]; responsables: ResponsablePlan[]
  editable: boolean; ocupado: boolean; onGuardar: (t: TareaCronograma) => void
  onCerrar: () => void; onVer: () => void; onDuplicar: () => void; onSubactividad: () => void; onEliminar: () => void
}) {
  const [borrador, setBorrador] = useState(tarea)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setBorrador(tarea); setError(null) }, [tarea])
  const excluidos = descendientes(tareas, tarea.id); excluidos.add(tarea.id)
  const guardar = (nuevo = borrador) => {
    if (!editable || ocupado || JSON.stringify(nuevo) === JSON.stringify(tarea)) return
    const valido = esquemaEditarPlan.safeParse(cuerpoTarea(nuevo))
    if (!valido.success) { setError(valido.error.issues[0].message); return }
    if ((nuevo.fechaInicio === null) !== (nuevo.fechaFin === null) || (nuevo.fechaInicio && nuevo.fechaFin && nuevo.fechaFin < nuevo.fechaInicio)) {
      setError('Revisa el intervalo de fechas.'); return
    }
    setError(null); onGuardar(nuevo)
  }
  const inmediato = (cambio: Partial<TareaCronograma>) => { const nuevo = { ...borrador, ...cambio }; setBorrador(nuevo); guardar(nuevo) }
  const input = styles.input
  const progreso = progresoPlanificado(borrador.fechaInicio, borrador.fechaFin)
  const estado = estadoPlanificado(borrador.fechaInicio, borrador.fechaFin)
  return <aside className={styles.inspector} aria-label="Inspector de actividad">
    <div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-violet-100"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tono }} />Actividad</h4>
      <button className={styles.icono} onClick={onCerrar} aria-label="Cerrar inspector"><X size={16} /></button>
    </div>
    <div className="space-y-4 p-5">
      <fieldset disabled={!editable || ocupado} className="space-y-4 disabled:opacity-70">
        <label className={styles.campo}>Nombre
          <input className={`${input} font-semibold`} value={borrador.nombre} maxLength={200} onChange={e => setBorrador({ ...borrador, nombre: e.target.value })} onBlur={() => guardar()} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        </label>
        <label className={styles.campo}>Servicio
          <select className={input} value={borrador.servicioId ?? ''} onChange={e => inmediato({ servicioId: e.target.value ? Number(e.target.value) : null, padreId: null })}>
            <option value="">Actividades adicionales</option>
            {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        <label className={styles.campo}>Actividad padre
          <select className={input} value={borrador.padreId ?? ''} onChange={e => inmediato({ padreId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Actividad principal</option>
            {tareas.filter(t => !excluidos.has(t.id) && t.servicioId === borrador.servicioId).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
        {!borrador.fechaInicio ? <button className={`${styles.boton} w-full justify-center`} onClick={() => inmediato({ fechaInicio: hoy(), fechaFin: hoy(), estado: 'PLANIFICADA' })}><CalendarDays size={14} /> Programar desde hoy</button> : <>
          <div className="grid grid-cols-2 gap-2">
            <label className={styles.campo}>Inicio<input className={input} type="date" value={borrador.fechaInicio} onChange={e => {
              if (!e.target.value) return
              inmediato({ fechaInicio: e.target.value, fechaFin: sumarDias(e.target.value, Math.max(0, duracion(borrador.fechaInicio, borrador.fechaFin) - 1)) })
            }} /></label>
            <label className={styles.campo}>Fin<input className={input} type="date" min={borrador.fechaInicio} value={borrador.fechaFin ?? ''} onChange={e => { if (e.target.value) inmediato({ fechaFin: e.target.value }) }} /></label>
          </div>
          <label className={styles.campo}>Duración · días calendario
            <input className={input} type="number" min={1} max={3650} value={duracion(borrador.fechaInicio, borrador.fechaFin)} onChange={e => {
              const n = Number(e.target.value); if (n >= 1 && n <= 3650) setBorrador({ ...borrador, fechaFin: sumarDias(borrador.fechaInicio!, n - 1) })
            }} onBlur={() => guardar()} />
          </label>
          <button className="text-[11px] text-violet-300 hover:text-violet-100" onClick={() => inmediato({ fechaInicio: null, fechaFin: null })}>Dejar sin programar</button>
        </>}
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#a99dbb]">Avance automático</span>
            <span className="flex items-center gap-2"><span className="rounded-md bg-violet-300/10 px-1.5 py-0.5 text-violet-200">{ETIQUETA_ESTADO[estado]}</span><span className="tabular-nums text-violet-100">{progreso}%</span></span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-500" style={{ width: `${progreso}%` }} /></div>
          <p className="mt-2 text-[10px] leading-relaxed text-[#8c879d]">Se calcula con las fechas planificadas: avanza de forma proporcional desde el inicio y llega al 100% al terminar. Las actividades con fechas pasadas se consideran completadas.</p>
        </div>
        <label className={styles.campo}>Responsable<select className={input} value={borrador.responsableId ?? ''} onChange={e => inmediato({ responsableId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Sin asignar</option>{responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select></label>
        <label className={styles.campo}>Horas planificadas<input className={input} type="number" min={0} max={100000} step={0.5} value={borrador.horas} onChange={e => setBorrador({ ...borrador, horas: Number(e.target.value) })} onBlur={() => guardar()} /></label>
        {borrador.fechaInicio && <button className={`${styles.boton} w-full justify-center`} onClick={onVer}><Eye size={14} /> Ubicar actividad en el calendario</button>}
        <div className={styles.campo}><span className="flex items-center gap-1"><Link2 size={12} /> Depende de</span>
          {borrador.dependencias.map(id => <span key={id} className="flex items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-500/10 px-2 py-1.5 text-violet-100">
            <span className="min-w-0 flex-1 truncate" title={tareas.find(t => t.id === id)?.nombre}>{tareas.find(t => t.id === id)?.nombre}</span>
            <button aria-label="Quitar dependencia" onClick={() => inmediato({ dependencias: borrador.dependencias.filter(d => d !== id) })}><X size={12} /></button>
          </span>)}
          <select aria-label="Añadir dependencia" className={input} value="" onChange={e => { if (e.target.value) inmediato({ dependencias: [...borrador.dependencias, Number(e.target.value)] }) }}>
            <option value="">+ Añadir dependencia</option>{tareas.filter(t => t.id !== tarea.id && !borrador.dependencias.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <p className="text-[10px] leading-relaxed text-[#8c879d]">Relación fin → inicio. Las fechas no se desplazan automáticamente.</p>
        </div>
        <label className={styles.campo}>Descripción<textarea className={`${input} min-h-24 resize-y`} value={borrador.notas ?? ''} maxLength={500} onChange={e => setBorrador({ ...borrador, notas: e.target.value || null })} onBlur={() => guardar()} placeholder="Contexto, entregables o notas…" /></label>
        {borrador.etapa && <p className="text-[10px] text-[#8c879d]">Etapa de origen: {borrador.etapa}</p>}
      </fieldset>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {editable && <div className="flex flex-wrap gap-2 border-t border-white/[.07] pt-4">
        <button className={styles.boton} disabled={ocupado} onClick={onSubactividad}><CornerDownRight size={14} /> Subactividad</button>
        <button className={styles.icono} disabled={ocupado} onClick={onDuplicar} title="Duplicar actividad" aria-label="Duplicar actividad"><Copy size={15} /></button>
        <button className={`${styles.icono} text-rose-300`} disabled={ocupado} onClick={onEliminar} title="Eliminar actividad" aria-label="Eliminar actividad"><Trash2 size={15} /></button>
      </div>}
      <p className="text-[10px] leading-relaxed text-[#8c879d]">Los campos se guardan al terminar de editarlos. La planificación no registra horas trabajadas ni modifica el presupuesto.</p>
    </div>
  </aside>
}
