import type { EstadoActividad } from './modelo'

const DIA = 86_400_000
export function rangoCalendario(origen: string, meses: number, tareas: { fechaInicio: string | null; fechaFin: string | null }[]) {
  let inicio = origen.slice(0, 7) + '-01'
  let finExclusivo = sumarMeses(inicio, meses)
  for (const t of tareas) {
    if (t.fechaInicio && t.fechaInicio < inicio) inicio = t.fechaInicio.slice(0, 7) + '-01'
    if (t.fechaFin && t.fechaFin >= finExclusivo) finExclusivo = sumarMeses(t.fechaFin.slice(0, 7) + '-01', 1)
  }
  return { inicio, finExclusivo }
}
export function indice(iso: string): number { return Date.parse(`${iso}T00:00:00Z`) / DIA }
export function desdeIndice(n: number): string { return new Date(n * DIA).toISOString().slice(0, 10) }
export function sumarDias(iso: string, dias: number): string { return desdeIndice(indice(iso) + dias) }
export function hoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function sumarMeses(iso: string, n: number): string {
  const [a, m, dia] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dia, ultimo))
  return d.toISOString().slice(0, 10)
}
/** Avance medido por el sistema: proporcional a los días transcurridos del intervalo planificado. */
export function progresoPlanificado(inicio: string | null, fin: string | null, referencia: string = hoy()): number {
  if (!inicio || !fin) return 0
  if (referencia >= fin) return 100
  if (referencia <= inicio) return 0
  const total = indice(fin) - indice(inicio)
  if (total <= 0) return 0
  return Math.min(99, Math.round(((indice(referencia) - indice(inicio)) / total) * 100))
}
export function estadoPlanificado(inicio: string | null, fin: string | null, referencia: string = hoy()): EstadoActividad {
  if (!inicio || !fin) return 'PENDIENTE'
  const progreso = progresoPlanificado(inicio, fin, referencia)
  return progreso >= 100 ? 'COMPLETADA' : progreso > 0 ? 'EN_CURSO' : 'PLANIFICADA'
}
export function duracion(inicio: string | null, fin: string | null): number {
  return inicio && fin ? indice(fin) - indice(inicio) + 1 : 0
}
export function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
}
export function moverIntervalo(inicio: string, fin: string, dias: number, modo: 'mover' | 'inicio' | 'fin') {
  if (modo === 'inicio') return { fechaInicio: desdeIndice(Math.min(indice(fin), indice(inicio) + dias)), fechaFin: fin }
  if (modo === 'fin') return { fechaInicio: inicio, fechaFin: desdeIndice(Math.max(indice(inicio), indice(fin) + dias)) }
  return { fechaInicio: sumarDias(inicio, dias), fechaFin: sumarDias(fin, dias) }
}
