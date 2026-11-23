import { ArrowUpRight, BriefcaseBusiness, Clock3, Layers3, UserRound, X } from 'lucide-react'
import type { ClienteCartera } from './cartera-ui'
import type { ResumenPresupuesto } from '@/lib/presupuestos/consultar'
import { formatoHoras } from '@/lib/utils'
import { estadosPresupuesto } from './resumen-solicitudes-presupuesto'
import styles from './cartera-general.module.css'

type Props = {
  cliente: ClienteCartera
  presupuesto: ResumenPresupuesto
  estado: string
  soloLectura: boolean
  procesando: boolean
  aviso: { ok: boolean; texto: string } | null
  onCerrar: () => void
  onGestion: () => void
  onAccion: (accion: 'APROBAR' | 'ACTIVAR_BOLSAS') => void
}

export function DetalleSolicitudPresupuesto({ cliente, presupuesto, estado, soloLectura, procesando, aviso, onCerrar, onGestion, onAccion }: Props) {
  const { icono: IconoEstado, tono } = estadosPresupuesto[presupuesto.estado]
  const accion = presupuesto.estado === 'EN_REVISION' ? 'APROBAR' : presupuesto.estado === 'APROBADO' ? 'ACTIVAR_BOLSAS' : null

  return (
    <aside className={styles.budgetDetail} aria-label="Detalle del presupuesto seleccionado">
      <header className={styles.detailHeader}>
        <div><span>Presupuesto #{presupuesto.id}</span><h3>{cliente.nombre}</h3><p>{cliente.area_nombre}</p></div>
        <button type="button" aria-label="Cerrar detalle" onClick={onCerrar}><X size={19} /></button>
      </header>
      <div className={styles.detailBody}>
        <div className={styles.detailFacts}>
          <div><span><Clock3 size={15} /> Horas detalladas</span><strong>{formatoHoras(presupuesto.totales.horasDetallado)}</strong></div>
          <div><span>Estado</span><strong className={styles.budgetBadge} data-cartera-tone={tono}><IconoEstado size={14} />{estado}</strong></div>
        </div>
        <p className={styles.detailSender}><UserRound size={15} /> Enviado por <strong>{presupuesto.creadoPor ?? '—'}</strong></p>
        <h4 className={styles.detailServicesTitle}><Layers3 size={18} /> Servicios incluidos <span>{presupuesto.servicios.length}</span></h4>
        {presupuesto.servicios.length ? <ul className={styles.detailServices}>
          {presupuesto.servicios.map((servicio) => <li key={servicio.id}>
            <div className={styles.detailServiceTitle}>
              <span className={styles.detailServiceIcon}><BriefcaseBusiness size={17} /></span>
              <strong>{servicio.nombre}</strong>
              <span>{formatoHoras(servicio.horas)}</span>
            </div>
            {servicio.asignaciones.length ? <ul className={styles.detailAssignees} aria-label="Responsables y horas asignadas">
              {servicio.asignaciones.map((persona) => <li key={persona.id}>
                <UserRound size={14} aria-hidden="true" /><span>{persona.usuarioNombre || persona.nombreTexto || 'Sin identificar'}</span>
                <strong>{formatoHoras(persona.horas)}</strong>
              </li>)}
            </ul> : <p className={styles.detailNoAssignees}>Sin desglose de responsables para este servicio.</p>}
          </li>)}
        </ul> : <p className={styles.detailNoAssignees}>Sin servicios para mostrar.</p>}
      </div>
      <footer className={styles.detailActions}>
        {aviso && <p role="status" data-ok={aviso.ok}>{aviso.texto}</p>}
        {!soloLectura && accion && <button type="button" disabled={procesando} className={styles.detailPrimary} onClick={() => onAccion(accion)}>
          {procesando ? 'Procesando…' : accion === 'APROBAR' ? 'Aprobar presupuesto' : 'Activar bolsas aprobadas'}
        </button>}
        <button type="button" className={styles.outlineAction} onClick={onGestion}>Abrir gestión de presupuestos <ArrowUpRight size={16} /></button>
      </footer>
    </aside>
  )
}
