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
