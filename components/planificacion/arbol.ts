import type { ServicioPlan, TareaCronograma } from '@/lib/planificacion/modelo'
export type FilaPlan =
  | { tipo: 'servicio'; clave: string; servicio: ServicioPlan | null; nombre: string; tareas: TareaCronograma[]; profundidad: 0 }
  | { tipo: 'tarea'; clave: string; tarea: TareaCronograma; profundidad: number; hijos: boolean }

export function construirFilas(servicios: ServicioPlan[], tareas: TareaCronograma[], cerrados: Set<string>): FilaPlan[] {
  const grupos: { servicio: ServicioPlan | null; nombre: string }[] = servicios.map(s => ({ servicio: s, nombre: s.nombre }))
  for (const t of tareas) if (t.servicioId !== null && !grupos.some(g => g.servicio?.id === t.servicioId)) grupos.push({ servicio: { id: t.servicioId, nombre: t.servicioNombre ?? 'Servicio anterior' }, nombre: t.servicioNombre ?? 'Servicio anterior' })
  grupos.push({ servicio: null, nombre: 'Actividades adicionales' })
  const filas: FilaPlan[] = []
  for (const grupo of grupos) {
    const propias = tareas.filter(t => t.servicioId === (grupo.servicio?.id ?? null)).sort((a, b) => a.orden - b.orden || a.id - b.id)
    const clave = `s-${grupo.servicio?.id ?? 'general'}`
    filas.push({ tipo: 'servicio', clave, ...grupo, tareas: propias, profundidad: 0 })
    if (cerrados.has(clave)) continue
    const porPadre = new Map<number | null, TareaCronograma[]>()
    const ids = new Set(propias.map(t => t.id))
    for (const t of propias) {
      const padre = t.padreId !== null && ids.has(t.padreId) ? t.padreId : null
      porPadre.set(padre, [...(porPadre.get(padre) ?? []), t])
    }
    const visitar = (padre: number | null, profundidad: number) => {
      for (const tarea of porPadre.get(padre) ?? []) {
        const claveT = `t-${tarea.id}`
        filas.push({ tipo: 'tarea', clave: claveT, tarea, profundidad, hijos: porPadre.has(tarea.id) })
        if (!cerrados.has(claveT)) visitar(tarea.id, profundidad + 1)
      }
    }
    visitar(null, 1)
  }
  return filas
}
