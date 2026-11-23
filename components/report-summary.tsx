import { Clock, TrendingUp, Layers3, FileText } from 'lucide-react'
import type { Actividad } from '@/lib/types'
import { segundosReporte } from '@/lib/reporte-horas'
import { esFacturable, esNoFacturable, formatoHoras } from '@/lib/utils'
import styles from './reportes.module.css'

export function ReportSummary({ registros }: { registros: Actividad[] }) {
  let total = 0
  let facturables = 0
  let noFacturables = 0
  for (const registro of registros) {
    const segundos = segundosReporte(registro)
    total += segundos
    if (registro.estado === 'APROBADA' && esFacturable(registro.facturable)) facturables += segundos
    if (registro.estado === 'RECHAZADA' || (registro.estado === 'APROBADA' && esNoFacturable(registro.facturable))) noFacturables += segundos
  }
  const tarjetas = [
    { etiqueta: 'Total de horas', valor: formatoHoras(total / 3600), icono: Clock, tono: 'violeta' },
    { etiqueta: 'Horas facturables', valor: formatoHoras(facturables / 3600), icono: TrendingUp, tono: 'verde' },
    { etiqueta: 'Horas no facturables', valor: formatoHoras(noFacturables / 3600), icono: Layers3, tono: 'azul' },
    { etiqueta: 'Registros', valor: String(registros.length), icono: FileText, tono: 'ambar' },
  ]
  return <section className={styles.metrics} aria-label="Totales del reporte">
    {tarjetas.map(({ etiqueta, valor, icono: Icono, tono }) => (
      <article key={etiqueta} className={styles.metric} data-tono={tono}>
        <span className={styles.metricIcon}><Icono size={24} /></span>
        <div><h3>{etiqueta}</h3><strong>{valor}</strong></div>
      </article>
    ))}
  </section>
}
