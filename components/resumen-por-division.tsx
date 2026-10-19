'use client'

import { useMemo } from 'react'
import { Building2 } from 'lucide-react'
import { useResumenActividades } from '@/lib/use-resumen'
import { formatoHoras } from '@/lib/utils'

const paleta = ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#6d28d9', '#ddd6fe']

interface DivisionCardProps {
  areaId?: string
  desde?: string
  hasta?: string
}

/**
 * Horas de cada división.
 *
 * Antes agrupaba por CARGO, y el título decía "Resumen por cargo". Para quien
 * administra la empresa la pregunta útil no es qué puesto ocupa el trabajo sino
 * en qué división se consume: el cargo se puede leer en el detalle del
 * colaborador, pero el reparto por división es lo que se compara entre meses y
 * entre áreas.
 *
 * El agrupado sale de `por_usuario`, que el resumen ya trae. Se agrupa aquí y
 * no con un `GROUP BY` en el servidor a propósito: `por_usuario` ya está en el
 * navegador por otros paneles, así que sumarlo son unas decenas de números, no
 * otra consulta con la tabla de pausas derivada. El total se calcula sobre las
 * divisiones que se pintan para que los porcentajes sumen 100.
 */
export function ResumenPorDivision({ areaId = '', desde = '', hasta = '' }: DivisionCardProps) {
  const { resumen } = useResumenActividades({ desde, hasta, areaId })

  const divisiones = useMemo(() => {
    const mapa = new Map<string, { horas: number; registros: number; personas: number }>()
    for (const u of resumen.por_usuario) {
      // Un usuario sin division asignada sigue teniendo horas: se agrupa aparte
      // en vez de desaparecer del resumen.
      const clave = u.area_nombre?.trim() || 'Sin división'
      const actual = mapa.get(clave) ?? { horas: 0, registros: 0, personas: 0 }
      actual.horas += Number(u.horas) || 0
      actual.registros += Number(u.registros) || 0
      actual.personas += 1
      mapa.set(clave, actual)
    }
    const lista = [...mapa.entries()].sort((a, b) => b[1].horas - a[1].horas)
    const total = lista.reduce((t, [, d]) => t + d.horas, 0)
    return lista.map(([nombre, d]) => ({
      nombre,
      ...d,
      porcentaje: total === 0 ? 0 : Math.round((d.horas / total) * 100),
    }))
  }, [resumen.por_usuario])

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Resumen por división</h2>
        <p className="text-xs text-muted-foreground">Horas registradas en el período</p>
      </div>

      <div className="flex flex-1 flex-col justify-center space-y-4">
        {divisiones.map((division, indice) => (
          <div key={division.nombre} className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary/15">
              <Building2 size={16} className="text-chart-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground" title={division.nombre}>
                  {division.nombre}
                </span>
                <span className="shrink-0 text-sm">
                  <span className="font-semibold text-foreground">{formatoHoras(division.horas)}</span>
                  <span className="ml-2 text-xs font-medium text-muted-foreground">
                    {division.porcentaje} %
                  </span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${division.porcentaje}%`,
                    backgroundColor: paleta[indice % paleta.length],
                  }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {division.personas} {division.personas === 1 ? 'persona' : 'personas'} · {division.registros}{' '}
                {division.registros === 1 ? 'registro' : 'registros'}
              </p>
            </div>
          </div>
        ))}
        {divisiones.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay actividades registradas en ese período.
          </p>
        )}
      </div>
    </div>
  )
}
