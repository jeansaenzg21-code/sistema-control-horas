'use client'

import { useMemo, useRef, useState } from 'react'
import { useResumenActividades } from '@/lib/use-resumen'
import { esFacturable, fechaLocalISO } from '@/lib/utils'

const COLORES = ['#7c3aed', '#8b5cf6', '#c4b5fd', '#a78bfa', '#6d28d9', '#ddd6fe']

interface Segmento {
  nombre: string
  horas: number
}

interface AreaChartProps {
  areaId?: string
  desde?: string
  hasta?: string
}

export function AreaChart({ areaId = '', desde = '', hasta = '' }: AreaChartProps) {
  // Solo lo aprobado y facturable, agregado en el servidor.
  const { resumen } = useResumenActividades({ desde, hasta, areaId })

  const datos = useMemo(
    () => resumen.por_cargo_facturable.filter((d) => d.horas > 0).map((d) => ({ nombre: d.cargo, horas: d.horas })),
    [resumen.por_cargo_facturable]
  )

  const total = datos.reduce((acc, d) => acc + d.horas, 0)

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4">
        {/* El título decía "Facturado por división" pero lo que se pinta es el
            desglose por CARGO (`por_cargo_facturable`). Con la card de al lado
            ahora.groupby división, un título que miente aquí se nota más. */}
        <h2 className="text-sm font-semibold text-foreground">Facturado por cargo</h2>
        <p className="text-xs text-muted-foreground">Solo lo aprobado y facturable</p>
      </div>

      {total === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Sin registros facturados todavía.
        </p>
      ) : (
        <Donut datos={datos} total={total} />
      )}
    </div>
  )
}

function Donut({ datos, total }: { datos: Segmento[]; total: number }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const contenedor = useRef<HTMLDivElement>(null)

  const manejarMovimiento = (e: React.MouseEvent) => {
    const rect = contenedor.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const radio = 60
  const grosor = 16
  const circunferencia = 2 * Math.PI * radio
  const separacion = 2.5
  let acumulado = 0

  const hoverInfo = hovered ? datos.find((d) => d.nombre === hovered) : null

  return (
    <div
      ref={contenedor}
      onMouseMove={manejarMovimiento}
      className="relative mx-auto aspect-square w-full max-w-[150px]"
    >
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle
          cx="70"
          cy="70"
          r={radio}
          fill="none"
          stroke="currentColor"
          className="text-muted/40"
          strokeWidth={grosor}
        />
        {datos.map((d, i) => {
          const fraccion = d.horas / total
          const longitud = Math.max(fraccion * circunferencia - separacion, 0)
          const desplazamiento = acumulado * circunferencia
          acumulado += fraccion
          const color = COLORES[i % COLORES.length]
          const activo = hovered == null || hovered === d.nombre
          return (
            <g key={d.nombre}>
              <circle
                cx="70"
                cy="70"
                r={radio}
                fill="none"
                stroke={color}
                strokeWidth={grosor}
                strokeDasharray={`${longitud} ${circunferencia}`}
                strokeDashoffset={-desplazamiento}
                opacity={activo ? 1 : 0.3}
                className="transition-opacity duration-150"
                onMouseEnter={() => setHovered(d.nombre)}
                onMouseLeave={() => setHovered(null)}
              />
              <circle
                cx="70"
                cy="70"
                r={radio}
                fill="none"
                stroke="transparent"
                strokeWidth={grosor + 12}
                strokeDasharray={`${longitud} ${circunferencia}`}
                strokeDashoffset={-desplazamiento}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(d.nombre)}
                onMouseLeave={() => setHovered(null)}
              />
            </g>
          )
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-foreground">
          {hoverInfo ? `${porcentaje(hoverInfo.horas, total)}%` : '100%'}
        </span>
        <span className="max-w-[70px] truncate text-center text-[11px] text-muted-foreground">
          {hoverInfo ? hoverInfo.nombre : 'total facturado'}
        </span>
      </div>

      {hoverInfo && pos && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: pos.x, top: pos.y - 10 }}
        >
          <p className="font-medium text-foreground">{hoverInfo.nombre}</p>
          <p className="text-muted-foreground">{porcentaje(hoverInfo.horas, total)}% del total</p>
        </div>
      )}
    </div>
  )
}

function porcentaje(horas: number, total: number): string {
  if (total === 0) return '0'
  return ((horas / total) * 100).toFixed(1)
}
