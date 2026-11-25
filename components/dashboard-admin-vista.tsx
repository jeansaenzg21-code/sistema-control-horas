'use client'

import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth-context'
import { opcionesApi } from '@/lib/api-cliente'
import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, BarChart3, BriefcaseBusiness, CalendarDays, ChevronDown, ChevronRight, CircleCheck, Clock, FileText, Layers, LayoutGrid, Target, Users, Zap, type LucideIcon } from 'lucide-react'
import { DateRangeFilter } from './date-range-filter'
import { MainLayout } from './main-layout'
import { SelectorDivision } from './selector-division'
import { formatoHoras, primerNombreYApellido } from '@/lib/utils'

type Metric = { titulo: string; valor: string; detalle: string; icono: LucideIcon; tono: string }
type Division = { id: number | null; nombre: string; horas: number }
type PortfolioRow = { id: number; nombre: string; clientes: number; contratadas: number; consumidas: number; disponibles: number; excedidas: number; riesgo: number }
type Props = {
  desde: string
  hasta: string
  onChange: (desde: string, hasta: string) => void
  cargando: boolean
  listo: boolean
  reintentar: () => void
  error: boolean
  metricas: readonly Metric[]
  divisiones: Division[]
  integrantes: Array<{ id: number; nombre: string; correo?: string | null; area_id: number | null; rol: string }>
  cartera: PortfolioRow[]
  estados: Array<{ nombre: string; valor: number; color: string }>
  facturables: number
  noFacturables: number
  pendientes: number
  sinRegistro: number
  riesgo: number
  presupuestos: number
}

export function DashboardAdminVista({ desde, hasta, onChange, cargando, listo, reintentar, error, metricas, divisiones, integrantes, cartera, estados, facturables, noFacturables, pendientes, sinRegistro, riesgo, presupuestos }: Props) {
  const { usuario, empresaActiva } = useAuth()
  const [division, setDivision] = useState<number | null>(null)
  const [fechasAbiertas, setFechasAbiertas] = useState(false)
  const [rango, setRango] = useState({ desde, hasta })
  const fecha = (valor: string) => valor.split('-').reverse().join('/')
  const divisionActiva = division === null ? undefined : divisiones.find((fila) => fila.id === division)
  const horasDiarias = useQuery({
    queryKey: ['horas-dia-division', empresaActiva?.id, usuario?.id, divisionActiva?.id, hasta],
    enabled: Boolean(divisionActiva && usuario && empresaActiva && hasta),
    queryFn: async ({ signal }) => {
      const parametros = new URLSearchParams({ area_id: String(divisionActiva?.id), desde: hasta, hasta })
      const respuesta = await fetch(`/api/actividades/resumen?${parametros}`, opcionesApi({ signal }))
      if (!respuesta.ok) throw new Error('No se pudieron cargar las horas del día.')
      const datos = await respuesta.json() as { por_usuario: Array<{ usuario_id: number; horas: number }> }
      return new Map(datos.por_usuario.map((fila) => [fila.usuario_id, fila.horas]))
    },
  })
  const visibles = divisionActiva
    ? integrantes.filter((persona) => persona.area_id === divisionActiva.id)
      .map((persona) => ({ ...persona, nombre: primerNombreYApellido(persona.nombre, persona.correo), horas: horasDiarias.data?.get(persona.id) ?? 0 }))
      .sort((a, b) => b.horas - a.horas || a.nombre.localeCompare(b.nombre, 'es'))
    : divisiones
  const columnas = Math.max(1, visibles.length)
  const anchoColumna = divisionActiva ? 120 : 80
  const maxHoras = Math.max(0, ...visibles.map((fila) => fila.horas))
  const unidad = divisionActiva ? 2 : 10
  const paso = Math.max(unidad, Math.ceil(maxHoras / (unidad * 4)) * unidad)
  const totalFacturacion = facturables + noFacturables
  const porcentaje = totalFacturacion ? facturables / totalFacturacion * 100 : 0
  const totalCartera = estados.reduce((total, estado) => total + estado.valor, 0)
  const alertas = [
    { nombre: 'Registros pendientes de aprobación', cantidad: pendientes, icono: Clock, href: '/aprobaciones', tono: 'amber' },
    { nombre: 'Colaboradores sin registros', cantidad: sinRegistro, icono: Users, href: '/cumplimiento', tono: 'rose' },
    { nombre: 'Clientes en riesgo', cantidad: riesgo, icono: AlertTriangle, href: '/clientes', tono: 'rose' },
    { nombre: 'Presupuestos por revisar', cantidad: presupuestos, icono: Layers, href: '/clientes', tono: 'violet' },
  ]
  const accesos = [
    { nombre: 'Ver horas registradas', icono: Clock, href: '/consolidacion', tono: 'fuchsia' },
    { nombre: usuario?.rol === 'socio' ? 'Consultar aprobaciones' : 'Aprobar registros', icono: CircleCheck, href: '/aprobaciones', tono: 'teal' },
    { nombre: 'Ver cartera de clientes', icono: Users, href: '/clientes', tono: 'violet' },
    { nombre: 'Generar reporte', icono: FileText, href: '/reportes', tono: 'rose' },
  ]

  return (
    <MainLayout
      title="Panel de Administración"
      subtitle="Vista consolidada de horas, cumplimiento, aprobaciones y cartera de clientes."
      ancho="ancho"
      headerActions={
        <div className="ad-period">
          <button className="ad-outline" type="button" aria-expanded={fechasAbiertas} onClick={() => {
            setRango({ desde, hasta })
            setFechasAbiertas(!fechasAbiertas)
          }}>
            <CalendarDays size={19} /><span>{fecha(desde)} – {fecha(hasta)}</span><ChevronDown size={16} />
          </button>
          {fechasAbiertas && (
            <form className="ad-period-popover" onKeyDown={(event) => { if (event.key === 'Escape') setFechasAbiertas(false) }} onSubmit={(event) => {
              event.preventDefault()
              onChange(rango.desde, rango.hasta)
              setFechasAbiertas(false)
            }}>
              <DateRangeFilter {...rango} onChange={(inicio, fin) => setRango({ desde: inicio, hasta: fin })} />
              <button type="submit" className="ad-outline" disabled={!rango.desde || !rango.hasta || rango.desde > rango.hasta}>Aplicar período</button>
            </form>
          )}
        </div>
      }
    >
      {error && <p role="alert" className="ad-error">No se pudieron cargar todos los indicadores del panel. <button type="button" className="underline" onClick={reintentar}>Reintentar</button></p>}
      {!listo && !error && <p role="status" className="ad-card ad-empty">Cargando el panel…</p>}
      {listo && <div className="ad-dashboard" aria-busy={cargando}>
        <div className="ad-overview">
          <section className="ad-metrics" aria-label="Indicadores principales">
            {metricas.map(({ titulo, valor, detalle, icono: Icon, tono }) => (
              <article key={titulo} className="ad-card ad-metric">
                <span className="ad-icon" data-tone={tono}><Icon size={23} /></span>
                <h2>{titulo}</h2>
                <strong>{valor}</strong>
                <p>{detalle}</p>
              </article>
            ))}
          </section>
          <div className="ad-panels">
            <section className="ad-card ad-panel ad-hours-panel">
              <div className="ad-heading">
                <h2><BarChart3 />Horas registradas por división</h2>
                <SelectorDivision
                  etiqueta="Filtrar horas por división"
                  todas="Todas las divisiones"
                  areas={divisiones.flatMap(({ id, nombre }) => id === null ? [] : [{ id, nombre }])}
                  areaId={divisionActiva?.id == null ? '' : String(divisionActiva.id)}
                  onChange={(id) => setDivision(id ? Number(id) : null)}
                />
              </div>
              {divisionActiva && <p className="px-4 text-xs text-muted-foreground">Horas del {fecha(hasta)} · {visibles.length} integrantes</p>}
              {divisionActiva && horasDiarias.isError ? (
                <p className="ad-empty" role="alert">{horasDiarias.error.message} <button type="button" className="underline" onClick={() => void horasDiarias.refetch()}>Reintentar</button></p>
              ) : divisionActiva && horasDiarias.isPending ? (
                <p className="ad-empty" role="status">Cargando horas del día…</p>
              ) : <div className="ad-chart">
                <div className="ad-axis" aria-hidden="true">{[4, 3, 2, 1, 0].map((i) => <span key={i}>{i * paso}h</span>)}</div>
                <div className="ad-chart-scroll">
                  <div className="ad-bars" style={{ minWidth: columnas * anchoColumna, gridTemplateColumns: 'repeat(' + columnas + ', minmax(0, 1fr))' }}>
                    {visibles.map((fila) => (
                      <div className="ad-bar-group" key={fila.id ?? fila.nombre}>
                        <div className="ad-bar-track"><div aria-hidden="true" className="ad-bar" style={{ height: (fila.horas / (paso * 4) * 100) + '%' }} /></div>
                        <span>{fila.nombre}{'rol' in fila && fila.rol === 'jefe_area' && <small className="block">Jefe de área</small>}</span>
                        <strong>{formatoHoras(fila.horas)}</strong>
                      </div>
                    ))}
                    {!visibles.length && <p className="ad-empty">{divisionActiva ? 'Sin integrantes activos en esta división.' : 'Sin divisiones para mostrar.'}</p>}
                  </div>
                </div>
              </div>}
            </section>
            <section className="ad-card ad-panel">
              <div className="ad-heading"><h2><Target />Facturabilidad general</h2></div>
              <div className="ad-billing">
                <div className="ad-ring">
                  <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle cx="60" cy="60" r="51" fill="none" stroke="var(--ad-ring-track)" strokeWidth="12" />
                    {porcentaje > 0 && <circle cx="60" cy="60" r="51" pathLength="100" fill="none" stroke="var(--ad-violet)" strokeWidth="12" strokeLinecap="round" strokeDasharray={porcentaje + ' 100'} transform="rotate(-90 60 60)" />}
                  </svg>
                  <div><strong>{porcentaje.toFixed(1)}%</strong><span>Facturable</span></div>
                </div>
                <dl className="ad-legend">
                  <div><dt>Facturables</dt><dd>{formatoHoras(facturables)}</dd></div>
                  <div><dt>No facturables</dt><dd>{formatoHoras(noFacturables)}</dd></div>
                </dl>
              </div>
            </section>
            <section className="ad-card ad-panel ad-portfolio">
              <div className="ad-heading">
                <h2><BriefcaseBusiness />Cartera por división</h2>
                <Link className="ad-outline" href="/clientes">Ver cartera <ArrowUpRight size={15} /></Link>
              </div>
              <div className="ad-table-scroll">
                <table>
                  <thead><tr>{['División', 'Clientes', 'Contrato', 'Consumo', 'Saldo', 'Desvío'].map((nombre) => <th scope="col" key={nombre}>{nombre}</th>)}</tr></thead>
                  <tbody>
                    {cartera.map((fila) => (
                      <tr key={fila.id}>
                        <th scope="row">{fila.nombre}<small className={fila.riesgo ? 'ad-negative' : ''}>{fila.clientes} clientes · {fila.riesgo} en riesgo</small></th>
                        <td>{fila.clientes}</td>
                        <td>{fila.clientes ? formatoHoras(fila.contratadas) : '—'}</td>
                        <td>{fila.clientes ? formatoHoras(fila.consumidas) : '—'}</td>
                        <td className="ad-positive">{fila.clientes ? formatoHoras(fila.disponibles) : '—'}</td>
                        <td className={fila.excedidas > 0 ? 'ad-negative' : ''}>{fila.excedidas > 0 ? '+' + formatoHoras(fila.excedidas) : '—'}</td>
                      </tr>
                    ))}
                    {!cartera.length && <tr><td colSpan={6}>Sin datos de cartera.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="ad-card ad-panel">
              <div className="ad-heading">
                <h2><Layers />Estado de la cartera</h2>
                <Link href="/clientes" aria-label="Ver estado de los clientes"><ChevronRight size={19} /></Link>
              </div>
              <ul className="ad-status">
                {estados.map((estado) => {
                  const percent = totalCartera ? Math.round(estado.valor / totalCartera * 100) : 0
                  return <li key={estado.nombre} style={{ '--tone': estado.color } as CSSProperties}>
                    <span>{estado.nombre}</span><span>{estado.valor} · {percent}%</span>
                    <div aria-hidden="true"><i style={{ width: percent + '%' }} /></div>
                  </li>
                })}
              </ul>
            </section>
          </div>
        </div>
        <aside className="ad-card ad-control" aria-label="Centro de control">
          <div className="ad-control-title"><span className="ad-icon" data-tone="violet"><Zap size={29} /></span><div><h2>Centro de control</h2><p>Acciones prioritarias</p></div></div>
          <ul className="ad-alerts">
            {alertas.map(({ nombre, cantidad, icono: Icon, href, tono }) => (
              <li key={nombre}><Link href={href}><span className="ad-icon" data-tone={tono}><Icon size={19} /></span><span>{nombre}</span><b data-tone={tono}>{cantidad}</b><ChevronRight size={16} /></Link></li>
            ))}
          </ul>
          <div className="ad-heading"><h2><LayoutGrid />Accesos rápidos</h2></div>
          <div className="ad-shortcuts">
            {accesos.map(({ nombre, icono: Icon, href, tono }) => (
              <Link key={nombre} href={href}><span className="ad-icon" data-tone={tono}><Icon size={22} /></span>{nombre}</Link>
            ))}
          </div>
        </aside>
      </div>}
    </MainLayout>
  )
}
