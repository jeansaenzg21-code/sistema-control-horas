'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, BarChart3, BriefcaseBusiness, CheckCircle2, ChevronRight, Clock, FileText, Layers3, LayoutGrid, UsersRound, Zap, type LucideIcon } from 'lucide-react'
import { MainLayout } from './main-layout'
import { PeriodoAprobacionesControl } from './aprobaciones-admin-vista'
import { Avatar, colorDeCliente, inicialesDe } from './cartera-ui'
import { useAuth } from '@/lib/auth-context'
import { evaluarBolsaHoras } from '@/lib/bolsa-horas'
import type { CumplimientoReporte } from '@/lib/cumplimiento'
import { obtenerEstiloEstado } from '@/lib/estado'
import { rangoDelMes, useDatosJefeArea } from '@/lib/use-dashboard-jefe'
import { formatoHoras, nombreCorto } from '@/lib/utils'
import styles from './dashboard-jefe-area.module.css'

const meses = new Intl.DateTimeFormat('es-PE', { month: 'long', timeZone: 'UTC' })
const fechaCorta = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fechaRegistro = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
const accesos = [
  { etiqueta: 'Aprobar registros', href: '/aprobaciones', icono: CheckCircle2, tono: 'turquesa' },
  { etiqueta: 'Ver equipo', href: '/cumplimiento', icono: UsersRound, tono: 'lavanda' },
  { etiqueta: 'Ver cartera de clientes', href: '/clientes', icono: BriefcaseBusiness, tono: 'celeste' },
  { etiqueta: 'Generar reporte', href: '/reportes', icono: FileText, tono: 'rosa' },
]

function Cabecera({ icono: Icono, titulo, descripcion, enlace }: { icono: LucideIcon; titulo: string; descripcion?: string; enlace?: { href: string; texto: string } }) {
  return <div className={styles.heading}>
    <span className={styles.icon}><Icono size={20} /></span>
    <div><h2>{titulo}</h2>{descripcion && <p>{descripcion}</p>}</div>
    {enlace && <Link className={styles.link} href={enlace.href}>{enlace.texto}<ArrowRight size={14} /></Link>}
  </div>
}

function TendenciaCumplimiento({ datos }: { datos: CumplimientoReporte | null | undefined }) {
  const id = useId()
  const semanas = (datos?.periodo.semanas ?? []).map((semana) => {
    let exigibles = 0
    let reportados = 0
    for (const colaborador of datos?.colaboradores ?? []) {
      for (const dia of colaborador.dias) {
        if (dia.fecha < semana.inicio || dia.fecha > semana.fin) continue
        if (dia.estado === 'reportado' || dia.estado === 'pendiente' || dia.estado === 'incompleto') exigibles++
        if (dia.estado === 'reportado') reportados++
      }
    }
    return { ...semana, porcentaje: exigibles ? Math.round(reportados / exigibles * 100) : null }
  }).filter((semana) => semana.porcentaje !== null)
  const puntos = semanas.map((semana, i) => ({
    ...semana, x: semanas.length > 1 ? 60 + i * (520 / (semanas.length - 1)) : 320, y: 114 - (semana.porcentaje ?? 0) * .92,
  }))
  const trazo = puntos.map(({ x, y }) => x + ',' + y).join(' ')
  return <section className={styles.panel}>
    <Cabecera icono={BarChart3} titulo="Cumplimiento del equipo"
      descripcion={datos ? 'Días reportados sobre días exigibles · ' + meses.format(new Date(datos.periodo.hasta + 'T00:00:00Z')) : 'Días reportados sobre días exigibles'} />
    {puntos.length ? <svg className={styles.chart} viewBox="0 0 620 143" role="img"
      aria-label={puntos.map(({ fin, porcentaje }) => fechaCorta.format(new Date(fin + 'T00:00:00Z')) + ': ' + porcentaje + '%').join(', ')}>
      <defs><linearGradient id={id} x2="0" y2="1"><stop stopColor="#a53cf2" stopOpacity=".65" /><stop offset="100%" stopColor="#a53cf2" stopOpacity="0" /></linearGradient></defs>
      {[0, 20, 40, 60, 80, 100].map((marca) => <g key={marca}><line x1="45" x2="603" y1={114 - marca * .92} y2={114 - marca * .92} /><text x="38" y={118 - marca * .92} textAnchor="end">{marca}%</text></g>)}
      {puntos.length > 1 && <><polygon points={puntos[0].x + ',114 ' + trazo + ' ' + puntos[puntos.length - 1].x + ',114'} fill={'url(#' + id + ')'} />
      <polyline points={trazo} fill="none" stroke="#cf75ff" strokeWidth="3" strokeLinejoin="round" /></>}
      {puntos.map(({ fin, x, y, porcentaje }) => <g key={fin}>
        <circle cx={x} cy={y} r="4.5" fill="#d27bff" stroke="#fff" />
        <text x={x} y={y - 8} textAnchor="middle">{porcentaje}%</text>
        <text x={x} y="136" textAnchor="middle">{fechaCorta.format(new Date(fin + 'T00:00:00Z'))}</text>
      </g>)}
    </svg> : <p className={styles.empty}>Sin días exigibles para mostrar en este período.</p>}
  </section>
}

export function DashboardJefeArea() {
  const [rango, setRango] = useState(rangoDelMes)
  const { usuarios, cargarUsuarios } = useAuth()
  const datos = useDatosJefeArea(rango)
  useEffect(() => { if (!usuarios.length) void cargarUsuarios() }, [usuarios.length, cargarUsuarios])

  const totales = datos.resumen?.totales
  const anterior = datos.resumenAnterior?.totales.horas ?? 0
  const variacion = anterior && totales ? Math.round((totales.horas / anterior - 1) * 100) : null
  const pendientes = datos.resumen?.por_estado?.find((fila) => fila.estado === 'PENDIENTE_APROBACION')?.registros ?? 0
  const colaboradores = new Map((datos.cumplimiento?.colaboradores ?? []).map((fila) => [fila.id, fila]))
  const horasPorPersona = new Map((datos.resumen?.por_usuario ?? []).map((fila) => [fila.usuario_id, fila]))
  const equipo = [...new Set([...colaboradores.keys(), ...horasPorPersona.keys()])].map((id) => {
    const cobertura = colaboradores.get(id)
    const horas = horasPorPersona.get(id)
    const nombre = horas?.nombre ?? cobertura?.nombre ?? 'Colaborador'
    const correo = usuarios.find((usuario) => usuario.id === id)?.correo
    return { id, nombre, corto: nombreCorto(nombre, correo), cargo: horas?.cargo ?? cobertura?.cargo, horas: horas?.horas ?? 0, cobertura: cobertura?.cobertura, pendientes: horas?.pendientes ?? 0 }
  }).sort((a, b) => b.horas - a.horas || a.nombre.localeCompare(b.nombre, 'es'))
  const sinRegistro = datos.resumen ? equipo.filter((persona) => !horasPorPersona.get(persona.id)?.registros).length : null
  const clientes = datos.cartera?.clientes ?? []
  const cartera = [
    { nombre: 'Sin riesgo', color: '#35d799', cantidad: 0 },
    { nombre: 'Bolsa próxima a agotarse', color: '#f7be39', cantidad: 0 },
    { nombre: 'En riesgo', color: '#fb5480', cantidad: 0 },
    { nombre: 'Sin bolsa activa', color: '#ab68ec', cantidad: 0 },
  ]
  for (const cliente of clientes) {
    if (cliente.estado === 'EN_RIESGO' || cliente.horasExcedidas > 0) cartera[2].cantidad++
    else if (cliente.horasContratadas <= 0) cartera[3].cantidad++
    else if (evaluarBolsaHoras(cliente.horasContratadas, cliente.horasConsumidas).estado !== 'normal') cartera[1].cantidad++
    else cartera[0].cantidad++
  }
  const facturables = totales?.horas_facturadas ?? 0
  const noFacturables = totales?.horas_no_facturadas ?? 0
  const porDefinir = Math.max(0, (totales?.horas ?? 0) - facturables - noFacturables)
  const suma = facturables + noFacturables + porDefinir
  const porcentaje = (valor: number) => suma ? Math.round(valor / suma * 100) : 0
  let posicion = 0
  const facturacion = [
    { etiqueta: 'Facturables', valor: facturables, color: '#a547f6' },
    { etiqueta: 'No facturables', valor: noFacturables, color: '#776b91' },
    { etiqueta: 'Por definir', valor: porDefinir, color: '#3e354d' },
  ].map((fila) => {
    const hasta = suma ? posicion + fila.valor / suma * 100 : 0
    const tramo = fila.color + ' ' + posicion + '% ' + hasta + '%'
    posicion = hasta
    return { ...fila, tramo }
  })
  const anillo = facturacion.filter((fila) => fila.valor > 0).map((fila) => fila.tramo).join(',')
  const metricas = [
    { etiqueta: 'Clientes en cartera', icono: BriefcaseBusiness, valor: datos.cartera ? clientes.length : '—', detalle: 'Cartera vigente', tono: 'violeta' },
    { etiqueta: 'Horas registradas', icono: Clock, valor: totales ? formatoHoras(totales.horas) : '—', detalle: variacion === null ? 'Período seleccionado' : (variacion > 0 ? '+' : '') + variacion + '% vs. período anterior', tono: 'violeta' },
    { etiqueta: 'Cumplimiento del área', icono: CheckCircle2, valor: datos.cumplimiento ? datos.cumplimiento.resumen.cobertura + '%' : '—', detalle: 'Cobertura de días exigibles', tono: 'verde' },
    { etiqueta: 'Por aprobar', icono: FileText, valor: datos.resumen ? pendientes : '—', detalle: 'Registros pendientes', tono: 'ambar' },
    { etiqueta: 'Colaboradores', icono: UsersRound, valor: datos.cumplimiento ? equipo.length : '—', detalle: 'Equipo del área', tono: 'violeta' },
  ]
  const alertas = [
    { etiqueta: 'Registros pendientes de aprobación', valor: datos.resumen ? pendientes : '—', href: '/aprobaciones', icono: Clock, tono: 'ambar' },
    { etiqueta: 'Clientes en riesgo', valor: datos.cartera ? cartera[2].cantidad : '—', href: '/clientes', icono: AlertTriangle, tono: 'rosa' },
    { etiqueta: 'Colaboradores sin registro', valor: sinRegistro ?? '—', href: '/cumplimiento', icono: UsersRound, tono: 'violeta' },
  ]

  return <MainLayout title="Panel del Jefe de Área" subtitle="Seguimiento del equipo, cumplimiento, aprobaciones y cartera de clientes" ancho="ancho"
    headerActions={<PeriodoAprobacionesControl periodo={rango} onChange={setRango} permitirTodas={false} />}>
    {datos.error && <p role="alert" className="ad-error">No se pudieron cargar todos los indicadores.</p>}
    {datos.inicial && <p role="status" className="rounded-xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground">Cargando el panel del área…</p>}
    {!datos.inicial && <div className={styles.dashboard} aria-busy={datos.cargando}>
      <section className={styles.metrics} aria-label="Indicadores del equipo">
        {metricas.map(({ etiqueta, valor, detalle, icono: Icono, tono }) => <article key={etiqueta} className={styles.metric} data-tono={tono}>
          <span className={styles.icon}><Icono size={22} /></span><div><h2>{etiqueta}</h2><strong>{valor}</strong><p>{detalle}</p></div>
        </article>)}
      </section>
      <div className={styles.body}>
        <div className={styles.overview}>
          <div className={styles.chartRow}>
            <TendenciaCumplimiento datos={datos.cumplimiento} />
            <section className={styles.panel}>
              <Cabecera icono={Layers3} titulo="Distribución de horas" descripcion="Según la clasificación de facturación" />
              <div className={styles.billing}>
                <div className={styles.ring} style={anillo ? { background: 'conic-gradient(' + anillo + ')' } : undefined}><span><strong>{totales ? porcentaje(facturables) + '%' : '—'}</strong>Facturable</span></div>
                <ul>{facturacion.filter((fila) => fila.etiqueta !== 'Por definir' || fila.valor > 0).map((fila) => <li key={fila.etiqueta}>
                  <i style={{ background: fila.color }} /><div>{fila.etiqueta}<strong>{totales ? formatoHoras(fila.valor) : '—'}</strong></div>
                </li>)}</ul>
              </div>
            </section>
          </div>
          <div className={styles.detailRow}>
            <section className={styles.panel}>
              <Cabecera icono={UsersRound} titulo="Desempeño del equipo" descripcion="Horas y cobertura por colaborador" enlace={{ href: '/cumplimiento', texto: 'Ver equipo' }} />
              <div className={styles.teamScroll}>
                <table className={styles.team}>
                  <thead><tr>{['Colaborador', 'Horas', 'Cumplimiento', 'Pendientes'].map((columna) => <th scope="col" key={columna}>{columna}</th>)}</tr></thead>
                  <tbody>{equipo.map((persona) => <tr key={persona.id}>
                    <td><div className={styles.person}><Avatar iniciales={inicialesDe(persona.corto)} color={colorDeCliente(persona.id)} /><div><strong title={persona.nombre}>{persona.corto}</strong><small>{persona.cargo || 'Colaborador'}</small></div></div></td>
                    <td>{formatoHoras(persona.horas)}</td>
                    <td>{persona.cobertura == null ? '—' : <div className={styles.progress}><span><i style={{ width: persona.cobertura + '%', background: persona.cobertura >= 80 ? '#35d799' : undefined }} /></span>{persona.cobertura}%</div>}</td>
                    <td>{persona.pendientes}</td>
                  </tr>)}</tbody>
                </table>
                {!equipo.length && <p className={styles.empty}>{datos.cargando ? 'Cargando equipo…' : 'Sin colaboradores para mostrar.'}</p>}
              </div>
            </section>
            <div className={styles.stack}>
              <section className={styles.panel}>
                <Cabecera icono={BriefcaseBusiness} titulo="Cartera del área" descripcion="Estado de las bolsas vigentes" enlace={{ href: '/clientes', texto: 'Ver cartera' }} />
                <ul className={styles.portfolio}>{cartera.filter((fila) => fila.nombre !== 'Sin bolsa activa' || fila.cantidad > 0).map((fila) => {
                  const pct = clientes.length ? Math.round(fila.cantidad / clientes.length * 100) : 0
                  return <li key={fila.nombre}><i style={{ background: fila.color }} />{fila.nombre}<div className={styles.progress}><span><i style={{ width: pct + '%', background: fila.color }} /></span>{fila.cantidad} ({pct}%)</div></li>
                })}</ul>
              </section>
              <section className={styles.panel}>
                <Cabecera icono={Clock} titulo="Actividad reciente" descripcion="Últimos registros del período" enlace={{ href: '/consolidacion', texto: 'Ver registros' }} />
                <ul className={styles.recent}>{datos.recientes.slice(0, 4).map((fila) => {
                  const fecha = new Date(fila.inicio)
                  return <li key={fila.id}>
                    <span className={'size-2 shrink-0 rounded-full ' + obtenerEstiloEstado(fila.estado).dot} />
                    <div><strong>{fila.tipo_actividad_nombre || fila.descripcion || 'Registro de horas'}</strong><small>{[fila.usuario_nombre, fila.cliente_nombre].filter(Boolean).join(' · ')}</small></div>
                    {Number.isFinite(fecha.getTime()) && <time dateTime={fecha.toISOString()}>{fechaRegistro.format(fecha)}</time>}
                  </li>
                })}</ul>
                {!datos.recientes.length && <p className={styles.empty}>Sin actividad en el período.</p>}
              </section>
            </div>
          </div>
        </div>
        <aside className={[styles.panel, styles.management].join(' ')}>
          <Cabecera icono={Zap} titulo="Gestión del área" descripcion="Acciones y pendientes" />
          <ul className={styles.alerts}>{alertas.map(({ etiqueta, valor, icono: Icono, href, tono }) => <li key={etiqueta} data-tono={tono}>
            <Link href={href}><span className={styles.icon}><Icono size={17} /></span><span>{etiqueta}</span><strong>{valor}</strong><ChevronRight size={16} /></Link>
          </li>)}</ul>
          <Cabecera icono={LayoutGrid} titulo="Accesos rápidos" />
          <div className={styles.shortcuts}>{accesos.map(({ etiqueta, href, icono: Icono, tono }) => <Link key={href} href={href} data-tono={tono}><span className={styles.icon}><Icono size={20} /></span>{etiqueta}</Link>)}</div>
        </aside>
      </div>
    </div>}
  </MainLayout>
}
