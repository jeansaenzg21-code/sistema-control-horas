'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createPortal } from 'react-dom'

import {

  AlertTriangle, BarChart3, Clock3, Eye, FileSpreadsheet,

  Hourglass, MoreHorizontal, Pencil, Plus, Search, Trash2, TrendingUp,

  Wallet, X,

} from 'lucide-react'

import {

  Avatar, BOTON, colorDeCliente,

  horas, IconoAlerta, inicialesDe, Kpi, PANEL, porcentaje, porcentajeConsumo,

  PRIMARIO, type AlertaCartera, type ClienteCartera,

} from './cartera-ui'

import { useAuth } from '@/lib/auth-context'
import { subscribeClientesChanges } from '@/lib/events'

type Filtro = 'todos' | 'curso' | 'riesgo' | 'pendiente' | 'sin_presupuesto'


type Totales = {

  clientes: number

  contratadas: number

  consumidas: number

  disponibles: number

  excedidas: number

  porAprobar: number

}

type Respuesta = { totales: Totales; clientes: ClienteCartera[]; alertas: AlertaCartera[] }

const FILTROS: { clave: Filtro; texto: string }[] = [

  { clave: 'todos', texto: 'Todos los clientes' },

  { clave: 'curso', texto: 'En curso' },

  { clave: 'riesgo', texto: 'En riesgo' },

  { clave: 'pendiente', texto: 'Pendientes' },

  { clave: 'sin_presupuesto', texto: 'Sin presupuesto' },

]

function coincideFiltro(estado: ClienteCartera['estado'], filtro: Filtro) {

  if (filtro === 'todos') return true

  if (filtro === 'curso') return estado === 'EN_CURSO'

  if (filtro === 'riesgo') return estado === 'EN_RIESGO'

  if (filtro === 'pendiente') return estado === 'PENDIENTE'

  return estado === 'SIN_PRESUPUESTO'

}

function formatearFecha(iso: string | null) {

  if (!iso) return ''

  const fecha = new Date(iso.replace(' ', 'T'))

  return Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

}

function AccionesCliente({ cliente, onEditar, onEliminar, onImportarPresupuesto, onAbrirGestion, soloLectura }: {

  cliente: ClienteCartera

  onEditar: (cliente: ClienteCartera) => void

  onEliminar: (cliente: ClienteCartera) => void

  onImportarPresupuesto: (cliente: ClienteCartera) => void

  onAbrirGestion: (cliente: ClienteCartera) => void

  /** Perfil SOCIO: solo el botón de ver. */
  soloLectura: boolean

}) {

  const [abierto, setAbierto] = useState(false)

  const contenedor = useRef<HTMLDivElement>(null)

  const menu = useRef<HTMLDivElement>(null)

  const [posicion, setPosicion] = useState({ top: 0, right: 0 })

  useEffect(() => {

    if (!abierto) return

    function cerrar(evento: PointerEvent) {

      if (!contenedor.current?.contains(evento.target as Node) && !menu.current?.contains(evento.target as Node)) setAbierto(false)

    }

    function tecla(evento: KeyboardEvent) { if (evento.key === 'Escape') setAbierto(false) }

    document.addEventListener('pointerdown', cerrar)

    document.addEventListener('keydown', tecla)

    const ocultar = () => setAbierto(false)

    window.addEventListener('scroll', ocultar, true)

    window.addEventListener('resize', ocultar)

    return () => { document.removeEventListener('pointerdown', cerrar); document.removeEventListener('keydown', tecla); window.removeEventListener('scroll', ocultar, true); window.removeEventListener('resize', ocultar) }

  }, [abierto])

  const { usuario } = useAuth()
  const puedeImportar = usuario?.rol !== 'admin' && cliente.servicios.length === 0

  return (

    <div className="flex items-center justify-center gap-1" ref={contenedor}>

      <button type="button" onClick={() => onAbrirGestion(cliente)} title={`Ver detalle de ${cliente.nombre}`} aria-label={`Ver detalle de ${cliente.nombre}`} className={`${BOTON} !h-8 !w-8 !shrink-0 !p-0`}><Eye size={15} /></button>

      {/* El menú "más" solo tiene acciones de escritura, así que en solo lectura
          no se monta: sería un botón que abre tres opciones prohibidas. */}
      {soloLectura ? null : (
      <div className="relative">

        <button type="button" title={`Más acciones para ${cliente.nombre}`} aria-label={`Más acciones para ${cliente.nombre}`} aria-expanded={abierto} onClick={() => { if (!abierto && contenedor.current) { const rect = contenedor.current.getBoundingClientRect(); setPosicion({ top: Math.min(rect.bottom + 5, window.innerHeight - 145), right: Math.max(8, window.innerWidth - rect.right) }) } setAbierto((valor) => !valor) }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#aeb5c8] transition hover:bg-muted hover:text-white"><MoreHorizontal size={17} /></button>

        {abierto && createPortal(<div ref={menu} style={{ top: posicion.top, right: posicion.right }} className="fixed z-[100] w-[190px] rounded-xl border border-border bg-popover p-1.5 shadow-[0_16px_40px_#0009]">

          {puedeImportar && <button type="button" onClick={() => { setAbierto(false); onImportarPresupuesto(cliente) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[#ece9f5] hover:bg-secondary"><FileSpreadsheet size={14} /> Presupuestos / Excel</button>}

          <button type="button" onClick={() => { setAbierto(false); onEditar(cliente) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[#ece9f5] hover:bg-secondary"><Pencil size={14} /> Editar cliente</button>

          <div className="my-1 border-t border-border" />

          <button type="button" onClick={() => { setAbierto(false); onEliminar(cliente) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-300 hover:bg-rose-500/10"><Trash2 size={14} /> Eliminar cliente</button>

        </div>, document.body)}

      </div>
      )}

    </div>

  )

}


/** Donut de la cartera: renderizado aquí para no tener que modificar cartera-ui.tsx. */
type MetricaGrafico = 'horas' | 'propuestas' | 'servicios'

function valorDe(cliente: ClienteCartera, modo: MetricaGrafico): number {
  if (modo === 'propuestas') return cliente.horasPropuestas
  if (modo === 'servicios') return cliente.serviciosConteo
  return cliente.horasContratadas
}

function GraficoCartera({ clientes, modo }: {
  clientes: ClienteCartera[]
  modo: MetricaGrafico
}) {
  const valores = clientes.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    valor: Math.max(0, Number(valorDe(c, modo)) || 0),
    color: colorDeCliente(c.id),
  })).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor)
  const total = valores.reduce((suma, c) => suma + c.valor, 0)
  const principales = valores.slice(0, 5)
  const otros = valores.slice(5).reduce((suma, c) => suma + c.valor, 0)
  let avance = 0
  const segmentos = principales.map((c) => {
    const anterior = avance
    avance += c.valor / total * 100
    return `${c.color} ${anterior.toFixed(4)}% ${avance.toFixed(4)}%`
  })
  if (otros > 0) segmentos.push(`#687189 ${avance.toFixed(4)}% 100%`)
  const gradiente = total ? `conic-gradient(${segmentos.join(', ')})` : 'conic-gradient(#34394c 0% 100%)'
  // Que se imprime en el centro y en la leyenda depende de la metrica: unas
  // horas se leen como horas, un conteo como numero a secas.
  const enHoras = modo === 'horas' || modo === 'propuestas'
  const formato = (valor: number) => (enHoras ? horas(valor) : String(valor))
  const nombreMetrica =
    modo === 'horas' ? 'horas contratadas'
      : modo === 'propuestas' ? 'horas propuestas'
        : 'servicios importados'
  const vacio: Record<MetricaGrafico, string> = {
    horas: 'Las horas se mostrarán cuando se aprueben y activen las bolsas.',
    propuestas: 'Este cliente todavía no tiene horas propuestas en su presupuesto.',
    servicios: 'Este cliente todavía no tiene servicios importados.',
  }
  const pie: Record<MetricaGrafico, string | null> = {
    horas: null,
    propuestas:
      'Son horas que el Excel propone y aún no están aprobadas: no son contrato.',
    servicios: 'Cada servicio es una bolsa declarada en el Excel del cliente.',
  }
  const cantidadClientes = valores.length

  return (
    <div className="px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative mx-auto aspect-square w-[132px] shrink-0 rounded-full p-[18px] 2xl:w-[166px] 2xl:p-[22px]" style={{ background: gradiente }} role="img" aria-label={total ? `Distribución real de ${nombreMetrica}: ${formato(total)}` : 'Sin datos para distribuir'}>
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-card text-center">
            <strong className="text-[21px] leading-none tracking-tight text-white">{cantidadClientes}</strong>
            <span className="mt-1 text-[10px] text-[#a9b1c5]">{cantidadClientes === 1 ? 'Cliente' : 'Clientes'}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          {total > 0 ? <>
            {principales.map((c) => <div key={c.id} className="flex min-w-0 items-center gap-1.5 text-[10px] 2xl:text-[11px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: c.color }} />
              <span title={c.nombre} className="min-w-0 flex-1 truncate text-[#d4d8e6]">{c.nombre}</span>
              <strong className="shrink-0 whitespace-nowrap text-[#f5f4fc]">{formato(c.valor)}</strong>
              <span className="w-[27px] shrink-0 text-right text-[#a5aec3]">{Math.round(c.valor / total * 100)}%</span>
            </div>)}
            {otros > 0 && <div className="flex min-w-0 items-center gap-1.5 text-[10px]"><span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-muted-foreground" /><span className="min-w-0 flex-1 truncate text-[#d4d8e6]">Otros clientes</span><strong className="shrink-0 text-white">{formato(otros)}</strong><span className="w-[27px] text-right text-[#a5aec3]">{Math.round(otros / total * 100)}%</span></div>}
          </> : <p className="text-[11px] leading-relaxed text-[#a5aec4]">{vacio[modo]}</p>}
        </div>
      </div>
      {pie[modo] && <p className="mt-2 rounded-lg border border-border bg-popover/60 px-2.5 py-1.5 text-[10px] leading-snug text-[#c4bdd6]">{pie[modo]}</p>}
    </div>
  )
}

export function CarteraClientes({ onCrear, onEditar, onEliminar, onImportarPresupuesto, onAbrirGestion, areaId = null }: {
  onCrear: () => void

  onEditar: (cliente: ClienteCartera) => void

  onEliminar: (cliente: ClienteCartera) => void

  onImportarPresupuesto: (cliente: ClienteCartera) => void

  onAbrirGestion: (cliente: ClienteCartera) => void
  areaId?: number | null
}) {

  const { usuario } = useAuth()

  // El SOCIO recorre la cartera como el administrador, pero sin los controles
  // de escritura. Ocultarlos aquí no es la protección: la API los rechaza igual
  // (lib/auth.ts). Es solo para no ofrecer botones que no harían nada.
  const soloLectura = usuario?.rol === 'socio'

  const [datos, setDatos] = useState<Respuesta | null>(null)

  const [cargando, setCargando] = useState(true)

  const [error, setError] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState('')

  const [mostrarBusqueda, setMostrarBusqueda] = useState(false)

  const [filtro, setFiltro] = useState<Filtro>('todos')


  const [alertasExpandidas, setAlertasExpandidas] = useState(false)

  const [modoGrafico, setModoGrafico] = useState<'auto' | 'horas' | 'propuestas' | 'servicios'>('auto')

  const cargar = useCallback(async () => {

    try {

      const respuesta = await fetch('/api/clientes/cartera')

      const cuerpo = await respuesta.json()

      if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se pudo cargar la cartera.')

      setDatos(cuerpo as Respuesta)

      setError(null)

    } catch (fallo) {

      setError(fallo instanceof Error ? fallo.message : 'Error al cargar la cartera.')

    } finally { setCargando(false) }

  }, [])

  useEffect(() => { void cargar() }, [cargar])

  // La cartera viene de su propia consulta, no de `clientes` (el contexto): son
  // dos endpoints con cifras distintas. Al dar de alta, editar o borrar un
  // cliente el contexto avisa, y aquí se vuelve a pedir la cartera. Sin esto el
  // cliente nuevo no salía en la tabla hasta recargar la página a mano, aunque
  // el POST hubiera ido bien.
  useEffect(() => {
    return subscribeClientesChanges(() => {
      setCargando(true)
      void cargar()
    })
  }, [cargar])

  const clientes = useMemo(() => {

    const texto = busqueda.trim().toLocaleLowerCase('es-PE')

    return (datos?.clientes ?? [])

      .filter((cliente) => areaId == null || cliente.area_id === areaId)
      .filter((cliente) => coincideFiltro(cliente.estado, filtro))

      .filter((cliente) => !texto || [cliente.nombre, cliente.ruc, cliente.area_nombre, cliente.correo, ...cliente.servicios].some((campo) => (campo ?? '').toLocaleLowerCase('es-PE').includes(texto)))
      .sort((a, b) => b.horasConsumidas - a.horasConsumidas)
  }, [datos, busqueda, filtro])

  const alertas = datos?.alertas ?? []

  const alertasOrdenadas = [...alertas].sort((a, b) => ({ desviacion: 0, pendiente: 1, informativa: 2 }[a.tipo] - { desviacion: 0, pendiente: 1, informativa: 2 }[b.tipo]))
  const alertasVisibles = alertasExpandidas ? alertasOrdenadas : alertasOrdenadas.slice(0, 3)
  const cantidadDesviaciones = alertas.filter((alerta) => alerta.tipo === 'desviacion').length
  const cantidadPendientes = alertas.filter((alerta) => alerta.tipo === 'pendiente').length

  const totales = datos?.totales

  const horasParaGrafico = (datos?.clientes ?? []).reduce((suma, cliente) => suma + Math.max(0, cliente.horasContratadas), 0)

  // Una distribucion solo puede mostrar a quien tiene valor. Con cero horas
  // contratadas en toda la cartera, la metrica de proyectos dejaba fuera a
  // casi todos y el grafico se reducia a un unico cliente. Se elige la
  // primera metrica que de valor a la mayoria, y se dice cual se uso.
  const metricas: { modo: MetricaGrafico; valores: (c: ClienteCartera) => number }[] = [
    { modo: 'horas', valores: (c) => c.horasContratadas },
    { modo: 'propuestas', valores: (c) => c.horasPropuestas },
    { modo: 'servicios', valores: (c) => c.serviciosConteo },
  ]
  const modoVisible: MetricaGrafico = useMemo(() => {
    if (modoGrafico !== 'auto') return modoGrafico
    const lista = datos?.clientes ?? []
    if (lista.length === 0) return 'propuestas'
    const conValor = (fn: (c: ClienteCartera) => number) =>
      lista.filter((c) => (fn(c) || 0) > 0).length
    const elegido = metricas.find((m) => conValor(m.valores) * 2 >= lista.length)
    return elegido?.modo ?? 'servicios'
  }, [modoGrafico, datos])

  if (cargando) return <div className={`${PANEL} px-4 py-10 text-center text-sm text-[#a1a8bd]`}>Cargando la cartera de clientes...</div>

  if (error || !datos || !totales) return <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-300">{error ?? 'No se pudo cargar la cartera.'}<button type="button" onClick={() => { setCargando(true); void cargar() }} className="ml-3 rounded-lg border border-rose-400/40 px-3 py-1 text-xs">Reintentar</button></div>

  return (
    <div className="min-w-0">
      {/* Dos columnas independientes: los cuatro indicadores y la cartera a la izquierda;
          distribución y alertas comienzan ARRIBA, en el espacio liberado a la derecha. */}
      <section aria-label="Cartera y alertas" className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_326px] 2xl:grid-cols-[minmax(0,1fr)_minmax(385px,31%)]">
        <div className="min-w-0 space-y-2.5">
          <section aria-label="Indicadores de cartera" className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi icono={<Clock3 size={19} />} etiqueta="Horas consumidas" valor={horas(totales.consumidas)} avance={porcentajeConsumo(totales.contratadas, totales.consumidas)} />
            <Kpi icono={<Wallet size={19} />} etiqueta="Horas disponibles" valor={horas(totales.disponibles)} nota="Saldo de bolsas activas" tono="verde" />
            <Kpi icono={<Hourglass size={19} />} etiqueta="Pendientes de aprobar" valor={horas(totales.porAprobar)} nota="Incluidas en registradas" tono="ambar" />
            <Kpi icono={<TrendingUp size={19} />} etiqueta="Exceso de clientes" valor={totales.excedidas > 0 ? `+${horas(totales.excedidas)}` : '0 h'} nota="Sobre bolsas activas" tono="rojo" />
          </section>

          {/* La barra termina exactamente donde termina la tabla; Nuevo cliente queda a su derecha. */}
          <div className={`${PANEL} !rounded-xl min-w-0 overflow-hidden border-border px-2.5 py-2`}>
            <div className="flex min-w-0 items-center gap-2">
              <div role="tablist" aria-label="Filtrar clientes" className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {FILTROS.map(({ clave, texto }) => {
                  const cantidad = clave === 'todos' ? datos.clientes.length : datos.clientes.filter((c) => coincideFiltro(c.estado, clave)).length
                  return <button key={clave} type="button" role="tab" aria-selected={filtro === clave} onClick={() => setFiltro(clave)} className={`relative inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-[10px] font-semibold transition ${filtro === clave ? 'bg-violet-500/20 text-[#ead9ff] border border-primary shadow-[inset_0_-2px_0_#ae83f5]' : 'border border-transparent text-[#aab2c6] hover:bg-muted hover:text-white'}`}>
                    {texto}<span className={`ml-1 rounded-md px-1.5 py-0.5 text-[10px] ${filtro === clave ? 'bg-violet-500/25' : 'bg-muted'}`}>{cantidad}</span>
                  </button>
                })}
              </div>
              <button type="button" onClick={() => setMostrarBusqueda((v) => !v)} aria-label="Buscar clientes" title="Buscar clientes" className={`${BOTON} !h-8 !shrink-0 !px-2.5`}><Search size={14} /></button>
              {!soloLectura && <button type="button" onClick={onCrear} className={`${PRIMARIO} !h-8 !shrink-0 !px-2.5 !text-[11px]`}><Plus size={14} /> Nuevo cliente</button>}
            </div>
            {(mostrarBusqueda || busqueda) && <div className="relative mt-1.5 w-full"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#929bb1]" /><input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente, servicio o división..." className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-xs text-white outline-none placeholder:text-[#858fa6] focus:border-violet-500" />{busqueda && <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a5acc2]"><X size={14} /></button>}</div>}
          </div>

          <div className={`${PANEL} min-w-0 overflow-hidden !rounded-xl`}>
            <div className="min-w-0 overflow-hidden">
              {/* Sin min-w: la tabla es table-fixed con anchos en porcentaje, así
                  que se ajusta sola al panel. Poner un ancho mínimo obligaba a
                  aparecer la barra horizontal para esconder columnas. */}
              <table className="w-full table-fixed border-collapse text-left text-[11px] text-[#ecedf5]">
                <colgroup><col style={{ width: '28%' }} /><col style={{ width: '15%' }} /><col style={{ width: '18%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /></colgroup>
                <thead className="bg-secondary text-[#abb4c8]"><tr className="border-b border-border">
                  <th scope="col" className="py-3 pl-3 pr-2 font-medium">Cliente</th>
                  <th scope="col" className="px-2 py-3 text-center font-medium">Horas<br />contratadas</th>
                  <th scope="col" className="px-2 py-3 text-center font-medium">Horas<br />consumidas</th>
                  <th scope="col" className="px-2 py-3 text-center font-medium">Horas<br />disponibles</th>
                  <th scope="col" className="px-2 py-3 text-center font-medium">Desviación</th>
                  <th scope="col" className="px-1 py-3 text-center font-medium">Acciones</th>
                </tr></thead>
                <tbody>
                  {clientes.map((cliente) => <Fragment key={cliente.id}>
                    <tr className="group border-b border-border hover:bg-muted/75">
                      <td className="py-3 pl-3 pr-2 align-middle"><div className="flex min-w-0 items-center gap-2.5"><Avatar iniciales={inicialesDe(cliente.nombre)} color={colorDeCliente(cliente.id)} /><div className="min-w-0"><button type="button" onClick={() => onAbrirGestion(cliente)} title={cliente.nombre} className="block max-w-full text-left text-[11px] font-semibold leading-[1.35] text-[#f3f3fb] hover:text-violet-300 [overflow-wrap:anywhere]">{cliente.nombre}</button><p title={cliente.area_nombre} className="mt-1 text-[10px] leading-tight text-[#97a1b6]">{cliente.area_nombre}</p>{cliente.ruc && <span title={cliente.ruc} className="mt-0.5 block text-[9px] text-[#8390a9]">RUC {cliente.ruc}</span>}</div></div></td>
                      <td className="px-2 text-center font-semibold tabular-nums whitespace-nowrap">{horas(cliente.horasContratadas)}{cliente.horasContratadas === 0 && <span className="block whitespace-normal text-[9px] font-normal leading-tight text-[#919bb2]">Sin bolsa activa</span>}</td>
                      <td className="px-2 py-2 text-center align-middle">
                        <span className="block font-semibold tabular-nums">{horas(cliente.horasConsumidas)}</span>
                        <div className="mx-auto mt-1.5 max-w-[86px]" aria-label={`Consumo: ${porcentajeConsumo(cliente.horasContratadas, cliente.horasConsumidas)} %`}>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, porcentajeConsumo(cliente.horasContratadas, cliente.horasConsumidas))}%` }} />
                          </div>
                          <span className="mt-1 block text-center text-[10px] tabular-nums text-[#aeb7c8]">{porcentajeConsumo(cliente.horasContratadas, cliente.horasConsumidas)} %</span>
                        </div>
                      </td>
                      <td className="px-2 text-center whitespace-nowrap font-semibold tabular-nums">{horas(cliente.horasDisponibles)}</td>
                      <td className="px-2 text-center">{cliente.horasExcedidas > 0 ? <span className="font-semibold text-rose-300">+{horas(cliente.horasExcedidas)}{cliente.desviacionPorcentaje !== null && <span className="mt-0.5 block text-[9px]">{porcentaje(cliente.desviacionPorcentaje)}</span>}</span> : <span className="text-[#a1aabd]">Sin exceso</span>}</td>
                      <td className="px-1 py-2 text-center"><AccionesCliente cliente={cliente} onEditar={onEditar} onEliminar={onEliminar} onImportarPresupuesto={onImportarPresupuesto} onAbrirGestion={onAbrirGestion} soloLectura={soloLectura} /></td>
                    </tr>
                    <tr className="border-b border-border last:border-0"><td colSpan={6} className="px-3 pb-2.5 pt-1"><div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[10px]"><span className="shrink-0 font-medium text-[#a0a8bf]">Servicios activos:</span>{cliente.servicios.length === 0 ? <span className="text-[#8794ac]">Sin servicios cargados</span> : <>{cliente.servicios.slice(0, 3).map((servicio) => <span key={servicio} title={servicio} className="max-w-[168px] truncate rounded-md bg-muted px-2 py-1 text-[#d0d6e6]">{servicio}</span>)}{cliente.servicios.length > 3 && <span className="rounded-md bg-muted px-2 py-1 text-[#c1c9dd]">+{cliente.servicios.length - 3} más</span>}</>}</div></td></tr>
                  </Fragment>)}
                </tbody>
              </table>
              {clientes.length === 0 && <p className="px-4 py-10 text-center text-xs text-[#a6aec3]">{datos.clientes.length === 0 ? 'Todavía no hay clientes registrados.' : 'No encontramos clientes para esos filtros.'}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5 text-[10px] text-[#a0a8bc]"><span>Mostrando {clientes.length} de {datos.clientes.length} clientes</span><span className="hidden 2xl:inline">Selecciona un cliente para abrir su gestión integral</span></div>
          </div>
        </div>

        <aside aria-label="Distribución y alertas" className="min-w-0 space-y-2.5">
            <section className={`${PANEL} min-w-0 overflow-hidden !rounded-xl`}>
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3"><div className="flex min-w-0 items-center gap-2"><BarChart3 size={17} className="shrink-0 text-violet-400" /><h2 className="text-[12px] font-semibold text-[#f2f0f9]">Distribución por cliente</h2></div><label className="shrink-0"><span className="sr-only">Métrica del gráfico</span><select value={modoGrafico} onChange={(e) => setModoGrafico(e.target.value as 'auto' | 'horas' | 'propuestas' | 'servicios')} className="max-w-[105px] rounded-md border border-border bg-secondary px-1.5 py-1.5 text-[9px] text-[#e0deec] outline-none"><option value="auto">Automático</option><option value="horas">Contratadas</option><option value="propuestas">Propuestas</option><option value="servicios">Servicios</option></select></label></div>
              <GraficoCartera clientes={datos.clientes} modo={modoVisible} />
            </section>

            <section className={`${PANEL} min-w-0 overflow-hidden !rounded-xl`}>
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <AlertTriangle size={17} className="shrink-0 text-rose-400" />
                  <h2 className="text-[12px] font-semibold text-[#f2f0f9]">Alertas y desviaciones</h2>
                </div>
                {alertas.length > 3 && <button type="button" onClick={() => setAlertasExpandidas((v) => !v)} aria-expanded={alertasExpandidas} className={`${BOTON} !shrink-0 !px-2 !py-1 text-[10px]`}>{alertasExpandidas ? 'Ver menos' : `Ver todas (${alertas.length})`}</button>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-[10px] text-[#aeb7ca]">
                <span><strong className="text-[#e6def7]">{alertas.length}</strong> alertas</span>
                <span><strong className="text-rose-300">{cantidadDesviaciones}</strong> desviaciones</span>
                <span><strong className="text-amber-300">{cantidadPendientes}</strong> pendientes</span>
              </div>
              <div className={`divide-y divide-border px-3 ${alertasExpandidas ? 'max-h-[420px] overflow-y-auto [scrollbar-width:thin]' : ''}`}>
                {alertasVisibles.map((alerta) => (
                  <button type="button" key={alerta.id} onClick={() => { const c = datos.clientes.find((x) => x.id === alerta.clienteId); if (c) onAbrirGestion(c) }} className="flex w-full items-start gap-2.5 py-3 text-left hover:bg-white/[0.025]">
                    <IconoAlerta tipo={alerta.tipo} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold text-[#e8e8f4]">{alerta.titulo}</span>
                      <span className="mt-0.5 block text-[10px] text-[#9ba4b8]">{alerta.clienteNombre}</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-[#abb4c9]">{alerta.descripcion}</span>
                      {alerta.cuando && <span className="mt-1 block text-[9px] text-[#8993a8]">Última actividad: {formatearFecha(alerta.cuando)}</span>}
                    </span>
                    <span className={`shrink-0 whitespace-nowrap text-[11px] font-bold ${alerta.tipo === 'desviacion' ? 'text-rose-300' : alerta.tipo === 'pendiente' ? 'text-amber-300' : 'text-violet-300'}`}>{alerta.dato}</span>
                  </button>
                ))}
                {alertas.length === 0 && <p className="py-6 text-center text-xs text-[#a1abc0]">No hay alertas por ahora.</p>}
              </div>
              {!alertasExpandidas && alertas.length > 3 && <button type="button" onClick={() => setAlertasExpandidas(true)} className="w-full border-t border-border px-3 py-2 text-center text-[11px] font-medium text-violet-300 hover:bg-violet-500/10">Mostrar {alertas.length - 3} alertas más</button>}
            </section>
        </aside>
      </section>
    </div>
  )
}
