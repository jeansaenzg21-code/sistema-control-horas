'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { MainLayout } from '@/components/main-layout'
import { DateRangeFilter } from '@/components/date-range-filter'
import { PANEL } from '@/components/cartera-ui'
import { cn } from '@/lib/utils'
import { formatoHoras } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import {
  Clock, ShieldCheck, ListChecks, Users, Wallet, UserRound, BarChart3, Info,
  ChevronRight, AlertTriangle, ClipboardCheck, MessageSquareWarning, UserX, TrendingDown, Ban,
} from 'lucide-react'
type Area = { id: number; nombre: string }
type Usuario = { id: number; nombre: string; rol: string; area_id: number | null; area_nombre: string | null; activo: number | boolean; cargo?: string | null }
type ClienteCartera = { id: number; area_id: number; area_nombre: string; horasContratadas: number; horasConsumidas: number; horasDisponibles: number; horasExcedidas: number; estado: string; nombre: string }
type CarteraRespuesta = { clientes: ClienteCartera[]; totales: { clientes: number; contratadas: number; consumidas: number; disponibles: number; excedidas: number; porAprobar: number } }
type FilaFacturableArea = { area_id?: number | null; area_nombre: string; horas?: number; horas_facturadas?: number; horas_no_facturadas?: number; horas_facturables?: number; horas_no_facturables?: number }
type Resumen = { por_area?: FilaFacturableArea[]; totales: { registros: number; horas: number; horas_facturadas: number; horas_no_facturadas: number }; por_usuario: Array<{ usuario_id: number; nombre: string; cargo: string | null; area_nombre: string; registros: number; horas: number; horas_facturadas?: number; horas_no_facturadas?: number; horas_facturables?: number; horas_no_facturables?: number }>; por_estado?: Array<{ estado: string; registros: number; horas: number }> }
type Aprobacion = { id: number; estado: string; usuario_nombre: string; usuario_id: number; revisado_por: number | null; revisado_en: string | null; area_nombre: string; area_id: number }
type Cumplimiento = { resumen: { cobertura: number; colaboradores: number; cumplen: number; cumplen_parcial: number; no_cumplen: number } }
type Severidad = 'rojo' | 'ambar' | 'violeta'
export function DashboardAdministrador() {
  const { usuarios, cargarUsuarios } = useAuth()
  const hoy = new Date()
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const [desde, setDesde] = useState(`${mes}-01`)
  const [hasta, setHasta] = useState(`${mes}-${String(Math.min(hoy.getDate(), ultimo)).padStart(2, '0')}`)
  const [cargando, setCargando] = useState(true)
  const [areas, setAreas] = useState<Area[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [resumenPrevio, setResumenPrevio] = useState<Resumen | null>(null)
  const [cartera, setCartera] = useState<CarteraRespuesta | null>(null)
  const [cumplimiento, setCumplimiento] = useState<Cumplimiento | null>(null)
  const [aprobaciones, setAprobaciones] = useState<Aprobacion[]>([])
  const [usuariosRemotos, setUsuariosRemotos] = useState<Usuario[]>([])
  const [mostrarAreasSinActividad, setMostrarAreasSinActividad] = useState(false)
  const [ordenFacturacion, setOrdenFacturacion] = useState<'horas' | 'porcentaje'>('horas')
  useEffect(() => {
    if (usuarios.length === 0) void cargarUsuarios()
  }, [usuarios.length, cargarUsuarios])
  useEffect(() => {
    let cancelado = false
    async function cargar() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
      if (!token) { setCargando(false); return }
      setCargando(true)
      const h = { Authorization: `Bearer ${token}` }
      const qs = desde && hasta ? `desde=${desde}&hasta=${hasta}` : ''
      const mesF = (hasta || new Date().toISOString().slice(0, 10)).slice(5, 7)
      const anioF = (hasta || new Date().toISOString().slice(0, 10)).slice(0, 4)
      try {
        const [a, r, rp, c, cu, ap, u] = await Promise.all([
          fetch('/api/areas', { headers: h }).then((x) => x.ok ? x.json() : []),
          fetch(`/api/actividades/resumen${qs ? `?${qs}` : ''}`, { headers: h }).then((x) => x.ok ? x.json() : null),
          fetchPrevio(desde, hasta, h),
          fetch('/api/clientes/cartera', { headers: h }).then((x) => x.ok ? x.json() : null),
          fetch(`/api/cumplimiento?anio=${anioF}&mes=${mesF}&desde=${desde}&hasta=${hasta}`, { headers: h }).then((x) => x.ok ? x.json() : null),
          fetch('/api/aprobaciones', { headers: h }).then((x) => x.ok ? x.json() : []),
          fetch('/api/usuarios', { headers: h }).then((x) => x.ok ? x.json() : []),
        ])
        if (cancelado) return
        setAreas(Array.isArray(a) ? a : [])
        setResumen(r as Resumen | null)
        setResumenPrevio(rp as Resumen | null)
        setCartera(c as CarteraRespuesta | null)
        setCumplimiento(cu as Cumplimiento | null)
        setAprobaciones(Array.isArray(ap) ? ap : [])
        setUsuariosRemotos(Array.isArray(u) ? u : [])
      } catch {
        if (!cancelado) {
          setResumen(null); setCartera(null); setCumplimiento(null); setAprobaciones([]); setUsuariosRemotos([])
        }
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    void cargar()
    return () => { cancelado = true }
  }, [desde, hasta])
  const horasActual = resumen?.totales.horas ?? 0
  const horasPrevias = resumenPrevio?.totales.horas ?? 0
  const variacion = horasPrevias > 0 ? Math.round(((horasActual - horasPrevias) / horasPrevias) * 1000) / 10 : null
  const aprobadas = resumen?.por_estado?.find((e) => e.estado === 'APROBADA')?.registros ?? 0
  const pendientes = resumen?.por_estado?.find((e) => e.estado === 'PENDIENTE_APROBACION')?.registros ?? 0
  const observados = resumen?.por_estado?.find((e) => e.estado === 'CORRECCION_SOLICITADA')?.registros ?? 0
  const rechazadas = resumen?.por_estado?.find((e) => e.estado === 'RECHAZADA')?.registros ?? 0
  const enCurso = resumen?.por_estado?.find((e) => e.estado === 'EN_CURSO')?.registros ?? 0
  const totalEstado = aprobadas + pendientes + observados + rechazadas + enCurso
  const usuariosUnicos = useMemo(() => new Set((resumen?.por_usuario ?? []).map((u) => u.usuario_id)), [resumen])
  const listaUsuarios = usuarios.length ? usuarios as unknown as Usuario[] : usuariosRemotos
  const totalColaboradores = listaUsuarios.filter((u) => u.activo && ['personal', 'supervisor', 'jefe_area'].includes(String(u.rol).toLowerCase())).length
  const sinRegistro = Math.max(0, totalColaboradores - usuariosUnicos.size)
  const clientes = useMemo(() => cartera?.clientes ?? [], [cartera])
  const clientesActivos = clientes.filter((c) => c.estado !== 'PENDIENTE').length
  const clientesRiesgo = clientes.filter((c) => c.estado === 'EN_RIESGO' || c.horasExcedidas > 0).length
  const clientesSinBolsa = useMemo(() => clientes.filter((c) => c.horasContratadas === 0).length, [clientes])
  const totalContratadas = useMemo(() => [...new Map(clientes.map((c) => [c.id, c.horasContratadas])).values()].reduce((a, b) => a + b, 0), [clientes])
  const totalConsumidas = useMemo(() => [...new Map(clientes.map((c) => [c.id, c.horasConsumidas])).values()].reduce((a, b) => a + b, 0), [clientes])
  const totalDisponibles = useMemo(() => [...new Map(clientes.map((c) => [c.id, c.horasDisponibles])).values()].reduce((a, b) => a + b, 0), [clientes])
  const pendientesTotal = useMemo(() => aprobaciones.filter((a) => a.estado === 'PENDIENTE_APROBACION').length, [aprobaciones])
  const observadosTotal = useMemo(() => aprobaciones.filter((a) => a.estado === 'CORRECCION_SOLICITADA').length, [aprobaciones])
  const bolsaPorArea = useMemo(() => {
    const m = new Map<number, { clientes: number; contratadas: number; consumidas: number; disponibles: number; excedidas: number; riesgo: number; sinBolsa: number }>()
    for (const c of clientes) {
      const actual = m.get(c.area_id) ?? { clientes: 0, contratadas: 0, consumidas: 0, disponibles: 0, excedidas: 0, riesgo: 0, sinBolsa: 0 }
      actual.clientes += 1
      actual.contratadas += c.horasContratadas
      actual.consumidas += c.horasConsumidas
      actual.disponibles += c.horasDisponibles
      actual.excedidas += Math.max(0, Number(c.horasExcedidas) || 0)
      if (c.estado === 'EN_RIESGO' || c.horasExcedidas > 0) actual.riesgo += 1
      if (c.horasContratadas === 0) actual.sinBolsa += 1
      m.set(c.area_id, actual)
    }
    return m
  }, [clientes])
  // Áreas de cartera: las que tienen cartera/riesgo/consumo primero; el resto queda disponible por paginación.
  const areasCartera = useMemo(() => {
    const base = areas.map((a) => {
      const b = bolsaPorArea.get(a.id)
      return { id: a.id, nombre: a.nombre, clientes: b?.clientes ?? 0, contratadas: b?.contratadas ?? 0, consumidas: b?.consumidas ?? 0, disponibles: b?.disponibles ?? 0, excedidas: b?.excedidas ?? 0, riesgo: b?.riesgo ?? 0, sinBolsa: b?.sinBolsa ?? 0 }
    }).concat([...bolsaPorArea].filter(([id]) => !areas.some((a) => a.id === id)).map(([id, b]) => ({ id, nombre: clientes.find((c) => c.area_id === id)?.area_nombre ?? `Área ${id}`, clientes: b.clientes, contratadas: b.contratadas, consumidas: b.consumidas, disponibles: b.disponibles, excedidas: b.excedidas, riesgo: b.riesgo, sinBolsa: b.sinBolsa })))
    return base.sort((a, b) =>
      b.excedidas - a.excedidas || b.riesgo - a.riesgo || b.sinBolsa - a.sinBolsa || b.consumidas - a.consumidas || b.clientes - a.clientes || a.nombre.localeCompare(b.nombre))
  }, [areas, bolsaPorArea, clientes])
  const pendientesPorArea = useMemo(() => {
    const m = new Map<number, number>()
    for (const a of aprobaciones) if (a.estado === 'PENDIENTE_APROBACION') m.set(a.area_id, (m.get(a.area_id) ?? 0) + 1)
    return m
  }, [aprobaciones])
  const horasPorArea = useMemo(() => {
    const m = new Map<string, { horas: number; registros: number; personas: number }>()
    for (const u of resumen?.por_usuario ?? []) {
      const clave = u.area_nombre?.trim() || 'Sin área'
      const actual = m.get(clave) ?? { horas: 0, registros: 0, personas: 0 }
      actual.horas += Number(u.horas) || 0
      actual.registros += Number(u.registros) || 0
      actual.personas += 1
      m.set(clave, actual)
    }
    const total = [...m.values()].reduce((t, d) => t + d.horas, 0)
    const porArea: Array<{ id: number | null; nombre: string; horas: number; registros: number; personas: number; porcentaje: number }> = areas.map((a) => {
      const agg = m.get(a.nombre.trim()) ?? { horas: 0, registros: 0, personas: 0 }
      return { id: a.id, nombre: a.nombre, ...agg, porcentaje: total === 0 ? 0 : Math.round((agg.horas / total) * 100) }
    })
    for (const [nombre, agg] of m) {
      if (!areas.some((a) => a.nombre.trim() === nombre)) porArea.push({ id: null, nombre, ...agg, porcentaje: total === 0 ? 0 : Math.round((agg.horas / total) * 100) })
    }
    const filtradas = mostrarAreasSinActividad
      ? porArea
      : porArea.filter((a) => {
          if (a.horas > 0 || a.registros > 0) return true
          if (a.id === null) return false
          if ((pendientesPorArea.get(a.id) ?? 0) > 0) return true
          return bolsaPorArea.has(a.id)
        })
    return filtradas.sort((a, b) => b.horas - a.horas)
  }, [resumen, areas, mostrarAreasSinActividad, pendientesPorArea, bolsaPorArea])
  // Totales empresariales: sobre TODAS las áreas del listado, no solo la página visible.
  const totalHorasAreas = horasActual
  const totalFacturables = Number(resumen?.totales.horas_facturadas ?? 0)
  const totalNoFacturables = Number(resumen?.totales.horas_no_facturadas ?? 0)
  const horasClasificadas = totalFacturables + totalNoFacturables
  const facturablePct = horasClasificadas > 0 ? 100 * totalFacturables / horasClasificadas : 0
  const horasDiferencia = Math.max(0, horasActual - horasClasificadas)
  const diferenciaClasificacion = Math.abs(horasActual - horasClasificadas) > 0.05
  // El desglose se obtiene exclusivamente de cifras clasificadas que realmente entregue el endpoint.
  // Nunca se prorratea el dato global entre las áreas por su participación horaria.
  const facturacionAreas = useMemo(() => {
    type Fila = { id: number | null; nombre: string; facturables: number; noFacturables: number; total: number; disponible: boolean }
    const mapa = new Map<string, Fila>()
    const key = (nombre: string) => nombre.trim().toLocaleLowerCase('es')
    for (const area of areas) mapa.set(key(area.nombre), { id: area.id, nombre: area.nombre, facturables: 0, noFacturables: 0, total: 0, disponible: false })
    const entradas = resumen?.por_area?.length ? resumen.por_area : resumen?.por_usuario ?? []
    for (const entry of entradas) {
      const nombre = entry.area_nombre?.trim() || 'Sin área'
      const clave = key(nombre)
      const actual = mapa.get(clave) ?? { id: null, nombre, facturables: 0, noFacturables: 0, total: 0, disponible: false }
      const f = entry.horas_facturadas ?? entry.horas_facturables
      const n = entry.horas_no_facturadas ?? entry.horas_no_facturables
      if (f !== undefined && n !== undefined && Number.isFinite(Number(f)) && Number.isFinite(Number(n))) {
        actual.facturables += Math.max(0, Number(f))
        actual.noFacturables += Math.max(0, Number(n))
        actual.disponible = true
      }
      actual.total += Math.max(0, Number(entry.horas ?? 0))
      mapa.set(clave, actual)
    }
    // El total visible procede del resumen horario real; nunca se convierte
    // automáticamente en facturable o no facturable.
    for (const area of horasPorArea) {
      const clave = key(area.nombre)
      const fila = mapa.get(clave) ?? { id: area.id, nombre: area.nombre, facturables: 0, noFacturables: 0, total: 0, disponible: false }
      fila.total = area.horas
      mapa.set(clave, fila)
    }
    const filas = [...mapa.values()]
    filas.sort((a,b) => {
      if (a.disponible !== b.disponible) return a.disponible ? -1 : 1
      if (!a.disponible && !b.disponible) return b.total - a.total || a.nombre.localeCompare(b.nombre)
      if (ordenFacturacion === 'porcentaje') {
        const pa = a.facturables + a.noFacturables ? a.facturables / (a.facturables + a.noFacturables) : 0
        const pb = b.facturables + b.noFacturables ? b.facturables / (b.facturables + b.noFacturables) : 0
        return pb - pa || b.facturables - a.facturables
      }
      return b.facturables - a.facturables || a.nombre.localeCompare(b.nombre)
    })
    return filas
  }, [areas, resumen, ordenFacturacion, horasPorArea])
  const detalleDisponible = facturacionAreas.some(a => a.disponible)
  const alertas = useMemo(() => {
    const list: Array<{ titulo: string; cantidad: number; severidad: Severidad; enlace: string; icono: ReactNode }> = []
    if (clientesRiesgo > 0) list.push({ titulo: 'Clientes en riesgo o excedidos', cantidad: clientesRiesgo, severidad: 'rojo', enlace: '/clientes', icono: <TrendingDown size={15} /> })
    if (clientesSinBolsa > 0) list.push({ titulo: 'Clientes gastando sin bolsa', cantidad: clientesSinBolsa, severidad: 'rojo', enlace: '/clientes', icono: <Ban size={15} /> })
    if (pendientesTotal > 0) list.push({ titulo: 'Aprobaciones pendientes', cantidad: pendientesTotal, severidad: 'ambar', enlace: '/aprobaciones', icono: <ClipboardCheck size={15} /> })
    if (observadosTotal > 0) list.push({ titulo: 'Registros con observaciones', cantidad: observadosTotal, severidad: 'ambar', enlace: '/aprobaciones', icono: <MessageSquareWarning size={15} /> })
    if (cumplimiento && cumplimiento.resumen.no_cumplen > 0) list.push({ titulo: 'Colaboradores que no cumplen la meta', cantidad: cumplimiento.resumen.no_cumplen, severidad: 'ambar', enlace: '/cumplimiento', icono: <AlertTriangle size={15} /> })
    if (sinRegistro > 0) list.push({ titulo: 'Colaboradores sin registros', cantidad: sinRegistro, severidad: 'violeta', enlace: '/cumplimiento', icono: <UserX size={15} /> })
    return list
  }, [clientesRiesgo, clientesSinBolsa, pendientesTotal, observadosTotal, cumplimiento, sinRegistro])
  const estadosRegistros = [
    { nombre: 'Aprobados', valor: aprobadas, color: '#34d399' },
    { nombre: 'Pendientes', valor: pendientes, color: '#fbbf24' },
    { nombre: 'Observados', valor: observados, color: '#38bdf8' },
    { nombre: 'Rechazados', valor: rechazadas, color: '#fb7185' },
    { nombre: 'En curso', valor: enCurso, color: '#a78bfa' },
  ]
  const pct = (v: number) => (totalEstado ? Math.round((v / totalEstado) * 100) : 0)
  const metricas = [
    { titulo: 'Horas registradas', valor: formatoHoras(horasActual), detalle: variacion === null ? `${resumen?.totales.registros ?? 0} registros` : `${variacion > 0 ? '+' : ''}${variacion}% vs. período anterior`, icono: Clock, tono: 'sky', destacado: true },
    { titulo: 'Cobertura de cumplimiento', valor: cumplimiento ? `${cumplimiento.resumen.cobertura}%` : '—', detalle: cumplimiento ? `${cumplimiento.resumen.cumplen} de ${cumplimiento.resumen.colaboradores} cumplen` : 'Sin datos', icono: ShieldCheck, tono: 'emerald' },
    { titulo: 'Por aprobar', valor: String(pendientesTotal), detalle: 'Registros pendientes', icono: ListChecks, tono: 'amber' },
    { titulo: 'Clientes en cartera', valor: String(clientesActivos), detalle: `${clientesRiesgo} en riesgo`, icono: Users, tono: 'violet' },
    { titulo: 'Saldo de bolsas', valor: formatoHoras(totalDisponibles), detalle: `${formatoHoras(totalContratadas)} contratadas · ${formatoHoras(totalConsumidas)} consumidas`, icono: Wallet, tono: 'teal' },
    { titulo: 'Personal que registró', valor: `${usuariosUnicos.size}/${totalColaboradores}`, detalle: `${sinRegistro} sin registros`, icono: UserRound, tono: 'blue' },
  ] as const
  const gradientes: Record<string, string> = {
    sky: 'bg-sky-500/12 text-sky-400', emerald: 'bg-emerald-500/12 text-emerald-400',
    amber: 'bg-amber-500/12 text-amber-400', violet: 'bg-violet-500/12 text-violet-400',
    teal: 'bg-teal-500/12 text-teal-400', blue: 'bg-blue-500/12 text-blue-400',
  }
  const superficie = `${PANEL} min-w-0 overflow-hidden`
  return (
    <MainLayout title="Panel de Administración" subtitle="Vista consolidada de toda la empresa: horas, cumplimiento, aprobaciones y cartera de clientes.">
      <main className={cn('space-y-2 pb-5 transition-opacity', cargando && 'opacity-65')} aria-busy={cargando}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{cargando ? 'Actualizando indicadores…' : 'Supervisión empresarial'}</span>
          <DateRangeFilter desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h) }} />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {metricas.map((m) => {
            const Icono = m.icono
            return <div key={m.titulo} className="min-w-0 rounded-xl border border-border/70 bg-card/70 px-3 py-2.5">
              <div className="mb-1.5 flex items-center gap-2">
                <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg',gradientes[m.tono])}><Icono size={15}/></span>
                <span className="min-w-0 text-[10px] font-medium leading-tight text-muted-foreground">{m.titulo}</span>
              </div>
              <p className="truncate text-lg font-semibold tracking-tight tabular-nums" title={m.valor}>{m.valor}</p>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={m.detalle}>{m.detalle}</p>
            </div>
          })}
        </div>
        {/* Dos prioridades empresariales, accesibles sin atravesar todo el dashboard. */}
        <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
          <section className={`${superficie} flex min-h-0 flex-col`}>
            <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold"><Wallet size={16} className="text-violet-400"/> Cartera por división</h2>
                <p className="text-[10px] text-muted-foreground">Contratos, consumo, saldo y desvíos · {areasCartera.length} áreas</p>
              </div>
              <Link href="/clientes" className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] text-violet-300 hover:bg-muted/30">Ver cartera <ChevronRight size={12} className="inline"/></Link>
            </div>
              <div className="grid grid-cols-[minmax(0,1.45fr)_4.2rem_4.4rem_4.3rem_4.2rem] items-center gap-2 border-b border-border/40 bg-muted/15 px-3 py-2 text-[10px] font-medium text-muted-foreground">
                <span>División / clientes</span><span className="text-right">Contrato</span><span className="text-right">Consumo</span><span className="text-right">Saldo</span><span className="text-right">Desvío</span>
              </div>
                  <div className="max-h-[224px] min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:rgba(139,92,246,.35)_transparent] [scrollbar-width:thin]" role="region" aria-label="Cartera completa por división" tabIndex={0}>
                {areasCartera.map(a => {
                  const hayExceso = a.excedidas > 0
                  return <div key={a.id} className="grid min-h-[44px] grid-cols-[minmax(0,1.45fr)_4.2rem_4.4rem_4.3rem_4.2rem] items-center gap-2 border-b border-border/30 px-3 py-1.5 text-[10px] last:border-0 hover:bg-muted/20">
                    <div className="min-w-0"><div className="truncate font-semibold text-[11px]" title={a.nombre}>{a.nombre}</div><div className="mt-0.5 truncate text-[9px] text-muted-foreground">{a.clientes} clientes · <span className={a.riesgo?'text-rose-300':''}>{a.riesgo} en riesgo</span>{a.sinBolsa ? ` · ${a.sinBolsa} sin bolsa` : ''}</div></div>
                    <span className="text-right tabular-nums" title="Horas contratadas">{a.clientes ? formatoHoras(a.contratadas) : '—'}</span>
                    <span className="text-right tabular-nums" title="Horas consumidas">{a.clientes ? formatoHoras(a.consumidas) : '—'}</span>
                    <span className="text-right tabular-nums text-emerald-300" title="Saldo disponible">{a.clientes ? formatoHoras(a.disponibles) : '—'}</span>
                    <span className={cn('text-right font-semibold tabular-nums', hayExceso?'text-rose-300':'text-muted-foreground')} title="Horas excedidas acumuladas por registros de cartera">{hayExceso ? `+${formatoHoras(a.excedidas)}` : '—'}</span>
                  </div>
                })}
                {areasCartera.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Sin cartera registrada.</p>}
              </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-3 py-2 text-[10px]">
              <span className="text-muted-foreground">{clientes.length} clientes · {clientesRiesgo} en riesgo · {clientesSinBolsa} sin bolsa</span>
              <span className="font-medium tabular-nums text-foreground">Saldo: {formatoHoras(totalDisponibles)}</span>
            </div>
          </section>
          <section className={`${superficie} flex min-h-0 flex-col`}>
            <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold"><BarChart3 size={16} className="text-violet-400"/> Facturabilidad por división</h2>
                <p className="text-[10px] text-muted-foreground">Clasificación del tiempo · {facturacionAreas.length} divisiones</p>
              </div>
              <div className="flex shrink-0 rounded-lg bg-muted/40 p-0.5 text-[10px]" aria-label="Ordenar facturabilidad">
                <button type="button" onClick={() => setOrdenFacturacion('horas')} aria-pressed={ordenFacturacion==='horas'} className={cn('rounded-md px-2 py-1 transition-colors', ordenFacturacion==='horas'?'bg-violet-500/20 text-violet-200':'text-muted-foreground hover:text-foreground')}>Horas</button>
                <button type="button" disabled={!detalleDisponible} onClick={() => setOrdenFacturacion('porcentaje')} aria-pressed={ordenFacturacion==='porcentaje'} className={cn('rounded-md px-2 py-1 transition-colors disabled:opacity-40', ordenFacturacion==='porcentaje'?'bg-violet-500/20 text-violet-200':'text-muted-foreground hover:text-foreground')}>%</button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border/40 px-3 py-2">
              <div className="flex items-baseline gap-2"><strong className="text-lg tabular-nums">{horasClasificadas > 0 ? `${facturablePct.toFixed(1)}%` : '—'}</strong><span className="text-[10px] text-muted-foreground">facturable de {formatoHoras(horasClasificadas)} clasificadas</span></div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><span><b className="text-emerald-400">●</b> Facturables</span><span><b className="text-amber-400">●</b> No facturables</span></div>
            </div>
              {!detalleDisponible && <div className="flex items-center gap-1.5 border-b border-amber-400/15 bg-amber-500/5 px-3 py-1.5 text-[10px] text-amber-200"><Info size={12} className="shrink-0"/> La API no proporciona el desglose facturable por división. Se muestran las divisiones sin estimar porcentajes.</div>}
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_4rem] gap-2 border-b border-border/40 bg-muted/15 px-3 py-1.5 text-[10px] text-muted-foreground">
                <span>División</span><span>Facturable / no facturable</span><span className="text-right">% fact.</span>
              </div>
              <div className="max-h-[224px] min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:rgba(139,92,246,.35)_transparent] [scrollbar-width:thin]" role="region" aria-label="Facturabilidad de todas las divisiones" tabIndex={0}>
                {facturacionAreas.map(a => {
                  const clasificadas = a.facturables + a.noFacturables
                  const porcentaje = clasificadas > 0 ? a.facturables / clasificadas * 100 : 0
                  return <div key={a.id ?? a.nombre} className="grid min-h-[42px] grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_4rem] items-center gap-2 border-b border-border/30 px-3 py-1.5 text-[11px] last:border-0 hover:bg-muted/20">
                    <div className="min-w-0"><div className="truncate font-medium" title={a.nombre}>{a.nombre}</div><div className="mt-0.5 text-[9px] text-muted-foreground">{a.disponible ? `${formatoHoras(a.facturables)} / ${formatoHoras(a.noFacturables)}` : `${formatoHoras(a.total)} registradas`}</div></div>
                    {a.disponible && clasificadas > 0 ? <div className="flex h-2 overflow-hidden rounded-full bg-muted" title={`${formatoHoras(a.facturables)} facturables / ${formatoHoras(a.noFacturables)} no facturables`}><div className="bg-emerald-500" style={{width:`${porcentaje}%`}}/><div className="flex-1 bg-amber-500"/></div> : <span className="text-[10px] text-muted-foreground">Sin desglose</span>}
                    <span className="text-right font-semibold tabular-nums">{a.disponible && clasificadas > 0 ? `${porcentaje.toFixed(0)}%` : '—'}</span>
                  </div>
                })}
              </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-3 py-2 text-[10px]">
              <span className="text-muted-foreground">{formatoHoras(totalFacturables)} fact. · {formatoHoras(totalNoFacturables)} no fact.</span>
              {diferenciaClasificacion && <span className="text-amber-300" title="Pendientes, observados y en curso aún no clasificados en facturable/no facturable hasta aprobarse o resolverse">{formatoHoras(horasDiferencia)} por conciliar</span>}
            </div>
          </section>
        </div>
        {/* Supervisión secundaria: volumen operativo y situaciones por resolver. */}
        <div className="grid items-stretch gap-2 xl:grid-cols-[minmax(0,1.45fr)_minmax(310px,1fr)]">
          <section className={`${superficie} flex min-h-0 flex-col`}>
            <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
              <div><h2 className="flex items-center gap-2 text-[13px] font-semibold"><BarChart3 size={15} className="text-violet-400"/> Actividad por áreas</h2><p className="text-[10px] text-muted-foreground">Participación en el tiempo registrado y pendientes</p></div>
              <button type="button" onClick={() => setMostrarAreasSinActividad(v=>!v)} className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">{mostrarAreasSinActividad ? 'Solo relevantes' : 'Todas las áreas'}</button>
            </div>
            <div className="grid grid-cols-[minmax(0,1.4fr)_5.7rem_minmax(0,1fr)_3rem] gap-2 border-b border-border/40 bg-muted/15 px-3 py-2 text-[10px] text-muted-foreground"><span>Área</span><span className="text-right">Horas</span><span>Participación</span><span className="text-right">Pend.</span></div>
            <div className="min-h-0 flex-1 max-h-[220px] overflow-y-auto overscroll-contain [scrollbar-color:rgba(139,92,246,.35)_transparent] [scrollbar-width:thin]" role="region" aria-label="Actividad en todas las áreas">
              {horasPorArea.map(a => {
                const pendientes = a.id == null ? 0 : pendientesPorArea.get(a.id) ?? 0
                return <div key={a.id ?? a.nombre} className="grid min-h-[35px] grid-cols-[minmax(0,1.4fr)_5.7rem_minmax(0,1fr)_3rem] items-center gap-2 border-b border-border/30 px-3 py-1.5 text-[11px] last:border-0 hover:bg-muted/20">
                  <span className="truncate font-medium" title={a.nombre}>{a.nombre}</span><span className="text-right tabular-nums">{formatoHoras(a.horas)}</span>
                  <div className="flex min-w-0 items-center gap-1.5"><div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500" style={{width:`${Math.max(0,Math.min(100,a.porcentaje))}%`}}/></div><span className="w-6 text-right text-[10px] text-muted-foreground">{a.porcentaje}%</span></div>
                  <span className={cn('text-right font-medium tabular-nums',pendientes>0?'text-amber-300':'text-muted-foreground')}>{pendientes}</span>
                </div>
              })}
              {!horasPorArea.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Sin actividad para el período.</p>}
            </div>
            <div className="flex justify-between border-t border-border/50 px-3 py-2 text-[11px] font-semibold"><span>Total empresa</span><span className="tabular-nums">{formatoHoras(totalHorasAreas)} · {pendientesTotal} pendientes</span></div>
          </section>
          <section className={`${superficie} flex min-h-0 flex-col`}>
            <div className="border-b border-border/50 px-3 py-2.5"><h2 className="flex items-center gap-2 text-[13px] font-semibold"><AlertTriangle size={15} className="text-amber-400"/> Alertas prioritarias</h2><p className="text-[10px] text-muted-foreground">Situaciones que requieren atención</p></div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1">{alertas.length ? alertas.map(a => <Link href={a.enlace} key={a.titulo} className="flex min-h-[35px] items-center gap-2 border-b border-border/35 py-1 text-[11px] last:border-0 hover:bg-muted/20"><span className={cn('size-1.5 shrink-0 rounded-full',a.severidad==='rojo'?'bg-rose-400':a.severidad==='ambar'?'bg-amber-400':'bg-violet-400')}/><span className="min-w-0 flex-1">{a.titulo}</span><strong className="tabular-nums">{a.cantidad}</strong><ChevronRight size={12} className="text-muted-foreground"/></Link>) : <p className="py-5 text-center text-xs text-muted-foreground">Sin alertas pendientes.</p>}</div>
          </section>
        </div>
        <section className={superficie}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5"><h2 className="flex items-center gap-2 text-[13px] font-semibold"><ListChecks size={15} className="text-violet-400"/> Estado de registros</h2><span className="text-[10px] text-muted-foreground">{totalEstado} registros · período seleccionado</span></div>
          <div className="grid gap-3 px-3 py-3 sm:grid-cols-2 xl:grid-cols-5">{estadosRegistros.map(e => <div key={e.nombre} className="min-w-0"><div className="mb-1.5 flex justify-between gap-2 text-[11px]"><span className="text-muted-foreground">{e.nombre}</span><span className="tabular-nums">{e.valor} · {pct(e.valor)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{width:`${pct(e.valor)}%`,backgroundColor:e.color}}/></div></div>)}</div>
        </section>
      </main>
    </MainLayout>
  )
}
async function fetchPrevio(desde: string, hasta: string, h: Record<string, string>) {
  if (!desde || !hasta) return null
  const d = new Date(`${desde}T00:00:00`)
  const hh = new Date(`${hasta}T00:00:00`)
  if (Number.isNaN(d.getTime()) || Number.isNaN(hh.getTime()) || hh < d) return null
  const dias = Math.round((hh.getTime() - d.getTime()) / 86_400_000) + 1
  const fin = new Date(d); fin.setDate(fin.getDate() - 1)
  const ini = new Date(fin); ini.setDate(ini.getDate() - (dias - 1))
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  const r = await fetch(`/api/actividades/resumen?desde=${iso(ini)}&hasta=${iso(fin)}`, { headers: h })
  return r.ok ? r.json() : null
}
