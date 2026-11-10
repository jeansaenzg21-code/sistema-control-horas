'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { ConfiguracionCronograma, TareaCronograma } from '@/lib/planificacion/modelo'
import { descendientes } from '@/lib/planificacion/modelo'
import { hoy } from '@/lib/planificacion/fechas'

type Estado = {
  tareas: TareaCronograma[]; config: ConfiguracionCronograma
  guardado: 'guardado' | 'guardando' | 'error'; error: string | null; conflicto: boolean
}
type Operacion = { metodo: string; cuerpo?: unknown; query?: string; optimistas?: TareaCronograma[] }
export function cuerpoTarea(t: TareaCronograma) {
  return { id: t.id, revision: t.revision, servicio_id: t.servicioId, padre_id: t.padreId, nombre: t.nombre,
    etapa: t.etapa, fecha_inicio: t.fechaInicio, fecha_fin: t.fechaFin, horas: t.horas,
    progreso: t.progreso, estado: t.estado, responsable_id: t.responsableId, dependencias: t.dependencias, notas: t.notas }
}

// La cola vive por cliente, no por pestaña: desmontar Planificación no cancela un guardado.
function crearAlmacen(clienteId: number, tareas: TareaCronograma[], config: ConfiguracionCronograma | null) {
  let estado: Estado = { tareas, config: config ?? { fechaInicio: hoy(), meses: 3 }, guardado: 'guardado', error: null, conflicto: false }
  let fallida: Operacion | null = null
  let enCurso = false
  const oyentes = new Set<() => void>()
  const publicar = (cambios: Partial<Estado>) => { estado = { ...estado, ...cambios }; oyentes.forEach(fn => fn()) }
  const url = `/api/clientes/${clienteId}/planificacion`
  async function ejecutar(op: Operacion): Promise<number[] | null> {
    if (enCurso) return null
    enCurso = true
    const anteriores = estado.tareas
    publicar({ guardado: 'guardando', error: null, conflicto: false, tareas: op.optimistas ?? anteriores })
    try {
      const r = await fetch(`${url}${op.query ?? ''}`, { method: op.metodo, headers: { 'Content-Type': 'application/json' }, body: op.cuerpo ? JSON.stringify(op.cuerpo) : undefined })
      const datos = await r.json()
      if (!r.ok) {
        publicar({ conflicto: r.status === 409 })
        throw new Error(datos.error ?? 'No se pudo guardar el cambio.')
      }
      fallida = null
      publicar({ tareas: datos.tareas ?? estado.tareas, config: datos.configuracion ?? estado.config, guardado: 'guardado', error: null })
      return datos.ids ?? []
    } catch (error) {
      fallida = op
      publicar({ tareas: anteriores, guardado: 'error', error: error instanceof Error ? error.message : 'Sin conexión. Tu cambio está pendiente de reintento.' })
      return null
    } finally { enCurso = false }
  }
  return {
    subscribe: (fn: () => void) => { oyentes.add(fn); return () => { oyentes.delete(fn) } },
    snapshot: () => estado,
    crear: (nuevas: TareaCronograma[]) => ejecutar({ metodo: 'POST', cuerpo: { tareas: nuevas.map(t => ({ ...cuerpoTarea(t), clave_creacion: crypto.randomUUID() })) } }),
    editar: (t: TareaCronograma, antesDe?: number | null) => {
      const hijos = descendientes(estado.tareas, t.id)
      let optimistas = estado.tareas.map(x => x.id === t.id ? t : hijos.has(x.id) ? { ...x, servicioId: t.servicioId, servicioNombre: t.servicioNombre } : x)
      if (antesDe !== undefined) {
        const hermanos = optimistas.filter(x => x.id !== t.id && x.padreId === t.padreId && x.servicioId === t.servicioId).sort((a, b) => a.orden - b.orden || a.id - b.id)
        const posicion = antesDe === null ? hermanos.length : hermanos.findIndex(x => x.id === antesDe)
        hermanos.splice(Math.max(0, posicion), 0, t)
        const orden = new Map(hermanos.map((x, i) => [x.id, i + 1]))
        optimistas = optimistas.map(x => orden.has(x.id) ? { ...x, orden: orden.get(x.id)! } : x)
      }
      return ejecutar({ metodo: 'PATCH', cuerpo: { ...cuerpoTarea(t), ...(antesDe !== undefined ? { antes_de: antesDe } : {}) }, optimistas })
    },
    eliminar: (t: TareaCronograma) => ejecutar({ metodo: 'DELETE', query: `?id=${t.id}&revision=${t.revision}`, optimistas: estado.tareas.filter(x => x.id !== t.id) }),
    configurar: (c: ConfiguracionCronograma) => ejecutar({ metodo: 'PUT', cuerpo: { fecha_inicio: c.fechaInicio, meses: c.meses } }),
    reintentar: () => fallida ? ejecutar(fallida) : Promise.resolve(null),
    recargar: () => ejecutar({ metodo: 'GET' }),
  }
}
const almacenes = new Map<number, ReturnType<typeof crearAlmacen>>()
let proteccionInstalada = false
export function useEditorPlan(clienteId: number, tareas: TareaCronograma[], config: ConfiguracionCronograma | null) {
  let almacen = almacenes.get(clienteId)
  if (!almacen) { almacen = crearAlmacen(clienteId, tareas, config); almacenes.set(clienteId, almacen) }
  const estado = useSyncExternalStore(almacen.subscribe, almacen.snapshot, almacen.snapshot)
  useEffect(() => {
    if (almacen.snapshot().guardado === 'guardado') void almacen.recargar()
  }, [almacen])
  useEffect(() => {
    if (proteccionInstalada) return
    proteccionInstalada = true
    const prevenir = (e: BeforeUnloadEvent) => {
      if ([...almacenes.values()].some(a => a.snapshot().guardado !== 'guardado')) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', prevenir)
    // Se mantiene al salir de la pestaña mientras una petición termine o falle.
  }, [])
  return { ...estado, acciones: almacen, ocupado: estado.guardado === 'guardando' }
}
