import type { Actividad } from './types'

export function segundosReporte(registro: Actividad): number {
  if (!registro.fin || !registro.inicio) return 0
  const tiempo = (new Date(registro.fin).getTime() - new Date(registro.inicio).getTime()) / 1000
  return Number.isFinite(tiempo) ? Math.max(0, tiempo - (registro.pausa_acumulada_segundos || 0)) : 0
}

export function duracionReporte(registro: Actividad): string {
  if (!registro.fin) return '—'
  const minutos = Math.floor(segundosReporte(registro) / 60)
  const horas = Math.floor(minutos / 60)
  return horas ? horas + 'h' + (minutos % 60 ? ' ' + minutos % 60 + 'min' : '') : minutos + 'min'
}
