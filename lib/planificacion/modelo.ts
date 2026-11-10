export type EstadoActividad = 'PENDIENTE' | 'PLANIFICADA' | 'EN_CURSO' | 'COMPLETADA'

export type TareaCronograma = {
  id: number
  servicioId: number | null
  servicioNombre: string | null
  padreId: number | null
  nombre: string
  etapa: string | null
  fechaInicio: string | null
  fechaFin: string | null
  horas: number
  progreso: number
  estado: EstadoActividad
  responsableId: number | null
  dependencias: number[]
  notas: string | null
  orden: number
  revision: number
}

export type EntradaTareaCronograma = Omit<TareaCronograma, 'id' | 'orden' | 'revision'> & {
  claveCreacion?: string
}
export type ConfiguracionCronograma = { fechaInicio: string; meses: number }
export type ServicioPlan = { id: number; nombre: string }
export type ResponsablePlan = { id: number; nombre: string }
export type PlanExcel = {
  subetapa: string; etapa: string | null; horas: number
  semanaInicio: number | null; semanaFin: number | null
  mes: string | null; servicioId: number | null
}

export class ErrorPlanificacion extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** Valida ambos grafos por separado, sin deducir relaciones por nombre. */
export function validarGrafo(tareas: TareaCronograma[]): void {
  const mapa = new Map(tareas.map(t => [t.id, t]))
  for (const t of tareas) {
    if ((t.fechaInicio === null) !== (t.fechaFin === null)) throw new ErrorPlanificacion('Indica ambas fechas o deja la actividad sin programar.')
    if (t.fechaInicio && t.fechaFin && t.fechaFin < t.fechaInicio) throw new ErrorPlanificacion('La fecha de fin no puede ser anterior al inicio.')
    if (t.padreId !== null) {
      const padre = mapa.get(t.padreId)
      if (!padre) throw new ErrorPlanificacion('La actividad padre no pertenece a este cliente.')
      if (padre.servicioId !== t.servicioId) throw new ErrorPlanificacion('Una subactividad debe pertenecer al servicio de su actividad padre.')
    }
    if (t.dependencias.some(id => !mapa.has(id))) throw new ErrorPlanificacion('Una dependencia no pertenece a este cliente.')
  }
  for (const tipo of ['jerarquia', 'dependencias'] as const) {
    const visitados = new Set<number>()
    const abiertos = new Set<number>()
    const visitar = (id: number) => {
      if (abiertos.has(id)) throw new ErrorPlanificacion(tipo === 'jerarquia' ? 'Una actividad no puede ser hija de sí misma ni de sus descendientes.' : 'La dependencia crearía un ciclo.')
      if (visitados.has(id)) return
      abiertos.add(id)
      const t = mapa.get(id)!
      const siguientes = tipo === 'jerarquia' ? (t.padreId === null ? [] : [t.padreId]) : t.dependencias
      for (const siguiente of siguientes) visitar(siguiente)
      abiertos.delete(id)
      visitados.add(id)
    }
    for (const t of tareas) visitar(t.id)
  }
}

export function descendientes(tareas: TareaCronograma[], id: number): Set<number> {
  const resultado = new Set<number>()
  const pendientes = [id]
  while (pendientes.length) {
    const padre = pendientes.pop()!
    for (const t of tareas) if (t.padreId === padre && !resultado.has(t.id)) {
      resultado.add(t.id); pendientes.push(t.id)
    }
  }
  return resultado
}
