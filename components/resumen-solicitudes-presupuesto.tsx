import { AlertTriangle, CheckCircle2, ClipboardList, PieChart, Zap } from 'lucide-react'
import type { ClienteCartera } from './cartera-ui'
import type { ResumenPresupuesto } from '@/lib/presupuestos/consultar'
import styles from './cartera-general.module.css'

type Solicitud = { cliente: ClienteCartera; presupuesto: ResumenPresupuesto }
export const estadosPresupuesto = {
  APROBADO: { plural: 'Aprobados', tono: 'verde', color: '#35dc90', icono: CheckCircle2 },
  BORRADOR: { plural: 'Borradores', tono: 'ambar', color: '#ffd140', icono: ClipboardList },
  OBSERVADO: { plural: 'Observados', tono: 'rosa', color: '#fb5480', icono: AlertTriangle },
  EN_REVISION: { plural: 'Por aprobar', tono: 'violeta', color: '#a368f4', icono: ClipboardList },
} as const

const fechaActividad = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })

export function ResumenSolicitudesPresupuesto({ solicitudes }: { solicitudes: Solicitud[] }) {
  const total = solicitudes.length
  const conteos = { APROBADO: 0, BORRADOR: 0, OBSERVADO: 0, EN_REVISION: 0 }
  for (const { presupuesto } of solicitudes) conteos[presupuesto.estado]++
  let posicion = 0
  const resumen = Object.entries(estadosPresupuesto).map(([estado, dato]) => {
    const cantidad = conteos[estado as keyof typeof conteos]
    const porcentaje = total ? cantidad / total * 100 : 0
    const segmento = dato.color + ' ' + posicion + '% ' + (posicion + porcentaje) + '%'
    posicion += porcentaje
    return { estado, ...dato, cantidad, porcentaje, segmento }
  })
  const sectores = resumen.filter((dato) => dato.cantidad > 0).map((dato) => dato.segmento)
  const actividadReciente = solicitudes.map(({ cliente, presupuesto }) => {
    const revisionRegistrada = presupuesto.revisadoEn && (presupuesto.estado === 'APROBADO' || presupuesto.estado === 'OBSERVADO')
    const fecha = Date.parse((revisionRegistrada ? presupuesto.revisadoEn : presupuesto.creadoEn) ?? '')
    const evento = revisionRegistrada
      ? presupuesto.estado === 'APROBADO' ? 'Presupuesto aprobado' : 'Solicitud observada'
      : presupuesto.estado === 'APROBADO' ? 'Presupuesto dado de alta' : 'Solicitud registrada'
    return {
      id: presupuesto.id,
      cliente: cliente.nombre,
      evento,
      fecha,
      responsable: revisionRegistrada ? presupuesto.revisadoPor : presupuesto.creadoPor,
      ...estadosPresupuesto[presupuesto.estado],
    }
  }).filter((actividad) => Number.isFinite(actividad.fecha))
    .sort((a, b) => b.fecha - a.fecha || b.id - a.id).slice(0, 3)

  return (
    <aside className={styles.budgetAside} aria-label="Resumen de solicitudes">
      <section className={styles.panel}>
        <div className={styles.heading}>
          <div className={styles.chartTitle}><span className={styles.chartIcon}><PieChart size={21} /></span><div><h3>Resumen presupuestario</h3><p>Distribución de solicitudes por estado</p></div></div>
        </div>
        <div className={styles.divisionStatus}>
          <div className={styles.divisionRing} style={sectores.length ? { background: 'conic-gradient(' + sectores.join(',') + ')' } : undefined}>
            <span><strong>{total}</strong>Presupuestos</span>
          </div>
          <ul className={styles.budgetLegend}>
            {resumen.map(({ estado, plural, cantidad, porcentaje, color }) => <li key={estado}>
              <i aria-hidden="true" style={{ background: color }} /><span>{plural}</span><strong>{cantidad}</strong><span>{porcentaje.toFixed(1)}%</span>
            </li>)}
          </ul>
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.heading}>
          <div className={styles.chartTitle}><span className={styles.chartIcon}><Zap size={21} /></span><div><h3>Actividad reciente</h3><p>Últimos registros y revisiones</p></div></div>
        </div>
        {actividadReciente.length ? <ul className={styles.budgetActivity}>
          {actividadReciente.map(({ id, icono: Icono, tono, fecha, evento, cliente, responsable }) => <li key={id} data-cartera-tone={tono}>
            <span className={styles.metricIcon}><Icono size={17} /></span>
            <div><strong>{evento}</strong><p>{cliente}{responsable && ' · ' + responsable}</p></div>
            <time dateTime={new Date(fecha).toISOString()}>{fechaActividad.format(fecha)}</time>
          </li>)}
        </ul> : <p className={styles.message}>Sin actividad reciente para esta selección.</p>}
      </section>
    </aside>
  )
}
