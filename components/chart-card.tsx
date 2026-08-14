'use client'

import { useMemo } from 'react'
import { Building2, Calculator, Users } from 'lucide-react'
import { duracionAHoras, fechaEnRango } from '@/lib/format'
import { useRegistros } from '@/lib/use-registros'

const paleta = ['#7c3aed', '#8b5cf6', '#c4b5fd']

interface ChartCardProps {
  areaId?: string
  desde?: string
  hasta?: string
}

const icPorEspecialidad: Record<string, React.ElementType> = {
  Corporativo: Building2,
  Tributario: Calculator,
  Laboral: Users,
}

export function ChartCard({ areaId = '', desde = '', hasta = '' }: ChartCardProps) {
  const registros = useRegistros()

  const especialidades = useMemo(() => {
    const filtrados = registros.filter(
      (r) => (!areaId || r.areaId === areaId) && fechaEnRango(r.fecha, desde, hasta),
    )
    const porEspecialidad = new Map<string, number>()
    for (const r of filtrados) {
      porEspecialidad.set(r.especialidad, (porEspecialidad.get(r.especialidad) ?? 0) + duracionAHoras(r.duracion))
    }
    const total = Array.from(porEspecialidad.values()).reduce((acc, h) => acc + h, 0)
    return Array.from(porEspecialidad.entries())
      .map(([nombre, horas]) => ({
        nombre,
        horas,
        porcentaje: total === 0 ? 0 : Math.round((horas / total) * 100),
      }))
      .sort((a, b) => b.horas - a.horas)
  }, [registros, areaId, desde, hasta])

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Resumen por especialidad</h2>
        <p className="text-xs text-muted-foreground">Horas registradas en el período</p>
      </div>

      <div className="flex flex-1 flex-col justify-center space-y-4">
        {especialidades.map((especialidad, indice) => {
          const Icono = icPorEspecialidad[especialidad.nombre] ?? Building2
          return (
            <div key={especialidad.nombre} className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/15">
                <Icono size={16} className="text-[#c4b5fd]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {especialidad.nombre}
                  </span>
                  <span className="text-sm">
                    <span className="font-semibold text-foreground">{especialidad.horas.toFixed(1)} h</span>
                    <span className="ml-2 text-xs font-medium text-muted-foreground">
                      {especialidad.porcentaje} %
                  </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${especialidad.porcentaje}%`,
                      backgroundColor: paleta[indice % paleta.length],
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
        {especialidades.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay actividades registradas en esa fecha.
          </p>
        )}
      </div>
    </div>
  )
}
