import type { ServicioPlan } from '@/lib/planificacion/modelo'

// Ordenar por identidad mantiene los colores al reordenar filas o actualizar horas.
const PALETA = ['#9d6aee', '#438cf0', '#d96bd9', '#28b7a3', '#d59a45', '#ed788f', '#7f8de9', '#63b4d7']
export const COLOR_ADICIONAL = '#8c91a9'
export const COLOR_COMPLETADA = '#35b96f'
export function coloresServicios(servicios: ServicioPlan[]): Map<number, string> {
  const ids = [...new Set(servicios.map(s => s.id))].sort((a, b) => a - b)
  return new Map(ids.map((id, i) => [id, PALETA[i % PALETA.length]]))
}
