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
