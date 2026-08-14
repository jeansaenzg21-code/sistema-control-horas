'use client'

import { Calendar, FileText, LayoutList, Building2 } from 'lucide-react'
import { useAreas } from '@/lib/areas-context'
import { cn } from '@/lib/utils'

export interface FiltrosReporte {
  areaId: string
  tipo: string
  desde: string
  hasta: string
  especialidad: string
}

const tipos = [
  { id: 'mensual', etiqueta: 'Mensual' },
  { id: 'especialidad', etiqueta: 'Por especialidad' },
]

interface ReportFiltersProps {
  filtros: FiltrosReporte
  onChange: (filtros: FiltrosReporte) => void
}

export function ReportFilters({ filtros, onChange }: ReportFiltersProps) {
  const { areas } = useAreas()
  const areaSeleccionada = areas.find((a) => a.id === filtros.areaId)
  const sinArea = !filtros.areaId
  const especialidades = areaSeleccionada ? areaSeleccionada.especialidades : []

  const actualizar = <K extends keyof FiltrosReporte>(clave: K, valor: FiltrosReporte[K]) => {
    onChange({ ...filtros, [clave]: valor })
  }

  const seleccionarArea = (areaId: string) => {
    onChange({ ...filtros, areaId, especialidad: 'todas' })
  }

  const seleccionarTipo = (tipo: string) => {
    onChange({ ...filtros, tipo, especialidad: tipo === 'especialidad' ? filtros.especialidad : 'todas' })
  }

  const estiloControl =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div
        className={cn(
          'grid grid-cols-1 gap-4 md:grid-cols-2',
          filtros.tipo === 'especialidad' ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
        )}
      >
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Building2 size={13} />
            Área
          </label>
          <select
            value={filtros.areaId}
            onChange={(e) => seleccionarArea(e.target.value)}
            className={`${estiloControl} cursor-pointer`}
          >
            <option value="">Selecciona un área</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <LayoutList size={13} />
            Tipo de reporte
          </label>
          <select
            value={filtros.tipo}
            onChange={(e) => seleccionarTipo(e.target.value)}
            disabled={sinArea}
            className={`${estiloControl} cursor-pointer`}
          >
            {tipos.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {filtros.tipo === 'especialidad' && (
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar size={13} />
              Especialidad
            </label>
            <select
              value={filtros.especialidad}
              onChange={(e) => actualizar('especialidad', e.target.value)}
              disabled={sinArea}
              className={`${estiloControl} cursor-pointer`}
            >
              <option value="todas">Todas</option>
              {especialidades.map((esp) => (
                <option key={esp} value={esp.toLowerCase()}>
                  {esp}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileText size={13} />
            Desde
          </label>
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => actualizar('desde', e.target.value)}
            disabled={sinArea}
            className={estiloControl}
          />
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileText size={13} />
            Hasta
          </label>
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => actualizar('hasta', e.target.value)}
            disabled={sinArea}
            className={estiloControl}
          />
        </div>
      </div>
    </div>
  )
}