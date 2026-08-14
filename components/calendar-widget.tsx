'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const DIAS_ACTIVOS = [5, 8, 12, 15, 18, 22, 25, 28]

export function CalendarWidget() {
  const [fecha, setFecha] = useState(new Date(2025, 7, 1))

  const diasEnMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate()
  const primerDia = new Date(fecha.getFullYear(), fecha.getMonth(), 1).getDay()

  const anteriorMes = () =>
    setFecha(new Date(fecha.getFullYear(), fecha.getMonth() - 1, 1))
  const siguienteMes = () =>
    setFecha(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1))

  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Calendario</h2>
      </div>

      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          {MESES[fecha.getMonth()]} {fecha.getFullYear()}
        </span>
        <div className="flex gap-1">
          <button
            onClick={anteriorMes}
            className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={siguienteMes}
            className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase text-muted-foreground">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((dia) => (
          <span key={dia} className="py-0.5">{dia}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-0.5">
        {Array.from({ length: primerDia }, (_, i) => (
          <span key={`b-${i}`} />
        ))}
        {Array.from({ length: diasEnMes }, (_, i) => {
          const dia = i + 1
          const activo = DIAS_ACTIVOS.includes(dia)
          return (
            <span
              key={dia}
              className={cn(
                'flex h-5 items-center justify-center rounded-md text-[10px] font-medium',
                activo
                  ? 'bg-[#7c3aed]/15 text-[#c4b5fd]'
                  : 'text-foreground',
              )}
            >
              {dia}
            </span>
          )
        })}
      </div>
    </div>
  )
}