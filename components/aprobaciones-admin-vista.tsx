'use client'

import { useId, useState } from 'react'
import { AlertTriangle, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Eye, Layers3, Search, User, X } from 'lucide-react'
import type { Actividad } from '@/lib/actividad-context'
import { datosFaltantesActividad, textoDatosFaltantes } from '@/lib/cumplimiento'
import { fechaLocalISO, primerNombreYApellido } from '@/lib/utils'
import { DateRangeFilter } from './date-range-filter'
import { FacturableBadge } from './facturable-badge'
import { StatusBadge } from './status-badge'
import styles from './aprobaciones-admin.module.css'

export type PeriodoAprobaciones = { desde: string; hasta: string }
const fechaCorta = (iso: string) => iso ? iso.split('-').reverse().join('/') : '—'
const etiquetasDia = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fechaLima = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'America/Lima' })
const MS_POR_DIA = 86_400_000

function periodoTendencia(periodo: PeriodoAprobaciones) {
  if (periodo.desde && periodo.hasta) return periodo
  const lunes = new Date(fechaLima.format(new Date()) + 'T00:00:00Z')
  lunes.setUTCDate(lunes.getUTCDate() - (lunes.getUTCDay() + 6) % 7)
  const domingo = new Date(lunes.getTime() + 6 * MS_POR_DIA)
  return { desde: lunes.toISOString().slice(0, 10), hasta: domingo.toISOString().slice(0, 10) }
}

export function PeriodoAprobacionesControl({ periodo, onChange, permitirTodas = true, etiqueta }: { etiqueta?: string; periodo: PeriodoAprobaciones; onChange: (periodo: PeriodoAprobaciones) => void; permitirTodas?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState(periodo)
  return <div className={styles.periodo}>
    <button type="button" className={styles.control} aria-expanded={abierto} onClick={() => { setBorrador(periodo); setAbierto(!abierto) }}>
      <CalendarDays size={19} />{etiqueta ?? (periodo.desde ? fechaCorta(periodo.desde) + ' – ' + fechaCorta(periodo.hasta) : 'Todas las fechas')}<ChevronDown size={16} />
    </button>
    {abierto && <form className={styles.popover} onKeyDown={(evento) => { if (evento.key === 'Escape') setAbierto(false) }} onSubmit={(evento) => { evento.preventDefault(); onChange(borrador); setAbierto(false) }}>
      <DateRangeFilter {...borrador} onChange={(desde, hasta) => setBorrador({ desde, hasta })} />
      <div className={styles.periodoActions}>
        {permitirTodas && <button type="button" className={styles.control} onClick={() => { onChange({ desde: '', hasta: '' }); setAbierto(false) }}>Todas las fechas</button>}
        <button type="submit" className={styles.primary} disabled={!borrador.desde || !borrador.hasta || borrador.desde > borrador.hasta}>Aplicar</button>
      </div>
    </form>}
  </div>
}

export type FiltroAdmin = 'pendientes' | 'aprobadas' | 'rechazadas' | 'correccion' | 'todas'
const filtros = [
  { clave: 'pendientes', titulo: 'Pendientes', icono: Clock },
  { clave: 'aprobadas', titulo: 'Aprobadas', icono: Check },
  { clave: 'rechazadas', titulo: 'Rechazadas', icono: X },
  { clave: 'correccion', titulo: 'Corrección', icono: AlertTriangle },
  { clave: 'todas', titulo: 'Todas', icono: Layers3 },
] as const

export function fechaDeRegistro(fila: Actividad): string {
  return fechaLocalISO(fila.created_at || fila.inicio)
}

function Resumen({ registros, periodo, cargando }: { registros: Actividad[]; periodo: PeriodoAprobaciones; cargando: boolean }) {
  const id = useId()
  const estados = [
    { estado: 'APROBADA', nombre: 'Aprobadas', color: '#a44df6' },
    { estado: 'PENDIENTE_APROBACION', nombre: 'Pendientes', color: '#a09aac' },
    { estado: 'RECHAZADA', nombre: 'Rechazadas', color: '#fb5480' },
    { estado: 'CORRECCION_SOLICITADA', nombre: 'Corrección', color: '#f5b849' },
  ] as const
  let inicio = 0
  const datos = estados.map((dato) => {
    const cantidad = registros.filter((registro) => registro.estado === dato.estado).length
    const porcentaje = registros.length ? cantidad / registros.length * 100 : 0
    const sector = dato.color + ' ' + inicio + '% ' + (inicio + porcentaje) + '%'
    inicio += porcentaje
    return { ...dato, cantidad, porcentaje, sector }
  })
  const sectores = datos.filter((dato) => dato.cantidad > 0).map((dato) => dato.sector)
  const rango = periodoTendencia(periodo)
  const inicioRango = Date.parse(rango.desde + 'T00:00:00Z')
  const finRango = Date.parse(rango.hasta + 'T00:00:00Z')
  const cantidadDias = (finRango - inicioRango) / MS_POR_DIA + 1
  const diasPorPunto = Math.max(1, Math.ceil(cantidadDias / 42))
  const puntosPorPeriodo = Array.from({ length: Math.ceil(cantidadDias / diasPorPunto) }, (_, indice) => {
    const desde = inicioRango + indice * diasPorPunto * MS_POR_DIA
    const hasta = Math.min(finRango, desde + (diasPorPunto - 1) * MS_POR_DIA)
    const etiqueta = etiquetasDia.format(desde)
    return { etiqueta, fechas: desde === hasta ? etiqueta : etiqueta + ' – ' + etiquetasDia.format(hasta), total: 0 }
  })
  for (const registro of registros) {
    const fecha = Date.parse(fechaDeRegistro(registro) + 'T00:00:00Z')
    if (fecha >= inicioRango && fecha <= finRango) {
      const indice = Math.floor((fecha - inicioRango) / (MS_POR_DIA * diasPorPunto))
      puntosPorPeriodo[indice].total += 1
    }
  }
  const maximo = Math.max(0, ...puntosPorPeriodo.map(({ total }) => total))
  const rangoVisible = etiquetasDia.format(inicioRango) + ' – ' + etiquetasDia.format(finRango)
  const paso = Math.max(10, Math.ceil(maximo / 40) * 10)
  const ultimoX = Math.max(667, 61 + (puntosPorPeriodo.length - 1) * 72)
  const anchoGrafico = ultimoX + 33
  const puntos = puntosPorPeriodo.map(({ total }, i) => ({
    x: puntosPorPeriodo.length === 1 ? anchoGrafico / 2 : 61 + i * (ultimoX - 61) / (puntosPorPeriodo.length - 1),
    y: 129 - total / (paso * 4) * 112,
  }))
  const trazo = puntos.map(({ x, y }) => x + ',' + y).join(' ')
  return <div className={styles.resumen}>
    <section className={styles.panel} aria-label="Resumen de solicitudes">
      <h2 className={`${styles.heading} ${styles.soloMovil}`}><Layers3 size={19} />Resumen</h2>
      <div className={styles.resumenEstados}>
        <div className={styles.ring} style={sectores.length ? { background: 'conic-gradient(' + sectores.join(',') + ')' } : undefined}>
          <div><strong>{Math.round(datos[0].porcentaje)}%</strong><span>Aprobación</span></div>
        </div>
        <div className={styles.resumenDatos}>
          <p><strong>{registros.length}</strong> Total de solicitudes</p>
          <ul>{datos.map(({ estado, nombre, color, cantidad, porcentaje }) => <li key={estado}><i style={{ background: color }} />{nombre}<strong>{cantidad} <small>({Math.round(porcentaje)}%)</small></strong></li>)}</ul>
        </div>
      </div>
    </section>
    <section className={styles.panel}>
      <h2 className={styles.heading}><CalendarDays size={19} /> Tendencia de solicitudes <small>{rangoVisible}</small></h2>
      {diasPorPunto > 1 && <p className={styles.trendNote}>Totales agrupados en bloques de {diasPorPunto} días.</p>}
      {!maximo && <p role="status" className={styles.trendNote}>{cargando ? 'Cargando tendencia…' : 'No hay solicitudes en estas fechas.'}</p>}
      <div className={styles.trend} data-sin-registros={!maximo}>
        <svg viewBox={'0 0 ' + anchoGrafico + ' 160'} style={puntos.length > 7 ? { minWidth: anchoGrafico } : undefined}
          role="img" aria-label={puntosPorPeriodo.map(({ fechas, total }) => fechas + ': ' + total).join(', ')}>
          <defs><linearGradient id={id} x2="0" y2="1"><stop stopColor="#a038f1" stopOpacity=".63" /><stop offset="100%" stopColor="#a038f1" stopOpacity="0" /></linearGradient></defs>
          {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line x1="48" x2={anchoGrafico - 20} y1={129 - tick * 28} y2={129 - tick * 28} /><text x="31" y={129 - tick * 28 + 4} textAnchor="end">{tick * paso}</text></g>)}
          {maximo > 0 && <>
            <polygon points={puntos[0].x + ',129 ' + trazo + ' ' + puntos[puntos.length - 1].x + ',129'} fill={'url(#' + id + ')'} />
            <polyline points={trazo} fill="none" stroke="#bf5bff" strokeWidth="3" strokeLinejoin="round" />
          </>}
          {puntos.map(({ x, y }, indice) => <g key={indice}>
            {maximo > 0 && <circle cx={x} cy={y} r="3.8" fill="#ab47f6" stroke="#fff"><title>{puntosPorPeriodo[indice].fechas} · {puntosPorPeriodo[indice].total} solicitudes</title></circle>}
            <text x={x} y="151" textAnchor="middle">{puntosPorPeriodo[indice].etiqueta}</text>
          </g>)}
        </svg>
      </div>
    </section>
  </div>
}

type Props = {
  registros: Actividad[]
  filas: Actividad[]
  areas: Array<{ id: number; nombre: string }>
  area: string
  busqueda: string
  filtro: FiltroAdmin
  puedeRevisar: boolean
  filtrarDivision: boolean
  periodo: PeriodoAprobaciones
  pendientesSeleccionables: number
  seleccionadas: ReadonlySet<number>
  todasSeleccionadas: boolean
  pagina: number
  paginas: number
  procesando: string | null
  cargando: boolean
  onArea: (area: string) => void
  onBusqueda: (busqueda: string) => void
  onFiltro: (filtro: FiltroAdmin) => void
  onSeleccionarTodas: () => void
  onSeleccionar: (id: number) => void
  onPagina: (pagina: number) => void
  onAprobar: (fila: Actividad) => void
  onRechazar: (fila: Actividad) => void
  onDetalle: (fila: Actividad) => void
  onAprobarSeleccionadas: () => void
  duracion: (fila: Actividad) => string
}

export function AprobacionesAdminVista(props: Props) {
  const { registros, filas, filtro, area, busqueda, areas, periodo, pagina, paginas, seleccionadas, pendientesSeleccionables, todasSeleccionadas, procesando, cargando } = props
  const pendientes = registros.filter((fila) => fila.estado === 'PENDIENTE_APROBACION').length
  const seleccionar = props.puedeRevisar && filtro === 'pendientes'
  return <div className={styles.vista} data-revision={props.puedeRevisar}>
    <Resumen registros={registros} periodo={periodo} cargando={cargando} />
    <div className={styles.toolbar}>
      <div className={styles.tabs} role="group" aria-label="Estado de la solicitud">
        {filtros.map(({ clave, titulo, icono: Icono }) => <button type="button" key={clave} aria-label={clave === 'pendientes' ? titulo + ' (' + pendientes + ')' : titulo} title={titulo} aria-pressed={clave === filtro} onClick={() => props.onFiltro(clave)}><Icono size={17} aria-hidden="true" /><span className={styles.etiquetaFiltro}>{titulo}</span>{clave === 'pendientes' && <span>{pendientes}</span>}</button>)}
      </div>
      <div className={styles.busqueda}>
        <label><Search size={17} /><input value={busqueda} onChange={(evento) => props.onBusqueda(evento.target.value)} aria-label="Buscar solicitud" placeholder="Buscar solicitud…" /></label>
        {props.filtrarDivision && <select aria-label="División" value={area} onChange={(evento) => props.onArea(evento.target.value)}>
          <option value="">Todas las divisiones</option>{areas.map((division) => <option value={division.id} key={division.id}>{division.nombre}</option>)}
        </select>}
      </div>
    </div>
    <section className={`${styles.panel} ${styles.listaSolicitudes}`} aria-busy={cargando}>
      <h2 className={styles.heading}><Layers3 size={20} />{seleccionar ? 'Solicitudes por aprobar' : props.puedeRevisar ? 'Solicitudes de aprobación' : 'Mis solicitudes'}</h2>
      {props.puedeRevisar && <ul className={styles.tarjetasRevision}>
        {filas.map((fila) => {
          const cliente = fila.cliente_nombre || 'Sin cliente'
          const iniciales = fila.cliente_nombre?.trim().split(/\s+/).slice(0, 2).map((parte) => parte.charAt(0)).join('') || '—'
          const pendiente = fila.estado === 'PENDIENTE_APROBACION'
          const faltantes = pendiente ? datosFaltantesActividad(fila) : []
          return <li key={fila.id} className={styles.tarjetaRevision} data-estado={fila.estado}>
            <div className={styles.cabeceraTarjeta}>
              {seleccionar && <label className={styles.casillaTarjeta}>
                <input type="checkbox" aria-label={'Seleccionar registro ' + fila.id} checked={seleccionadas.has(fila.id)} onChange={() => props.onSeleccionar(fila.id)} />
              </label>}
              <span className={styles.avatarTarjeta} aria-hidden="true">{iniciales}</span>
              <div className={styles.contenidoTarjeta}>
                <div className={styles.tituloTarjeta}><strong>{cliente}</strong><strong>{props.duracion(fila)}</strong></div>
                <p className={styles.actividadTarjeta}>{fila.tipo_actividad_nombre || 'Registro de horas'}</p>
                <div className={styles.metaTarjeta}>
                  <span><User size={13} aria-hidden="true" />{fila.usuario_nombre ? primerNombreYApellido(fila.usuario_nombre) : '—'}</span>
                  <span><CalendarDays size={13} aria-hidden="true" />{fechaCorta(fechaLocalISO(fila.inicio))}</span>
                </div>
                <div className={styles.marcasTarjeta}>
                  <FacturableBadge valor={fila.facturable} />
                  {faltantes.length > 0 && <span className={styles.faltantes} title={textoDatosFaltantes(faltantes)}><AlertTriangle size={13} />Datos pendientes</span>}
                </div>
                <span className="sr-only"><StatusBadge estado={fila.estado} /></span>
              </div>
            </div>
            <div className={styles.accionesTarjeta} data-pendiente={pendiente}>
              {pendiente && <>
                <button type="button" className={styles.primary} disabled={procesando === 'aprobar-' + fila.id} onClick={() => props.onAprobar(fila)}><Check size={16} />Aprobar</button>
                <button type="button" className={styles.control} onClick={() => props.onRechazar(fila)}><X size={16} />Rechazar</button>
              </>}
              <button type="button" className={styles.control} aria-label={'Ver detalle del registro ' + fila.id} onClick={() => props.onDetalle(fila)}><ChevronRight size={17} /></button>
            </div>
          </li>
        })}
        {!filas.length && <li className={styles.empty}>{cargando ? 'Cargando solicitudes…' : 'No hay solicitudes para estos filtros.'}</li>}
      </ul>}
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead><tr>
            {seleccionar && <th scope="col"><span className="sr-only">Seleccionar solicitud</span></th>}
            {['Cliente / División', 'Solicitud', 'Fecha de actividad', 'Horas', 'Responsable', 'Estado', 'Fecha de registro', 'Acción'].map((columna) => <th key={columna} scope="col">{columna}</th>)}
          </tr></thead>
          <tbody>
            {filas.map((fila) => {
              const cliente = fila.cliente_nombre || 'Sin cliente'
              const iniciales = fila.cliente_nombre?.trim().split(/\s+/).slice(0, 2).map((parte) => parte.charAt(0)).join('') || '—'
              const pendiente = fila.estado === 'PENDIENTE_APROBACION'
              const faltantes = pendiente ? datosFaltantesActividad(fila) : []
              return <tr key={fila.id}>
                {seleccionar && <td><label><input type="checkbox" aria-label={'Seleccionar registro ' + fila.id} checked={seleccionadas.has(fila.id)} onChange={() => props.onSeleccionar(fila.id)} /></label></td>}
                <td><div className={styles.cliente}><span aria-hidden="true">{iniciales}</span><div><strong>{cliente}</strong><small>{fila.area_nombre || 'Sin división'}</small></div></div></td>
                <td><button type="button" className={styles.solicitud} title={fila.descripcion || undefined} onClick={() => props.onDetalle(fila)}>{fila.tipo_actividad_nombre || 'Registro de horas'}</button>
                  {faltantes.length > 0 && <small className={styles.faltantes} title={textoDatosFaltantes(faltantes)}><AlertTriangle size={13} />Datos pendientes</small>}</td>
                <td className={styles.fechaActividad}><CalendarDays className={styles.soloMovil} size={13} aria-hidden="true" />{fechaCorta(fechaLocalISO(fila.inicio))}</td>
                <td><strong>{props.duracion(fila)}</strong><div><FacturableBadge valor={fila.facturable} /></div></td>
                <td title={fila.usuario_nombre}>{fila.usuario_nombre ? primerNombreYApellido(fila.usuario_nombre) : '—'}</td>
                <td><StatusBadge estado={fila.estado} /></td>
                <td>{fechaCorta(fechaDeRegistro(fila))}</td>
                <td><div className={styles.acciones}>
                  {props.puedeRevisar && pendiente && <><button type="button" className={styles.primary} disabled={procesando === 'aprobar-' + fila.id} onClick={() => props.onAprobar(fila)}><Check size={16} /> Aprobar</button><button type="button" className={styles.control} onClick={() => props.onRechazar(fila)}><X size={16} /> Rechazar</button></>}
                  <button type="button" className={styles.control} aria-label={'Ver detalle del registro ' + fila.id} onClick={() => props.onDetalle(fila)}><Eye className={styles.iconoDetalle} size={16} /><ChevronRight className={styles.soloMovil} size={17} /></button>
                </div></td>
              </tr>
            })}
            {!filas.length && <tr><td colSpan={seleccionar ? 9 : 8} className={styles.empty}>{cargando ? 'Cargando solicitudes…' : 'No hay solicitudes para estos filtros.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <footer className={styles.footer}>
        {seleccionar && seleccionadas.size > 0 && <div className={styles.lote}><label><input type="checkbox" checked={todasSeleccionadas} disabled={!pendientesSeleccionables} onChange={props.onSeleccionarTodas} />Seleccionar todas ({pendientesSeleccionables})</label><button type="button" className={styles.primary} disabled={!seleccionadas.size} onClick={props.onAprobarSeleccionadas}>Aprobar seleccionadas ({seleccionadas.size})</button></div>}
        <div className={styles.paginacion}>
          <button type="button" className={styles.control} aria-label="Página anterior" disabled={pagina <= 1} onClick={() => props.onPagina(pagina - 1)}><ChevronLeft size={17} /></button>
          <span>{pagina} de {paginas}</span>
          <button type="button" className={styles.control} aria-label="Página siguiente" disabled={pagina >= paginas} onClick={() => props.onPagina(pagina + 1)}><ChevronRight size={17} /></button>
        </div>
      </footer>
    </section>
  </div>
}
