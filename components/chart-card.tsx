'use client'

import { useMemo } from 'react'
import { Building2 } from 'lucide-react'
import { useHistorialRango } from '@/lib/use-historial-rango'
import { fechaLocalISO, formatoHoras } from '@/lib/utils'

const paleta = ['#7c3aed', '#8b5cf6', '#c4b5fd']

interface ChartCardProps {
  areaId?: string
  desde?: string
  hasta?: string
}

export function ChartCard({ areaId = '', desde = '', hasta = '' }: ChartCardProps) {
  const { registros } = useHistorialRango(desde ?? '', hasta ?? '')

  const calcularHoras = (r: { inicio: string; fin: string | null; pausa_acumulada_segundos: number }): number => {
    if (!r.fin || !r.inicio) return 0
    const diff = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 1000
    return Math.max(0, (diff - r.pausa_acumulada_segundos) / 3600)
  }

  const cargos = useMemo(() => {
    let filtrados = registros
    if (areaId) filtrados = filtrados.filter((r) => String(r.area_id) === areaId)
    if (desde) filtrados = filtrados.filter((r) => fechaLocalISO(r.inicio) >= desde)
    if (hasta) filtrados = filtrados.filter((r) => fechaLocalISO(r.inicio) <= hasta)

    const porCargo = new Map<string, number>()
    for (const r of filtrados) {
      const cargo = r.cargo || 'Sin cargo'
      porCargo.set(cargo, (porCargo.get(cargo) ?? 0) + calcularHoras(r))
    }
    const total = Array.from(porCargo.values()).reduce((acc, h) => acc + h, 0)
    return Array.from(porCargo.entries())
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
        <h2 className="text-sm font-semibold text-foreground">Resumen por cargo</h2>
        <p className="text-xs text-muted-foreground">Horas registradas en el período</p>
      </div>

      <div className="flex flex-1 flex-col justify-center space-y-4">
        {cargos.map((cargo, indice) => {
          const Icono = Building2
          return (
            <div key={cargo.nombre} className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/15">
                <Icono size={16} className="text-[#c4b5fd]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {cargo.nombre}
                  </span>
                  <span className="text-sm">
                    <span className="font-semibold text-foreground">{formatoHoras(cargo.horas)}</span>
                    <span className="ml-2 text-xs font-medium text-muted-foreground">
                      {cargo.porcentaje} %
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${cargo.porcentaje}%`,
                      backgroundColor: paleta[indice % paleta.length],
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
        {cargos.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay actividades registradas en esa fecha.
          </p>
        )}
      </div>
    </div>
  )
}
