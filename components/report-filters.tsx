'use client'

import { FileText, Building2 } from 'lucide-react'
import { useAreas } from '@/lib/areas-context'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

export interface FiltrosReporte {
  areaId: string
  tipo: string
  desde: string
  hasta: string
}

interface ReportFiltersProps {
  filtros: FiltrosReporte
  onChange: (filtros: FiltrosReporte) => void
}

export function ReportFilters({ filtros, onChange }: ReportFiltersProps) {
  const { areas } = useAreas()
  const { usuarios, usuario } = useAuth()
  // El jefe de área solo puede consultar su propia división: no es una preferencia
  // suya, es el tope de lo que la API le devuelve. Mostrarle un desplegable con
  // todas las áreas lo invite a elegir una que le va a salir vacía sin explicación.
  // Se le fija a la suya y se muestra como campo de solo lectura.
  const divisionFija = usuario?.rol === 'jefe_area'
  const areaBloqueada = divisionFija && usuario?.area_id != null ? String(usuario.area_id) : ''
  const areaSeleccionada = areas.find((a) => String(a.id) === (areaBloqueada || filtros.areaId))
  const actualizar = <K extends keyof FiltrosReporte>(clave: K, valor: FiltrosReporte[K]) => {
    onChange({ ...filtros, [clave]: valor })
  }

  // Cambiar de division invalida el cargo: el cargo elegido puede no existir en la
  // nueva area y dejaria el reporte en cero sin avisar.
  const seleccionarArea = (areaId: string) => {
    if (divisionFija) return
    onChange({ ...filtros, areaId })
  }

  const estiloControl =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div
        className={cn(
          'grid grid-cols-1 gap-4 md:grid-cols-2',
          'lg:grid-cols-3',
        )}
      >
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Building2 size={13} />
             División
          </label>
          <select
            value={areaBloqueada || filtros.areaId}
            onChange={(e) => seleccionarArea(e.target.value)}
            disabled={divisionFija && usuario?.area_id != null}
            className={cn(estiloControl, !divisionFija && 'cursor-pointer')}
          >
            {divisionFija && usuario?.area_id != null ? (
              <option value={String(usuario.area_id)}>
                {areas.find((a) => a.id === usuario.area_id)?.nombre ?? 'Tu división'}
              </option>
            ) : (
              <>
                <option value="">Selecciona una división</option>
                {areas.map((area) => (
                  <option key={area.id} value={String(area.id)}>
                    {area.nombre}
                  </option>
                ))}
              </>
            )}
          </select>
          {divisionFija && usuario?.area_id != null && (
            <p className="mt-1 text-[11px] text-muted-foreground">Sólo puedes consultar tu propia división.</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileText size={13} />
            Desde
          </label>
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => actualizar('desde', e.target.value)}
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
            className={estiloControl}
          />
        </div>
      </div>
    </div>
  )
}
