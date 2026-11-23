'use client'

import { Building2, CalendarDays, Filter } from 'lucide-react'
import { useAreas } from '@/lib/areas-context'
import { useAuth } from '@/lib/auth-context'
import { fechaLocalISO } from '@/lib/utils'
import styles from './reportes.module.css'

export interface FiltrosReporte {
  areaId: string
  desde: string
  hasta: string
}

export function ReportFilters({ filtros, onChange }: { filtros: FiltrosReporte; onChange: (filtros: FiltrosReporte) => void }) {
  const { areas } = useAreas()
  const { usuario } = useAuth()
  const elegirDivision = usuario?.rol === 'admin' || usuario?.rol === 'socio'
  const hoy = new Date()
  const actual = { desde: fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: fechaLocalISO(hoy) }
  const previo = { desde: fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), hasta: fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 0)) }
  return (
    <section className={styles.panel} aria-label="Filtros del reporte">
      <div className={styles.heading}>
        <h2><Filter size={19} />Filtros del reporte</h2>
        <div className={styles.quick} role="group" aria-label="Períodos rápidos">
          {[{ nombre: 'Este mes', rango: actual }, { nombre: 'Mes anterior', rango: previo }].map(({ nombre, rango }) => (
            <button type="button" key={nombre} aria-pressed={filtros.desde === rango.desde && filtros.hasta === rango.hasta}
              onClick={() => onChange({ ...filtros, ...rango })}>{nombre}</button>
          ))}
        </div>
      </div>
      <div className={styles.filters} data-division={elegirDivision}>
        {elegirDivision && <label><span><Building2 size={15} /> División</span>
          <select value={filtros.areaId} onChange={(e) => onChange({ ...filtros, areaId: e.target.value })}>
            <option value="">Todas las divisiones</option>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.nombre}</option>)}
          </select>
        </label>}
        <label><span><CalendarDays size={15} /> Desde</span><input type="date" value={filtros.desde} onChange={(e) => onChange({ ...filtros, desde: e.target.value })} /></label>
        <label><span><CalendarDays size={15} /> Hasta</span><input type="date" value={filtros.hasta} onChange={(e) => onChange({ ...filtros, hasta: e.target.value })} /></label>
      </div>
    </section>
  )
}
