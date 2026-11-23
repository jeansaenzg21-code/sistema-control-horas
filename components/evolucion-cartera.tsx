'use client'

import { BarChart3 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth-context'
import { opcionesApi } from '@/lib/api-cliente'
import { formatoHoras } from '@/lib/utils'
import styles from './cartera-general.module.css'

type Mes = { mes: string; contratadas: number; consumidas: number }
const nombreMes = new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' })
const escalaHoras = new Intl.NumberFormat('es-PE')

export function EvolucionCartera() {
  const { usuario, empresaActiva } = useAuth()
  const evolucion = useQuery({
    queryKey: ['cartera-evolucion-mensual', empresaActiva?.id, usuario?.id],
    enabled: Boolean(empresaActiva && usuario),
    queryFn: async ({ signal }) => {
      const respuesta = await fetch('/api/clientes/cartera?evolucion=1', opcionesApi({ signal }))
      if (!respuesta.ok) throw new Error('No se pudo cargar la evolución de horas.')
      return await respuesta.json() as Mes[]
    },
  })
  const meses = evolucion.data ?? []
  const mayor = Math.max(0, ...meses.flatMap((mes) => [mes.contratadas, mes.consumidas]))
  const paso = Math.max(10, Math.ceil(mayor / 60) * 10)
  const limite = paso * 6

  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div className={styles.chartTitle}>
          <span className={styles.chartIcon}><BarChart3 size={21} /></span>
          <div><h3>Evolución de horas</h3><p>Contratadas y consumidas por mes · últimos 6 meses</p></div>
        </div>
        <div className={styles.legend}><span>Contratadas</span><span>Consumidas</span></div>
      </div>
      {evolucion.isPending ? <p className={styles.message} role="status">Cargando evolución…</p>
        : evolucion.isError ? <p className={styles.message} role="alert">{evolucion.error.message} <button className={styles.action} type="button" onClick={() => void evolucion.refetch()}>Reintentar</button></p>
          : <div className={styles.chart}>
            <div className={styles.axis} aria-hidden="true">{[6, 5, 4, 3, 2, 1, 0].map((nivel) => <span key={nivel}>{escalaHoras.format(paso * nivel)} h</span>)}</div>
            <div className={styles.plotScroll}>
              <ul className={styles.plot} aria-label="Horas contratadas y consumidas por mes">
                {meses.map((mes) => {
                  const nombre = nombreMes.format(new Date(mes.mes + '-01T00:00:00Z')).replace('.', '')
                  return (
                    <li key={mes.mes}>
                      <div className={styles.bars}>
                        <span className={styles.contratadas} style={{ height: mes.contratadas / limite * 100 + '%' }} title={formatoHoras(mes.contratadas) + ' contratadas'} aria-hidden="true" />
                        <span className={styles.consumidas} style={{ height: mes.consumidas / limite * 100 + '%' }} title={formatoHoras(mes.consumidas) + ' consumidas'} aria-hidden="true" />
                      </div>
                      <span className={styles.month}>{nombre}</span>
                      <span className="sr-only">{formatoHoras(mes.contratadas)} contratadas y {formatoHoras(mes.consumidas)} consumidas</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>}
    </section>
  )
}
