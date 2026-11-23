'use client'

import { useState } from 'react'
import { AlertTriangle, ArrowRight, BarChart3, Layers3 } from 'lucide-react'
import type { ClienteCartera } from './cartera-ui'
import { formatoHoras } from '@/lib/utils'
import styles from './cartera-general.module.css'

const estados = [
  { clave: 'curso', nombre: 'En curso', color: '#35dc90' },
  { clave: 'limite', nombre: 'Bolsa próxima a agotarse', color: '#ffd140' },
  { clave: 'riesgo', nombre: 'En riesgo', color: '#fb5480' },
  { clave: 'sin_presupuesto', nombre: 'Sin presupuesto', color: '#a368f4' },
] as const

type Props = {
  clientes: ClienteCartera[]
  categorias: Record<(typeof estados)[number]['clave'], number>
  clientesEnRiesgo: ClienteCartera[]
  onAbrirCliente: (cliente: ClienteCartera) => void
  onVerRiesgo: () => void
}

export function CarteraDivisionGraficos({ clientes, categorias, clientesEnRiesgo, onAbrirCliente, onVerRiesgo }: Props) {
  const [verTodas, setVerTodas] = useState(false)
  const divisiones = new Map<number, { nombre: string; contratadas: number; consumidas: number }>()
  for (const cliente of clientes) {
    const grupo = divisiones.get(cliente.area_id) ?? { nombre: cliente.area_nombre, contratadas: 0, consumidas: 0 }
    grupo.contratadas += cliente.horasContratadas
    grupo.consumidas += cliente.horasConsumidas
    divisiones.set(cliente.area_id, grupo)
  }
  const filas = [...divisiones].sort(([, a], [, b]) => b.consumidas - a.consumidas || b.contratadas - a.contratadas || a.nombre.localeCompare(b.nombre, 'es'))
  let inicio = 0
  const segmentos = estados.map((estado) => {
    const cantidad = categorias[estado.clave]
    const porcentaje = clientes.length ? cantidad / clientes.length * 100 : 0
    const segmento = { ...estado, cantidad, porcentaje, inicio }
    inicio += porcentaje
    return segmento
  })
  const sectores = segmentos.filter(({ cantidad }) => cantidad > 0)
    .map(({ color, inicio, porcentaje }) => color + ' ' + inicio + '% ' + (inicio + porcentaje) + '%')

  return (
    <div className={styles.divisionCharts}>
      <section className={styles.panel}>
        <div className={styles.heading}>
          <div className={styles.chartTitle}><span className={styles.chartIcon}><Layers3 size={20} /></span><div><h3>Uso de horas por división</h3><p>Consumo respecto a las horas contratadas</p></div></div>
          {filas.length > 5 && <button type="button" className={styles.action} aria-expanded={verTodas} onClick={() => setVerTodas(!verTodas)}>{verTodas ? 'Ver menos' : 'Ver todas'} <ArrowRight size={14} /></button>}
        </div>
        <ul className={styles.divisionBars}>
          {(verTodas ? filas : filas.slice(0, 5)).map(([id, fila]) => {
            const porcentaje = fila.contratadas ? fila.consumidas / fila.contratadas * 100 : null
            const banda = porcentaje === null ? undefined : porcentaje > 90 ? 'critico' : porcentaje > 70 ? 'alto' : 'normal'
            return <li key={id}>
              <span className={styles.divisionName}><span className={styles.divisionGlyph}><BarChart3 size={14} /></span>{fila.nombre}</span>
              <div className={styles.divisionTrack} data-banda={banda}>
                <span style={{ width: Math.min(100, porcentaje ?? 0) + '%' }} />
                <strong>{porcentaje === null ? 'Sin bolsa' : Math.round(porcentaje) + '%'}</strong>
              </div>
              <span className={styles.divisionHours}>{formatoHoras(fila.consumidas)} / {formatoHoras(fila.contratadas)}</span>
            </li>
          })}
        </ul>
        {!filas.length && <p className={styles.message}>Sin divisiones con clientes para mostrar.</p>}
        {filas.length > 0 && <div className={styles.usageLegend}>
          <span data-banda="normal">Hasta 70%</span><span data-banda="alto">Más de 70% hasta 90%</span><span data-banda="critico">Más de 90%</span>
        </div>}
      </section>
      <div className={styles.divisionAside}>
        <section className={styles.panel}>
          <div className={styles.heading}><h3><Layers3 size={20} />Estado de la cartera</h3></div>
          <div className={styles.divisionStatus}>
            <div className={styles.divisionRing} style={{ background: sectores.length ? 'conic-gradient(' + sectores.join(',') + ')' : undefined }}>
              <span>Total<strong>{clientes.length}</strong>Clientes</span>
            </div>
            <ul className={styles.divisionLegend}>
              {segmentos.map(({ clave, nombre, color, cantidad, porcentaje }) => <li key={clave}>
                <i aria-hidden="true" style={{ background: color }} /><span>{nombre}</span><strong>{cantidad} · {Math.round(porcentaje)}%</strong>
              </li>)}
            </ul>
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.heading}>
            <h3><AlertTriangle className={styles.riskIcon} size={20} />Clientes con mayor riesgo</h3>
            {clientesEnRiesgo.length > 0 && <a className={styles.action} href="#clientes-cartera-division" onClick={onVerRiesgo}>Ver todos ({clientesEnRiesgo.length}) <ArrowRight size={14} /></a>}
          </div>
          {clientesEnRiesgo.length > 0 ? <ul className={styles.divisionRisks}>
            {clientesEnRiesgo.slice(0, 3).map((cliente) => <li key={cliente.id}>
              <button type="button" title={cliente.nombre} onClick={() => onAbrirCliente(cliente)}>{cliente.nombre}</button>
              <strong>{cliente.horasExcedidas > 0 ? '+' + formatoHoras(cliente.horasExcedidas) : 'En riesgo'}</strong>
            </li>)}
          </ul> : <p className={styles.message}>Sin clientes en riesgo en esta selección.</p>}
        </section>
      </div>
    </div>
  )
}
