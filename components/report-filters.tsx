'use client'

import { Calendar, FileText, LayoutList, Building2 } from 'lucide-react'
import { useAreas } from '@/lib/areas-context'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

export interface FiltrosReporte {
  areaId: string
  tipo: string
  desde: string
  hasta: string
  cargo: string
}

const tipos = [
  { id: 'mensual', etiqueta: 'Mensual' },
  { id: 'cargo', etiqueta: 'Por cargo' },
]

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
  // Los cargos salen del area elegida, o de TODAS las areas si no se ha elegido
  // ninguna. Antes el filtro de cargo se quedaba vacio y bloqueado hasta que se
  // elegia una division, aunque el reporte entero ya se podia ver sin division.
  const cargos = areaSeleccionada
    ? usuarios.filter((u) => u.area_id === areaSeleccionada.id && u.cargo)
    : usuarios.filter((u) => u.cargo)
  const cargosDisponibles = [...new Set(cargos.map((u) => u.cargo as string))].sort()

  const actualizar = <K extends keyof FiltrosReporte>(clave: K, valor: FiltrosReporte[K]) => {
    onChange({ ...filtros, [clave]: valor })
  }

  // Cambiar de division invalida el cargo: el cargo elegido puede no existir en la
  // nueva area y dejaria el reporte en cero sin avisar.
  const seleccionarArea = (areaId: string) => {
    if (divisionFija) return
    onChange({ ...filtros, areaId, cargo: 'todas' })
  }

  const seleccionarTipo = (tipo: string) => {
    onChange({ ...filtros, tipo, cargo: tipo === 'cargo' ? filtros.cargo : 'todas' })
  }

  const estiloControl =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div
        className={cn(
          'grid grid-cols-1 gap-4 md:grid-cols-2',
          filtros.tipo === 'cargo' ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
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
            <LayoutList size={13} />
            Tipo de reporte
          </label>
          <select
            value={filtros.tipo}
            onChange={(e) => seleccionarTipo(e.target.value)}
            className={`${estiloControl} cursor-pointer`}
          >
            {tipos.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {filtros.tipo === 'cargo' && (
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar size={13} />
              Cargo
            </label>
            <select
              value={filtros.cargo}
              onChange={(e) => actualizar('cargo', e.target.value)}
              className={`${estiloControl} cursor-pointer`}
            >
              <option value="todas">Todos</option>
              {cargosDisponibles.map((cargo) => <option key={cargo} value={cargo.toLowerCase()}>{cargo}</option>)}
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
