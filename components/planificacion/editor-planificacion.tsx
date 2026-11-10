'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarClock, CalendarDays, Check, Copy, CornerDownRight, Download, Expand, Focus, FolderClosed, Loader2, Minus, MoreHorizontal, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import type { ConfiguracionCronograma, PlanExcel, ResponsablePlan, ServicioPlan, TareaCronograma } from '@/lib/planificacion/modelo'
import { descendientes, validarGrafo } from '@/lib/planificacion/modelo'
import { duracion, estadoPlanificado, fechaCorta, hoy, progresoPlanificado, rangoCalendario, sumarMeses } from '@/lib/planificacion/fechas'
import { construirFilas, type FilaPlan } from './arbol'
import { useEditorPlan } from './use-editor-plan'
import { ALTO_CABECERA_PLAN, ALTO_FILA_PLAN, LienzoGantt, type CrearIntervalo } from './lienzo-gantt'
import { InspectorActividad } from './inspector-actividad'
import { NuevoServicio } from './nuevo-servicio'
import { coloresServicios, COLOR_ADICIONAL } from './colores'
import { ConfirmDialog } from '../ui/confirm-dialog'
import styles from './editor.module.css'

type Nueva = { servicioId: number | null; padreId: number | null; inicio: string | null; fin: string | null }
export type PropsEditor = {
  clienteId: number; clienteNombre: string; servicios: ServicioPlan[]; cronograma: TareaCronograma[]
  configuracion: ConfiguracionCronograma | null; planificacion: PlanExcel[]; responsables?: ResponsablePlan[]
  participantesServicio: ResponsablePlan[]
  puedeEditar: boolean; onActualizado: () => Promise<void> | void
  presupuestoId: number | null
}

export function EditorPlanificacion({ clienteId, clienteNombre, servicios, cronograma, configuracion, responsables = [], participantesServicio, puedeEditar, presupuestoId, onActualizado }: PropsEditor) {
  const { tareas, config, guardado, error, conflicto, ocupado, acciones } = useEditorPlan(clienteId, cronograma, configuracion)
  const [seleccionado, setSeleccionado] = useState<number | null>(null)
  const [cerrados, setCerrados] = useState(new Set<string>())
  const [escala, setEscala] = useState<'dia' | 'semana' | 'mes'>('semana')
  const [zoom, setZoom] = useState(1)
  const [origen, setOrigen] = useState(config.fechaInicio)
  const [nuevoServicio, setNuevoServicio] = useState(false)
  const [foco, setFoco] = useState<{ fecha: string; clave: number } | null>(null)
  const rango = useMemo(() => rangoCalendario(origen, config.meses, tareas), [origen, config.meses, tareas])
  const puedeQuitarMes = config.meses > 1 && rangoCalendario(origen, config.meses - 1, tareas).finExclusivo < rango.finExclusivo
  const mesesCalendario = (Number(rango.finExclusivo.slice(0, 4)) - Number(rango.inicio.slice(0, 4))) * 12 + Number(rango.finExclusivo.slice(5, 7)) - Number(rango.inicio.slice(5, 7))
  const siguienteCantidadMeses = Math.max(config.meses, (Number(rango.finExclusivo.slice(0, 4)) - Number(origen.slice(0, 4))) * 12 + Number(rango.finExclusivo.slice(5, 7)) - Number(origen.slice(5, 7))) + 1
  const [nueva, setNueva] = useState<Nueva | null>(null)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null)
  const [menuServicio, setMenuServicio] = useState<{ servicio: ServicioPlan; x: number; y: number } | null>(null)
  const [eliminar, setEliminar] = useState<TareaCronograma | null>(null)
  const [servicioAEliminar, setServicioAEliminar] = useState<ServicioPlan | null>(null)
  const [eliminandoServicio, setEliminandoServicio] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ajustes, setAjustes] = useState(false)
  const [expandido, setExpandido] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nombreRef = useRef<HTMLInputElement>(null)
  const tareasRef = useRef(tareas); tareasRef.current = tareas
  const accionesRef = useRef(acciones); accionesRef.current = acciones
  const bloqueado = ocupado || guardado === 'error'
  const editable = puedeEditar && !bloqueado
  const anchoDia = ({ dia: 44, semana: 24, mes: 11 }[escala]) * zoom
  const filas = useMemo(() => construirFilas(servicios, tareas, cerrados), [servicios, tareas, cerrados])
  const actividad = tareas.find(t => t.id === seleccionado)
  const responsablesActividad = useMemo(() => {
    // Solo se ofrecen personas del área del cliente; si la actividad ya tenía
    // asignado a alguien de otra área, se conserva para no perder la asignación.
    const ids = new Set(participantesServicio.map(r => r.id))
    const actual = actividad?.responsableId != null && !ids.has(actividad.responsableId)
      ? responsables.find(r => r.id === actividad.responsableId)
      : undefined
    return actual ? [...participantesServicio, actual] : participantesServicio
  }, [participantesServicio, responsables, actividad?.responsableId])
  const serviciosDisponibles = useMemo(() => {
    const mapa = new Map(servicios.map(s => [s.id, s]))
    for (const t of tareas) if (t.servicioId !== null && !mapa.has(t.servicioId)) mapa.set(t.servicioId, { id: t.servicioId, nombre: t.servicioNombre ?? 'Servicio anterior' })
    return [...mapa.values()]
  }, [servicios, tareas])
  const colores = useMemo(() => coloresServicios(serviciosDisponibles), [serviciosDisponibles])
  const serviciosEliminables = useMemo(() => new Set(puedeEditar && presupuestoId !== null ? servicios.map(s => s.id) : []), [puedeEditar, presupuestoId, servicios])
  const progreso = tareas.length ? Math.round(tareas.reduce((s, t) => s + t.progreso, 0) / tareas.length) : 0
  const programadas = tareas.filter(t => t.fechaInicio && t.fechaFin)
  const desde = programadas.length ? programadas.reduce((m, t) => t.fechaInicio! < m ? t.fechaInicio! : m, programadas[0].fechaInicio!) : null
  const hasta = programadas.length ? programadas.reduce((m, t) => t.fechaFin! > m ? t.fechaFin! : m, programadas[0].fechaFin!) : null
  useEffect(() => { setOrigen(config.fechaInicio) }, [config.fechaInicio])
  useEffect(() => { if (nueva) nombreRef.current?.focus() }, [nueva])
  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setMenuServicio(null); setExpandido(false); setNueva(null) } }
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [])
  useEffect(() => {
    if (!menu && !menuServicio) return
    const cerrar = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-plan-menu]')) { setMenu(null); setMenuServicio(null) } }
    document.addEventListener('click', cerrar)
    return () => document.removeEventListener('click', cerrar)
  }, [menu, menuServicio])
  const toggle = useCallback((clave: string) => setCerrados(prev => { const n = new Set(prev); if (n.has(clave)) n.delete(clave); else n.add(clave); return n }), [])
  const seleccionar = useCallback((id: number) => {
    // Termina la edición inline antes de cambiar el inspector con pointerdown.
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur()
    setSeleccionado(id)
  }, [])
  const abrirNueva = useCallback<CrearIntervalo>((servicioId, padreId, inicio, fin) => { setNueva({ servicioId, padreId, inicio, fin }); setNombreNuevo('') }, [])
  const guardar = useCallback((t: TareaCronograma, antesDe?: number | null) => {
    setAviso(null)
    try {
      // El avance y el estado son derivados: el usuario solo define el intervalo planificado.
      const tarea = { ...t, progreso: progresoPlanificado(t.fechaInicio, t.fechaFin), estado: estadoPlanificado(t.fechaInicio, t.fechaFin) }
      const hijos = descendientes(tareasRef.current, tarea.id)
      validarGrafo(tareasRef.current.map(x => x.id === tarea.id ? tarea : hijos.has(x.id) ? { ...x, servicioId: tarea.servicioId } : x))
      void accionesRef.current.editar(tarea, antesDe)
    } catch (error) { setAviso(error instanceof Error ? error.message : 'No se puede aplicar este cambio.') }
  }, [])
  const cambiarFechas = useCallback((id: number, cambio: { fechaInicio: string; fechaFin: string }) => {
    const t = tareasRef.current.find(t => t.id === id)
    if (t) guardar({ ...t, ...cambio, estado: t.estado === 'PENDIENTE' ? 'PLANIFICADA' : t.estado })
  }, [guardar])
  const crear = async () => {
    if (!nueva || !editable || nombreNuevo.trim().length < 2) return
    const t: TareaCronograma = { id: -1, nombre: nombreNuevo.trim(), servicioId: nueva.servicioId, servicioNombre: null, padreId: nueva.padreId,
      fechaInicio: nueva.inicio, fechaFin: nueva.fin, estado: nueva.inicio ? 'PLANIFICADA' : 'PENDIENTE', etapa: null,
      notas: null, horas: 0, progreso: 0, responsableId: null, dependencias: [], orden: 0, revision: 0 }
    const ids = await acciones.crear([t])
    if (ids) {
      setSeleccionado(ids[0]); setNueva(null)
      setCerrados(prev => { const n = new Set(prev); n.delete(`s-${t.servicioId ?? 'general'}`); if (t.padreId) n.delete(`t-${t.padreId}`); return n })
    }
  }
  const duplicar = async (t: TareaCronograma) => {
    const ids = await acciones.crear([{ ...t, nombre: `${t.nombre.slice(0, 190)} (copia)`, progreso: 0, estado: t.fechaInicio ? 'PLANIFICADA' : 'PENDIENTE' }])
    if (ids) setSeleccionado(ids[0])
  }
  const moverFila = useCallback((id: number, destino: FilaPlan) => {
    const t = tareasRef.current.find(t => t.id === id)
    if (!t || (destino.tipo === 'tarea' && destino.tarea.id === id)) return
    if (destino.tipo === 'servicio') guardar({ ...t, servicioId: destino.servicio?.id ?? null, padreId: null }, null)
    else guardar({ ...t, servicioId: destino.tarea.servicioId, padreId: destino.tarea.padreId }, destino.tarea.id)
  }, [guardar])
  const reordenar = (t: TareaCronograma, direccion: -1 | 1) => {
    const hermanos = tareas.filter(x => x.servicioId === t.servicioId && x.padreId === t.padreId).sort((a, b) => a.orden - b.orden || a.id - b.id)
    const i = hermanos.findIndex(x => x.id === t.id)
    if (i + direccion < 0 || i + direccion >= hermanos.length) return
    guardar(t, direccion === -1 ? hermanos[i - 1].id : hermanos[i + 2]?.id ?? null)
  }
  const abrirMenu = useCallback((t: TareaCronograma, x: number, y: number) => {
    setSeleccionado(t.id); setMenu({ id: t.id, x: Math.min(x || 100, window.innerWidth - 230), y: Math.max(8, Math.min(y || 150, window.innerHeight - 340)) })
  }, [])
  const abrirMenuServicio = useCallback((servicio: ServicioPlan, x: number, y: number) => {
    setMenuServicio({ servicio, x: Math.min(x || 100, window.innerWidth - 230), y: Math.max(8, Math.min(y || 150, window.innerHeight - 180)) })
  }, [])
  const eliminarServicio = async (servicio: ServicioPlan) => {
    if (!editable || presupuestoId === null || eliminandoServicio) return
    setEliminandoServicio(true); setAviso(null)
    try {
      const r = await fetch(`/api/clientes/${clienteId}/servicios?servicioId=${servicio.id}&presupuestoId=${presupuestoId}`, { method: 'DELETE' })
      const datos = await r.json()
      if (!r.ok) throw new Error(datos.error ?? 'No se pudo eliminar el servicio.')
      if (actividad?.servicioId === servicio.id) setSeleccionado(null)
      setServicioAEliminar(null)
      await acciones.recargar()
      await onActualizado()
    } catch (error) {
      setAviso(error instanceof Error ? error.message : 'No se pudo eliminar el servicio.')
    } finally { setEliminandoServicio(false) }
  }
  const irA = (fecha: string) => {
    if (fecha < rango.inicio || fecha >= rango.finExclusivo) setOrigen(fecha.slice(0, 7) + '-01')
    setFoco(actual => ({ fecha, clave: (actual?.clave ?? 0) + 1 }))
  }
  const exportar = () => {
    const celda = (v: unknown) => { let s = String(v ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"` }
    const datos = [['ID', 'Actividad', 'Servicio', 'Padre', 'Inicio', 'Fin', 'Duración', 'Estado', 'Avance', 'Responsable', 'Dependencias', 'Horas', 'Descripción'],
      ...tareas.map(t => [t.id, t.nombre, serviciosDisponibles.find(s => s.id === t.servicioId)?.nombre ?? 'Adicional', t.padreId, t.fechaInicio, t.fechaFin, duracion(t.fechaInicio, t.fechaFin), t.estado, t.progreso, responsables.find(r => r.id === t.responsableId)?.nombre ?? '', t.dependencias.join(', '), t.horas, t.notas])]
    const blob = new Blob(['\uFEFF', datos.map(f => f.map(celda).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `Planificacion-${clienteId}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const menuTarea = tareas.find(t => t.id === menu?.id)
  return <section className={`${styles.editor} ${expandido ? 'fixed inset-3 z-[100] flex flex-col' : ''}`} aria-label="Editor de planificación">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[.07] bg-gradient-to-r from-violet-500/[.08] to-transparent px-5 py-4">
      <div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300"><CalendarDays size={23} /></span>
        <div className="min-w-0"><h3 className="text-base font-semibold tracking-tight">Planificación del cliente</h3><p title={clienteNombre} className="mt-0.5 max-w-[340px] truncate text-xs text-[#ada3bd]">{clienteNombre}</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <div className="min-w-36"><p className="mb-1.5 text-[10px] text-[#a99dbb]">Avance del cronograma</p><div className="flex items-center gap-2"><span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-violet-500 transition-[width]" style={{ width: `${progreso}%` }} /></span><span className="text-xs tabular-nums">{progreso}%</span></div></div>
        <button className={styles.boton} onClick={exportar} disabled={!tareas.length}><Download size={14} /> Exportar CSV</button>
        <span role="status" aria-live="polite" className={`flex min-w-32 items-center gap-1.5 text-[11px] ${guardado === 'error' ? 'text-rose-300' : 'text-[#aa9aba]'}`}>
          {ocupado ? <Loader2 size={13} className="animate-spin" /> : guardado === 'error' ? <RefreshCw size={13} /> : <Check size={13} className="text-emerald-400" />}
          {ocupado ? 'Guardando cambios…' : guardado === 'error' ? 'Cambio pendiente' : 'Cambios guardados'}
        </span>
      </div>
    </header>
    <div className="flex flex-wrap items-center gap-2 border-b border-white/[.07] px-4 py-3">
      {puedeEditar && <button className={styles.primario} disabled={bloqueado} onClick={() => abrirNueva(actividad?.servicioId ?? servicios[0]?.id ?? null, null, null, null)}><Plus size={15} /> Nueva actividad</button>}
      {puedeEditar && <button className={styles.boton} disabled={bloqueado || presupuestoId === null} title={presupuestoId === null ? 'Carga un presupuesto para añadir servicios' : 'Añadir servicio con participantes y bolsa de horas'} onClick={() => setNuevoServicio(true)}><Plus size={14} /> Añadir servicio</button>}
      <button className={styles.icono} title="Período anterior" aria-label="Período anterior" onClick={() => { const fecha = sumarMeses(foco?.fecha ?? origen, -1); irA(fecha) }}><ArrowLeft size={15} /></button>
      <button className={styles.icono} title="Período siguiente" aria-label="Período siguiente" onClick={() => { const fecha = sumarMeses(foco?.fecha ?? origen, 1); irA(fecha) }}><ArrowRight size={15} /></button>
      <button className={styles.boton} title="Ir al día de hoy" aria-label="Ir al día de hoy" onClick={() => irA(hoy())}><CalendarClock size={14} /> Hoy</button>
      <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
      <button className={styles.boton} onClick={() => setCerrados(cerrados.size ? new Set() : new Set(filas.filter(f => f.tipo === 'servicio').map(f => f.clave)))}><FolderClosed size={14} /> {cerrados.size ? 'Expandir grupos' : 'Contraer grupos'}</button>
      <label className="sr-only" htmlFor={`escala-${clienteId}`}>Escala de calendario</label><select id={`escala-${clienteId}`} className={styles.boton} value={escala} onChange={e => setEscala(e.target.value as typeof escala)}><option className="bg-[#211b2c]" value="dia">Día</option><option className="bg-[#211b2c]" value="semana">Semana</option><option className="bg-[#211b2c]" value="mes">Mes</option></select>
      <label className="hidden items-center gap-2 text-[10px] text-[#aa9aba] xl:flex">Zoom<input aria-label="Zoom del calendario" className="w-16 accent-violet-500" type="range" min={0.75} max={1.5} step={0.25} value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
      {actividad?.fechaInicio && <button className={styles.boton} onClick={() => irA(actividad.fechaInicio!)}><Focus size={14} /> Ver actividad</button>}
      <div className="ml-auto flex items-center gap-2">
        <button className={styles.icono} aria-label="Ajustes del calendario" title="Inicio y meses visibles" aria-expanded={ajustes} onClick={() => setAjustes(!ajustes)}><MoreHorizontal size={16} /></button>
        <button className={styles.icono} aria-label={expandido ? 'Salir de vista ampliada' : 'Ampliar editor'} title="Ampliar editor" onClick={() => setExpandido(!expandido)}>{expandido ? <X size={16} /> : <Expand size={16} />}</button>
      </div>
    </div>
    {ajustes && <div className="flex flex-wrap items-center gap-3 border-b border-white/[.07] bg-violet-500/[.04] px-5 py-3 text-xs">
      <label className="flex items-center gap-2 text-[#b9accb]">Inicio del mes 1<input className={styles.input} type="date" value={config.fechaInicio} disabled={!editable} onChange={e => { if (e.target.value) void acciones.configurar({ ...config, fechaInicio: e.target.value }) }} /></label>
      <span className="text-[#9588a9]">{mesesCalendario} meses completos · incluye el recorrido de todas las actividades</span>
      <button className={styles.boton} disabled={!editable || siguienteCantidadMeses > 60} onClick={() => void acciones.configurar({ ...config, meses: siguienteCantidadMeses })}><Plus size={13} /> Añadir mes</button>
      <button className={styles.boton} disabled={!editable || !puedeQuitarMes} title="Solo se pueden quitar meses finales sin actividades." onClick={() => void acciones.configurar({ ...config, meses: config.meses - 1 })}><Minus size={13} /> Quitar último mes</button>
      <button className={styles.boton} disabled={ocupado} onClick={() => void acciones.recargar()}><RefreshCw size={13} /> Actualizar datos</button>
    </div>}
    {(error || aviso) && <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-rose-400/20 bg-rose-500/10 px-5 py-3 text-xs text-rose-200"><span className="flex-1">{error ?? aviso}</span>
      {error ? <button className={styles.boton} disabled={ocupado} onClick={() => void (conflicto ? acciones.recargar() : acciones.reintentar()).then(ids => {
        if (ids && nueva && ids.length) { setNueva(null); setSeleccionado(ids[0]) }
      })}>{conflicto ? 'Recargar versión actual' : 'Reintentar cambio'}</button> : <button aria-label="Cerrar aviso" onClick={() => setAviso(null)}><X size={14} /></button>}
    </div>}
    {nueva && <form className="flex flex-wrap items-center gap-2 border-b border-violet-400/20 bg-violet-500/10 px-4 py-3" onSubmit={e => { e.preventDefault(); void crear() }}>
      <CornerDownRight size={16} className="text-violet-300" /><input ref={nombreRef} aria-label="Nombre de la nueva actividad" className={`${styles.input} !w-auto min-w-48 flex-1`} placeholder={nueva.padreId ? 'Nombre de la subactividad…' : '¿Qué hay que hacer?'} value={nombreNuevo} maxLength={200} onChange={e => setNombreNuevo(e.target.value)} disabled={bloqueado} />
      <span className="max-w-48 truncate text-[10px] text-violet-200" title={serviciosDisponibles.find(s => s.id === nueva.servicioId)?.nombre}>{serviciosDisponibles.find(s => s.id === nueva.servicioId)?.nombre ?? 'Adicional'}{nueva.inicio ? ` · ${fechaCorta(nueva.inicio)} → ${fechaCorta(nueva.fin!)}` : ' · Sin programar'}</span>
      <button className={styles.primario} disabled={bloqueado || nombreNuevo.trim().length < 2}>Crear</button><button type="button" className={styles.icono} aria-label="Cancelar creación" onClick={() => setNueva(null)}><X size={15} /></button>
    </form>}
    <>
      {!tareas.length && <p className="border-b border-white/[.05] px-5 py-3 text-xs text-[#aa9aba]">Tus servicios ya están aquí. <span className="text-violet-200">Añade una actividad o arrastra sobre el calendario</span> para elegir sus fechas.</p>}
      <div className="relative flex min-h-0 shrink-0" style={{ height: `min(${ALTO_CABECERA_PLAN + filas.length * ALTO_FILA_PLAN + 16}px, 650px, 70vh)` }}>
        <LienzoGantt filas={filas} colores={colores} cerrados={cerrados} origen={rango.inicio} finExclusivo={rango.finExclusivo} foco={foco} anchoDia={anchoDia} seleccionado={seleccionado} editable={editable} scrollRef={scrollRef}
          onToggle={toggle} onSeleccionar={seleccionar} onCambiar={cambiarFechas} onCrear={abrirNueva} onRenombrar={(t, nombre) => guardar({ ...t, nombre })} onMoverFila={moverFila} onMenu={abrirMenu}
          serviciosEliminables={serviciosEliminables} onMenuServicio={abrirMenuServicio} />
        {actividad && <InspectorActividad tarea={actividad} tono={colores.get(actividad.servicioId ?? -1) ?? COLOR_ADICIONAL} tareas={tareas} servicios={serviciosDisponibles} responsables={responsablesActividad} editable={puedeEditar} ocupado={bloqueado}
          onGuardar={guardar} onCerrar={() => setSeleccionado(null)} onVer={() => { if (actividad.fechaInicio) irA(actividad.fechaInicio) }} onDuplicar={() => void duplicar(actividad)} onSubactividad={() => abrirNueva(actividad.servicioId, actividad.id, null, null)} onEliminar={() => setEliminar(actividad)} />}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[.07] px-5 py-3 text-[10px] text-[#b3a6c5]">
        <div className="flex flex-wrap items-center gap-3"><CalendarDays size={14} className="text-violet-300" /><span>{servicios.length} servicios · {tareas.length} actividades</span><span>{duracion(desde, hasta) || '—'} días de planificación</span><span>{desde && hasta ? `${fechaCorta(desde)} — ${fechaCorta(hasta)}` : 'Sin fechas programadas'}</span></div>
        <div className="flex flex-wrap items-center gap-3"><span title="Las barras completadas se muestran en verde; las demás usan el color de su servicio"><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />Completada</span><span className="text-[#91859f]">Color por servicio · relleno = avance</span>
          <span className="ml-1 flex items-center gap-2 border-l border-white/10 pl-3">
            <button className="rounded p-1 text-violet-300 hover:bg-violet-500/15 disabled:opacity-40" aria-label="Quitar último mes" title="Solo se pueden quitar meses finales sin actividades" disabled={!editable || !puedeQuitarMes} onClick={() => void acciones.configurar({ ...config, meses: config.meses - 1 })}><Minus size={14} /></button>
            <span className="tabular-nums">{mesesCalendario} {mesesCalendario === 1 ? 'mes' : 'meses'}</span>
            <button className="rounded p-1 text-violet-300 hover:bg-violet-500/15 disabled:opacity-40" aria-label="Añadir mes" title="Añadir mes" disabled={!editable || siguienteCantidadMeses > 60} onClick={() => void acciones.configurar({ ...config, meses: siguienteCantidadMeses })}><Plus size={14} /></button>
          </span>
        </div>
      </footer>
      <div aria-label="Colores de los servicios" className="flex flex-wrap gap-x-4 gap-y-2 border-t border-white/[.04] px-5 py-2.5">
        {serviciosDisponibles.map(s => <span key={s.id} title={s.nombre} className="flex min-w-0 max-w-72 items-center gap-1.5 text-[10px] text-[#b3a6c5]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colores.get(s.id) }} /><span className="truncate">{s.nombre}</span></span>)}
        <span className="flex items-center gap-1.5 text-[10px] text-[#b3a6c5]"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_ADICIONAL }} />Adicionales</span>
      </div>
    </>
    {nuevoServicio && presupuestoId !== null && <NuevoServicio clienteId={clienteId} presupuestoId={presupuestoId} responsables={participantesServicio} onCerrar={() => setNuevoServicio(false)} onGuardado={async () => { await onActualizado() }} />}
    {menu && menuTarea && createPortal(<div data-plan-menu className={styles.menu} role="menu" aria-label="Acciones de actividad" style={{ left: menu.x, top: menu.y }} onKeyDown={e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const botones = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const indice = botones.indexOf(document.activeElement as HTMLButtonElement)
      botones[(indice + (e.key === 'ArrowDown' ? 1 : -1) + botones.length) % botones.length]?.focus()
    }}>
      <button autoFocus role="menuitem" onClick={() => { setSeleccionado(menuTarea.id); setMenu(null) }}>Editar en inspector</button>
      {puedeEditar && <>
        <button role="menuitem" disabled={bloqueado} onClick={() => { setMenu(null); void duplicar(menuTarea) }}><Copy size={14} /> Duplicar actividad</button>
        <button role="menuitem" disabled={bloqueado} onClick={() => { setMenu(null); abrirNueva(menuTarea.servicioId, menuTarea.id, null, null) }}><CornerDownRight size={14} /> Crear subactividad</button>
        <button role="menuitem" disabled={bloqueado} onClick={() => { setMenu(null); reordenar(menuTarea, -1) }}><ArrowUp size={14} /> Subir</button>
        <button role="menuitem" disabled={bloqueado} onClick={() => { setMenu(null); reordenar(menuTarea, 1) }}><ArrowDown size={14} /> Bajar</button>
        <button role="menuitem" onClick={() => { setMenu(null); setSeleccionado(menuTarea.id) }}><FolderClosed size={14} /> Cambiar servicio en inspector</button>
        <button role="menuitem" className="text-rose-300" disabled={bloqueado} onClick={() => { setMenu(null); setEliminar(menuTarea) }}><Trash2 size={14} /> Eliminar</button>
      </>}
    </div>, document.body)}
    {menuServicio && createPortal(<div data-plan-menu className={styles.menu} role="menu" aria-label="Acciones del servicio" style={{ left: menuServicio.x, top: menuServicio.y }}>
      <button autoFocus role="menuitem" className="text-rose-300" disabled={bloqueado} onClick={() => { setServicioAEliminar(menuServicio.servicio); setMenuServicio(null) }}><Trash2 size={14} /> Eliminar servicio</button>
    </div>, document.body)}
    {typeof document !== 'undefined' && eliminar && createPortal(<div className="fixed inset-0 z-[200]"><ConfirmDialog abierto titulo="Eliminar actividad" descripcion={`Se eliminará «${eliminar.nombre}». Sus subactividades se conservarán en el nivel superior y se quitarán las dependencias que apuntan a ella.`}
      confirmarTexto={ocupado ? 'Eliminando…' : 'Eliminar actividad'} onCancelar={() => setEliminar(null)} onConfirmar={() => { if (!editable) return; void acciones.eliminar(eliminar).then(resultado => { if (resultado) { setEliminar(null); setSeleccionado(null) } }) }} /></div>, document.body)}
    {typeof document !== 'undefined' && servicioAEliminar && createPortal(<div className="fixed inset-0 z-[200]"><ConfirmDialog abierto titulo="Eliminar servicio" descripcion={`Se eliminará «${servicioAEliminar.nombre}» del presupuesto vigente y se borrarán ${tareas.filter(t => t.servicioId === servicioAEliminar.id).length} actividad(es) planificada(s). Si el servicio tiene horas registradas, no se podrá eliminar. Esta acción no se puede deshacer.`}
      confirmarTexto={eliminandoServicio ? 'Eliminando…' : 'Eliminar servicio'} onCancelar={() => { if (!eliminandoServicio) setServicioAEliminar(null) }} onConfirmar={() => void eliminarServicio(servicioAEliminar)} /></div>, document.body)}
  </section>
}
