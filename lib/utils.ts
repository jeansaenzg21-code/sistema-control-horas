import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const dos = (n: number) => String(n).padStart(2, '0')

export function formatHora(valor: string | Date): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor
  if (Number.isNaN(fecha.getTime())) return String(valor)
  return `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`
}

export function formatFecha(valor: string | Date): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor
  if (Number.isNaN(fecha.getTime())) return String(valor)
  return `${dos(fecha.getDate())}-${dos(fecha.getMonth() + 1)}-${fecha.getFullYear()}`
}

export function fechaLocalISO(valor: string | Date): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor
  if (Number.isNaN(fecha.getTime())) return String(valor)
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
}

export function esFacturable(valor: unknown): boolean {
  return valor === true || valor === 1
}

export function esNoFacturable(valor: unknown): boolean {
  return valor === false || valor === 0
}

export function formatoHoras(horas: number): string {
  if (!Number.isFinite(horas)) return '0min'
  const totalMin = Math.round(horas * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}
