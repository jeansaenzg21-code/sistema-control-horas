'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock3, Layers3, List, TriangleAlert, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { opcionesApi } from '@/lib/api-cliente'
import { segundosReporte } from '@/lib/reporte-horas'
import type { Actividad } from '@/lib/types'
import { esFacturable, esNoFacturable, fechaLocalISO } from '@/lib/utils'
import { StatusBadge } from './status-badge'
import styles from './cronograma-actividades.module.css'

type Vista = 'semana' | 'dia' | 'lista'
const PERU = 'America/Lima'
const horaLocal = new Intl.DateTimeFormat('es-PE', { timeZone: PERU, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const diaCorto = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric' })
const diaCompleto = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
const hoyLima = new Intl.DateTimeFormat('en-CA', { timeZone: PERU, year: 'numeric', month: '2-digit', day: '2-digit' })
const modos = [{ id: 'semana', texto: 'Semana', Icono: CalendarRange }, { id: 'dia', texto: 'Día', Icono: CalendarDays }, { id: 'lista', texto: 'Lista', Icono: List }] as const

function fecha(dia: string) { return new Date(dia + 'T12:00:00') }
function sumarDias(dia: string, cantidad: number) {
  const valor = fecha(dia)
  valor.setDate(valor.getDate() + cantidad)
  return fechaLocalISO(valor)
}
function lunesDe(dia: string) { return sumarDias(dia, -((fecha(dia).getDay() + 6) % 7)) }
function etiquetaHora(minutos: number) {
  return String(Math.floor(minutos / 60)).padStart(2, '0') + ':' + String(minutos % 60).padStart(2, '0')
}
function minutosDe(valor: string) {
  const [horas, minutos] = horaLocal.format(new Date(valor)).split(':').map(Number)
  return horas * 60 + minutos
}
function horas(segundos: number) {
  const minutos = Math.floor(segundos / 60)
  const h = Math.floor(minutos / 60)
  return [h ? h + ' h' : '', minutos % 60 ? minutos % 60 + ' min' : ''].filter(Boolean).join(' ') || '0 min'
}
function titulo(registro: Actividad) { return registro.tipo_actividad_nombre || registro.descripcion || 'Registro de horas' }
function tramo(registro: Actividad) {
  return horaLocal.format(new Date(registro.inicio)) + ' – ' + (registro.fin ? horaLocal.format(new Date(registro.fin)) : 'En curso')
}
function distribuir(registros: Actividad[]) {
  const finales: number[] = []
  const bloques = registros.map((registro) => {
    const inicio = minutosDe(registro.inicio)
    const finalReal = registro.fin ? minutosDe(registro.fin) : inicio + 40
    const fin = finalReal < inicio ? 1440 : Math.min(1440, Math.max(inicio + 20, finalReal))
    const disponible = finales.findIndex((valor) => valor <= inicio)
    const carril = disponible < 0 ? finales.length : disponible
    finales[carril] = fin
    return { registro, inicio, fin, carril }
  })
  return { bloques, carriles: Math.max(1, finales.length) }
}

export function CronogramaActividades() {
  const { usuario, empresaActiva } = useAuth()
  const hoy = hoyLima.format(new Date())
  const [dia, setDia] = useState(hoy)
  const [vista, setVista] = useState<Vista>('semana')
  const [detalle, setDetalle] = useState<Actividad | null>(null)
  const lunes = lunesDe(dia)
  const domingo = sumarDias(lunes, 6)
  const { data, isError, refetch } = useQuery({
    queryKey: ['cronograma-actividades', empresaActiva?.id, usuario?.id, lunes],
    enabled: Boolean(usuario && empresaActiva),
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const filas: Actividad[] = []
      const limite = 1000
      const params = new URLSearchParams({ usuario_id: String(usuario?.id), desde: lunes, hasta: domingo, limite: String(limite) })
      for (let offset = 0; ; offset += limite) {
        params.set('offset', String(offset))
        const res = await fetch('/api/actividades?' + params, opcionesApi({ signal }))
        const cuerpo = await res.json()
        if (!res.ok || !Array.isArray(cuerpo)) throw new Error('No se pudo cargar el cronograma.')
        filas.push(...cuerpo.filter((fila: Actividad) => Number(fila.usuario_id) === usuario?.id))
        if (cuerpo.length < limite || offset + cuerpo.length >= Number(res.headers.get('X-Total') || Infinity)) break
      }
      return filas.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
    },
  })

  const registros = data ?? []
  const porDia = Array.from({ length: 7 }, (_, indice) => {
    const fechaDia = sumarDias(lunes, indice)
    return { fechaDia, registros: registros.filter((registro) => hoyLima.format(new Date(registro.inicio)) === fechaDia) }
  })
  const columnas = porDia.filter(({ fechaDia, registros: filas }, indice) =>
    vista === 'dia' ? fechaDia === dia : indice < 5 || filas.length > 0 || fechaDia === dia,
  )
  const agenda = columnas.map(({ fechaDia, registros: filas }) => ({ fechaDia, filas, ...distribuir(filas) }))
  const bloques = agenda.flatMap((columna) => columna.bloques)
  const primeraHora = Math.floor(Math.min(480, ...bloques.map((bloque) => bloque.inicio)) / 60)
  const minutoFinal = Math.ceil(Math.max(1140, ...bloques.map((bloque) => bloque.fin)) / 60) * 60
  const horasVisibles = minutoFinal / 60 - primeraHora
  const total = registros.reduce((suma, registro) => suma + segundosReporte(registro), 0)
  const facturables = registros.filter((registro) => esFacturable(registro.facturable)).reduce((suma, registro) => suma + segundosReporte(registro), 0)
  const noFacturables = registros.filter((registro) => esNoFacturable(registro.facturable)).reduce((suma, registro) => suma + segundosReporte(registro), 0)
  const porDefinir = Math.max(0, total - facturables - noFacturables)
  const pendientes = registros.filter((registro) => registro.estado === 'PENDIENTE_APROBACION')
  const recientes = [...registros].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3)
  const porcentaje = (valor: number) => total ? Math.round(valor / total * 100) : 0
  const mover = (cantidad: number) => { setDetalle(null); setDia(sumarDias(vista === 'dia' ? dia : lunes, cantidad * (vista === 'dia' ? 1 : 7))) }

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <header className={styles.hero}>
          <span className={styles.icon}><CalendarRange size={26} /></span>
          <div><h2>Mi cronograma semanal</h2><p>Consulta tus actividades por día y hora.</p></div>
        </header>
        <div className={styles.toolbar}>
          <button type="button" onClick={() => mover(-1)} aria-label="Período anterior"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => mover(1)} aria-label="Período siguiente"><ChevronRight size={18} /></button>
          <strong>{vista === 'dia' ? diaCompleto.format(fecha(dia)) : diaCompleto.formatRange(fecha(lunes), fecha(domingo))}</strong>
          <button type="button" onClick={() => { setDia(hoy); setDetalle(null) }}>{vista === 'dia' ? 'Hoy' : 'Semana actual'}</button>
          <div className={styles.modes} role="group" aria-label="Vista del cronograma">
            {modos.map(({ id, texto, Icono }) => <button key={id} type="button" aria-pressed={vista === id} onClick={() => setVista(id)}><Icono size={16} />{texto}</button>)}
          </div>
        </div>
        {isError && !data ? <p role="alert" className={styles.message}>No se pudo cargar el cronograma. <button type="button" onClick={() => void refetch()}>Reintentar</button></p>
          : !data ? <p role="status" className={styles.message}>Cargando actividades…</p>
            : <section className={styles.panel} aria-label="Actividades del período">
              {!registros.length && <p className={styles.message}>No hay actividades registradas esta semana.</p>}
              {vista === 'lista' ? <div className={styles.list}>
                {porDia.filter(({ registros: filas }) => filas.length > 0).map(({ fechaDia, registros: filas }) =>
                  <section key={fechaDia}><h3>{diaCorto.format(fecha(fechaDia))}</h3>{filas.map((registro) => <button type="button" key={registro.id} onClick={() => setDetalle(registro)}><span><strong>{titulo(registro)}</strong><small>{registro.cliente_nombre || 'Sin cliente'} · {tramo(registro)}</small></span><StatusBadge estado={registro.estado} /></button>)}</section>,
                )}
              </div> : <div className={styles.scroll}>
                <div className={styles.calendar} style={{ gridTemplateColumns: '53px repeat(' + agenda.length + ', minmax(' + (vista === 'dia' ? '0' : '120px') + ', 1fr))' }}>
                  <div className={styles.dayHeading} aria-hidden="true" />
                  {agenda.map(({ fechaDia, filas }) => <div className={styles.dayHeading} key={fechaDia} data-today={fechaDia === hoy}><strong>{diaCorto.format(fecha(fechaDia))}</strong><small>{horas(filas.reduce((suma, fila) => suma + segundosReporte(fila), 0))}</small></div>)}
                  <div className={styles.axis} aria-hidden="true">
                    {Array.from({ length: horasVisibles + 1 }, (_, indice) => <span key={indice}>{etiquetaHora((primeraHora + indice) * 60)}</span>)}
                  </div>
                  {agenda.map(({ fechaDia, bloques: eventos, carriles }) => <div key={fechaDia} className={styles.track}>
                    {eventos.map(({ registro, inicio, fin, carril }) => <button key={registro.id} type="button" className={styles.event} data-status={registro.estado} aria-label={titulo(registro) + ', ' + tramo(registro)} title={titulo(registro) + ' · ' + tramo(registro)} onClick={() => setDetalle(registro)} style={{
                      top: 'calc(var(--hour) * ' + (inicio / 60 - primeraHora) + ')',
                      height: 'calc(var(--hour) * ' + ((fin - inicio) / 60) + ' - 2px)',
                      left: 'calc(' + (carril / carriles * 100) + '% + 3px)',
                      width: 'calc(' + (100 / carriles) + '% - 6px)',
                    }}><strong>{titulo(registro)}</strong><small>{registro.cliente_nombre || 'Sin cliente'}</small><small>{tramo(registro)}</small></button>)}
                  </div>)}
                </div>
              </div>}
              <footer className={styles.legend}>
                <span data-status="APROBADA">Aprobada</span><span data-status="PENDIENTE_APROBACION">Pendiente</span><span data-status="CORRECCION_SOLICITADA">En corrección</span><span data-status="RECHAZADA">Rechazada</span>
                <strong>Total semanal · {horas(total)}</strong>
              </footer>
            </section>}
      </div>
      <aside className={styles.aside} aria-label="Resumen del cronograma">
        {detalle && <section className={styles.panel}>
          <h3><CalendarDays size={17} />Detalle de actividad <button type="button" onClick={() => setDetalle(null)} aria-label="Cerrar detalle"><X size={17} /></button></h3>
          <div className={styles.detail}><strong>{titulo(detalle)}</strong><StatusBadge estado={detalle.estado} /><p>{detalle.cliente_nombre || 'Sin cliente'} · {tramo(detalle)}</p>{detalle.descripcion && detalle.descripcion !== titulo(detalle) && <p>{detalle.descripcion}</p>}</div>
        </section>}
        <section className={styles.panel}>
          <h3><BarChart3 size={18} />Resumen de la semana</h3>
          <div className={styles.metrics}>
            {[['Horas registradas', total], ['Facturables', facturables], ['No facturables', noFacturables], ['Por definir', porDefinir]].map(([etiqueta, valor]) =>
              <div key={etiqueta}><strong>{data ? horas(Number(valor)) : '—'}</strong><small>{etiqueta}</small></div>,
            )}
          </div>
        </section>
        {data && <>
          <section className={styles.panel}>
            <h3><Layers3 size={18} />Distribución de horas</h3>
            <div className={styles.distribution}>
              <div className={styles.ring} style={{ background: total ? 'conic-gradient(#9844ed 0 ' + porcentaje(facturables) + '%, #ba95eb 0 ' + porcentaje(facturables + noFacturables) + '%, var(--border) 0)' : 'var(--border)' }}><strong>{horas(total)}</strong></div>
              <ul><li>Facturables <strong>{horas(facturables)} ({porcentaje(facturables)} %)</strong></li><li>No facturables <strong>{horas(noFacturables)} ({porcentaje(noFacturables)} %)</strong></li>{porDefinir > 0 && <li>Por definir <strong>{horas(porDefinir)} ({porcentaje(porDefinir)} %)</strong></li>}</ul>
            </div>
          </section>
          <section className={styles.panel}>
            <h3><TriangleAlert size={18} />Pendientes de aprobación ({pendientes.length})</h3>
            <div className={styles.entries}>{pendientes.length ? pendientes.map((registro) =>
              <button type="button" key={registro.id} onClick={() => setDetalle(registro)}><span><strong>{titulo(registro)}</strong><small>{registro.cliente_nombre || 'Sin cliente'} · {horas(segundosReporte(registro))}</small></span><ChevronRight size={16} /></button>,
            ) : <p>No hay registros pendientes esta semana.</p>}</div>
          </section>
          <section className={styles.panel}>
            <h3><Clock3 size={18} />Actividad reciente</h3>
            <div className={styles.entries}>{recientes.length ? recientes.map((registro) =>
              <button type="button" key={registro.id} onClick={() => setDetalle(registro)}><span><strong>{titulo(registro)}</strong><small>{new Date(registro.created_at).toLocaleString('es-PE', { timeZone: PERU, dateStyle: 'short', timeStyle: 'short' })}</small></span><ChevronRight size={16} /></button>,
            ) : <p>No hay registros esta semana.</p>}</div>
          </section>
        </>}
      </aside>
    </div>
  )
}
