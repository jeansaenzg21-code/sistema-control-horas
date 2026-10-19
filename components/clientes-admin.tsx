'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { BarChart3, ClipboardList, FolderKanban, Loader2, Users, Clock3, Wallet, FileCheck2, Search, AlertTriangle, CheckCircle2, Target, ChevronRight, RefreshCw, Eye, ChevronLeft, BriefcaseBusiness, X, UserRound, Layers3 } from 'lucide-react'

import { useAuth } from '@/lib/auth-context'

import { useAreas } from '@/lib/areas-context'

import type { ClienteCartera } from './cartera-ui'
import type { ResumenPresupuesto } from '@/lib/presupuestos/consultar'

import { SettingsClientePresupuestos } from './settings-cliente-presupuestos'
import { ClienteGestion } from './cliente-gestion'

import { formatoHoras } from '@/lib/utils'

type TabKey = 'general' | 'areas' | 'presupuestos'

type PresupuestoLista = ResumenPresupuesto

export function ClientesAdmin({ onCabecera }: { onCabecera?: (titulo: string, subtitulo: string) => void }) {
  const { usuario } = useAuth()
  const esSocio = usuario?.rol === 'socio'

  const { areas, cargarAreas } = useAreas()

  const [tab, setTab] = useState<TabKey>('general')

  const [areaId, setAreaId] = useState<number | null>(null)

  const [busquedaDivision, setBusquedaDivision] = useState('')

  const [estadoDivision, setEstadoDivision] = useState('todos')

  const [paginaDivision, setPaginaDivision] = useState(1)

  const [filasDivision, setFilasDivision] = useState(5)

  const [mostrarTodasAlertasDivision, setMostrarTodasAlertasDivision] = useState(false)

  const [cargandoCartera, setCargandoCartera] = useState(false)

  interface CarteraRespuestaLocal { totales: { clientes: number; contratadas: number; consumidas: number; disponibles: number; excedidas: number; porAprobar: number }; clientes: ClienteCartera[]; alertas: Array<{ id: string | number; tipo: 'desviacion' | 'pendiente' | 'informativa'; titulo: string; descripcion: string; clienteNombre: string; clienteId: number; dato: string }> }

  const [cartera, setCartera] = useState<CarteraRespuestaLocal | null>(null)

  const [busquedaGeneral, setBusquedaGeneral] = useState('')

  const [filtroGeneral, setFiltroGeneral] = useState('todos')

  const [areaGeneral, setAreaGeneral] = useState<number | null>(null)

  const [paginaPresupuestos, setPaginaPresupuestos] = useState(1)

  const PRESUPUESTOS_POR_PAGINA = 9

  // Budgets tab state.

  const [clientesCartera, setClientesCartera] = useState<ClienteCartera[]>([])

  const [presupuestosPorCliente, setPresupuestosPorCliente] = useState<Record<number, PresupuestoLista[]>>({})

  const [cargandoPresupuestos, setCargandoPresupuestos] = useState(false)

  const [filtroPresupuestos, setFiltroPresupuestos] = useState('todos')

  const [clientePresupuesto, setClientePresupuesto] = useState<{ id: number; nombre: string } | null>(null)
  const [clienteGestion, setClienteGestion] = useState<ClienteCartera | null>(null)
  const [presupuestoSeleccionado, setPresupuestoSeleccionado] = useState<{ cliente: ClienteCartera; presupuesto: PresupuestoLista } | null>(null)
  const [busquedaSolicitudes, setBusquedaSolicitudes] = useState('')
  const [divisionSolicitudes, setDivisionSolicitudes] = useState<number | null>(null)
  const [paginaSolicitudes, setPaginaSolicitudes] = useState(1)
  const POR_PAGINA_SOLICITUDES = 8
  const [accionandoPresupuesto, setAccionandoPresupuesto] = useState(false)
  const [avisoPresupuesto, setAvisoPresupuesto] = useState<{ ok: boolean; texto: string } | null>(null)

  // Campos opcionales: su disponibilidad depende del contrato real de /api/presupuestos.
  // No se atribuyen bolsas u horas sin que el backend las proporcione.
  type Registro = Record<string, unknown>
  const objeto = (valor: unknown): Registro | null => valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Registro : null
  const arreglo = (valor: unknown): unknown[] => Array.isArray(valor) ? valor : []
  const texto = (valor: unknown): string => typeof valor === 'string' ? valor : ''
  const numero = (valor: unknown): number | null => typeof valor === 'number' && Number.isFinite(valor) ? valor : (typeof valor === 'string' && valor.trim() && Number.isFinite(Number(valor)) ? Number(valor) : null)
  const valorDe = (o: Registro | null, claves: string[]): unknown => claves.map(k => o?.[k]).find(v => v !== undefined && v !== null)
  const etiqueta = (o: Registro | null, claves: string[], fallback = 'Sin identificar') => texto(valorDe(o, claves)) || fallback
  const horas = (o: Registro | null, claves: string[]): number | null => numero(valorDe(o, claves))
  const serviciosDe = (p: PresupuestoLista): Registro[] => p.servicios.map((s) => ({ id: s.id, origen: s.origen, nombre: s.nombre, horas: s.horas, nota: s.nota, proyectoId: s.proyectoId, asignaciones: s.asignaciones }) as Registro)
  const responsablesDe = (servicio: Registro): Registro[] => arreglo(valorDe(servicio, ['asignaciones','participantes','integrantes','responsables','equipo'])).map(objeto).filter((v): v is Registro => v !== null)
  const horasPresupuesto = (p: PresupuestoLista): number => Number(p.totales.horasDetallado ?? 0)


  useEffect(() => { if (areas.length === 0) void cargarAreas() }, [areas.length, cargarAreas])

  useEffect(() => {

    if (!onCabecera) return

    onCabecera('Cartera de clientes', 'Vista general, por división y presupuestos de toda la empresa.')

  }, [onCabecera])

  const cargarCartera = useCallback(async () => {

    setCargandoCartera(true)

    try {

      const respuesta = await fetch('/api/clientes/cartera')

      const cuerpo = await respuesta.json()

      if (respuesta.ok) {

        const clientes = Array.isArray(cuerpo?.clientes) ? cuerpo.clientes : []

        setCartera(cuerpo as CarteraRespuestaLocal)

        setClientesCartera(clientes as ClienteCartera[])

      }

        setCartera(cuerpo as CarteraRespuestaLocal)

        setClientesCartera(Array.isArray(cuerpo?.clientes) ? cuerpo.clientes : [])

    } finally {

      setCargandoCartera(false)

    }

  }, [])

  const cargarPresupuestos = useCallback(async () => {

    setCargandoPresupuestos(true)

    try {

      const respuesta = await fetch('/api/clientes/cartera')

      const cuerpo = await respuesta.json()

      const clientes = (cuerpo?.clientes ?? []) as ClienteCartera[]

      setClientesCartera(clientes)

      const resultados = await Promise.all(clientes.map(async (cliente) => {

        try {

          const r = await fetch(`/api/presupuestos?cliente_id=${cliente.id}`)

          const lista = r.ok ? (await r.json()) as PresupuestoLista[] : []

          return [cliente.id, lista] as const

        } catch { return [cliente.id, []] as const }

      }))

      setPresupuestosPorCliente(Object.fromEntries(resultados))

    } finally {

      setCargandoPresupuestos(false)

    }

  }, [])

  useEffect(() => {

    if (tab === 'presupuestos' && clientesCartera.length === 0 && !cargandoPresupuestos) {

      void cargarPresupuestos()

    }

  }, [tab, clientesCartera.length, cargandoPresupuestos, cargarPresupuestos])

  useEffect(() => {

    if (tab === 'general' && !cartera && !cargandoCartera) {

      void cargarCartera()

      void cargarPresupuestos()

    }

  }, [tab, cartera, cargandoCartera, cargarCartera, cargarPresupuestos])

  const filasPresupuestos = useMemo(() => {

    const resultados: Array<{ cliente: ClienteCartera; presupuestos: PresupuestoLista[]; ultimo: PresupuestoLista | null }> = []

    for (const cliente of clientesCartera) {

      const presupuestos = presupuestosPorCliente[cliente.id] ?? []

      const ultimo = presupuestos.length ? presupuestos[0] : null

      resultados.push({ cliente, presupuestos, ultimo })

    }

    if (filtroPresupuestos === 'pendientes') {

      return resultados.filter(({ presupuestos }) => (presupuestos ?? []).some((p) => p.estado === 'EN_REVISION' || p.estado === 'BORRADOR'))

    }

    if (filtroPresupuestos === 'aprobados') return resultados.filter(({ ultimo }) => ultimo?.estado === 'APROBADO')

    if (filtroPresupuestos === 'observados') return resultados.filter(({ ultimo }) => ultimo?.estado === 'OBSERVADO')

    return resultados

  }, [clientesCartera, presupuestosPorCliente, filtroPresupuestos])

  const presupuestosPendientes = useMemo(() => {

    const resultado: Array<{ cliente: ClienteCartera; presupuesto: PresupuestoLista }> = []

    for (const cliente of clientesCartera) {

      for (const presupuesto of presupuestosPorCliente[cliente.id] ?? []) {

        if (presupuesto.estado === 'EN_REVISION' || presupuesto.estado === 'BORRADOR') {

          resultado.push({ cliente, presupuesto })

        }

      }

    }

    return resultado

  }, [clientesCartera, presupuestosPorCliente])

  const pendientesRevision = presupuestosPendientes

  const pendientesRevisionGeneral = pendientesRevision
  const totalPaginasPresupuestos = Math.max(1, Math.ceil(pendientesRevisionGeneral.length / PRESUPUESTOS_POR_PAGINA))

  const paginaActualPresupuestos = Math.min(paginaPresupuestos, totalPaginasPresupuestos)

  const pendientesRevisionPagina = pendientesRevisionGeneral.slice((paginaActualPresupuestos - 1) * PRESUPUESTOS_POR_PAGINA, paginaActualPresupuestos * PRESUPUESTOS_POR_PAGINA)

  const carteraFiltrada = (cartera?.clientes ?? []).filter((c) => {

    if (areaGeneral != null && c.area_id !== areaGeneral) return false

    if (busquedaGeneral && !c.nombre.toLocaleLowerCase('es').includes(busquedaGeneral.trim().toLocaleLowerCase('es'))) return false

    if (filtroGeneral === 'riesgo') return c.estado === 'EN_RIESGO' || c.horasExcedidas > 0

    if (filtroGeneral === 'sin_presupuesto') return c.estado === 'SIN_PRESUPUESTO'

    if (filtroGeneral === 'desviaciones') return c.horasExcedidas > 0

    return true

  })

  const formatearEstado = (estado: string) => ({

    EN_CURSO: 'En curso', EN_RIESGO: 'En riesgo', SIN_PRESUPUESTO: 'Sin presupuesto',

    EN_REVISION: 'En revisión', BORRADOR: 'Borrador', APROBADO: 'Aprobado',

    OBSERVADO: 'Observado', PENDIENTE: 'Pendiente',

  }[estado] ?? estado.replaceAll('_', ' ').toLocaleLowerCase('es'))

  const formato = (horas: number) => formatoHoras(Number(horas) || 0)

  // Síntesis empresarial: categorías excluyentes y métricas calculadas con cartera real.

  const focoCartera = useMemo(() => {

    const clientes = cartera?.clientes ?? []

    const total = clientes.length

    let sinBolsa = 0

    let enRiesgo = 0

    let cercaDelLimite = 0

    const excedidos = new Set<number>()

    for (const cliente of clientes) {

      const contratadas = Number(cliente.horasContratadas) || 0

      const consumidas = Number(cliente.horasConsumidas) || 0

      const excedidas = Number(cliente.horasExcedidas) || 0

      if (contratadas <= 0) sinBolsa++

      else if (cliente.estado === 'EN_RIESGO' || excedidas > 0) enRiesgo++

      if (contratadas > 0 && consumidas / contratadas >= 0.9 && excedidas <= 0) cercaDelLimite++

      if (excedidas > 0) excedidos.add(cliente.id)

    }

    const porArea = new Map<string, { id: number | null; nombre: string; alertas: number }>()

    const clientesPorId = new Map(clientes.map((c) => [c.id, c]))

    for (const alerta of cartera?.alertas ?? []) {

      const cliente = clientesPorId.get(alerta.clienteId)

      if (!cliente) continue

      const clave = String(cliente.area_id ?? cliente.area_nombre)

      const anterior = porArea.get(clave) ?? { id: cliente.area_id ?? null, nombre: cliente.area_nombre || 'Sin división', alertas: 0 }

      anterior.alertas++

      porArea.set(clave, anterior)

    }

    const ordenadas = [...porArea.values()].sort((a, b) => b.alertas - a.alertas || a.nombre.localeCompare(b.nombre, 'es'))

    return {

      total,

      sinBolsa,

      enRiesgo,

      resto: Math.max(0, total - sinBolsa - enRiesgo),

      excedidos: excedidos.size,

      cercaDelLimite,

      areasConAlertas: ordenadas.length,

      areasPrioritarias: ordenadas.slice(0, 3),

    }

  }, [cartera])

  // Se usa la misma cartera cargada del servidor para todos los bloques de esta vista.

  // Si un cliente tiene bolsas repartidas entre varias divisiones, la API deberá devolver

  // registros ya desglosados por división para que las sumas sean contractualmente exactas.

  const nombreDivision = areaId == null ? 'todas las divisiones' : (areas.find(a => a.id === areaId)?.nombre ?? 'la división seleccionada')

  const clientesDivision = useMemo(() => (cartera?.clientes ?? []).filter(c => areaId == null || Number(c.area_id) === areaId).sort((a, b) => Number(b.horasContratadas) - Number(a.horasContratadas) || Number(b.horasConsumidas) - Number(a.horasConsumidas) || a.nombre.localeCompare(b.nombre, 'es')), [cartera, areaId])

  const resumenDivision = useMemo(() => {

    const suma = (key: 'horasContratadas' | 'horasConsumidas' | 'horasDisponibles') => clientesDivision.reduce((ac, c) => ac + Math.max(0, Number(c[key]) || 0), 0)

    const contratadas = suma('horasContratadas')

    const consumidas = suma('horasConsumidas')

    const disponibles = suma('horasDisponibles')

    const clasificar = (c: ClienteCartera) => {

      const contratado = Math.max(0, Number(c.horasContratadas) || 0)

      const consumido = Math.max(0, Number(c.horasConsumidas) || 0)

      const excedido = Math.max(0, Number(c.horasExcedidas) || 0)

      if (contratado <= 0) return 'sin_presupuesto'

      if (excedido > 0 || consumido > contratado || c.estado === 'EN_RIESGO') return 'riesgo'

      if (consumido / contratado >= 0.85) return 'limite'

      return 'curso'

    }

    const categorias = { curso: 0, limite: 0, riesgo: 0, sin_presupuesto: 0 }

    clientesDivision.forEach(c => { categorias[clasificar(c)]++ })

    return { clientes: clientesDivision.length, contratadas, consumidas, disponibles, categorias, clasificar }

  }, [clientesDivision])

  const alertasDivision = useMemo(() => {

    const ids = new Set(clientesDivision.map(c => c.id))

    return (cartera?.alertas ?? []).filter(a => ids.has(a.clienteId))

  }, [cartera, clientesDivision])

  const clientesDivisionFiltrados = useMemo(() => clientesDivision.filter(c => {

    if (busquedaDivision.trim() && !(`${c.nombre} ${(c.servicios ?? []).join(' ')}`).toLocaleLowerCase('es').includes(busquedaDivision.trim().toLocaleLowerCase('es'))) return false

    if (estadoDivision !== 'todos' && resumenDivision.clasificar(c) !== estadoDivision) return false

    return true

  }), [clientesDivision, busquedaDivision, estadoDivision, resumenDivision])

  const paginasDivision = Math.max(1, Math.ceil(clientesDivisionFiltrados.length / filasDivision))

  const paginaDivisionActual = Math.min(paginaDivision, paginasDivision)

  const paginaClientesDivision = clientesDivisionFiltrados.slice((paginaDivisionActual - 1) * filasDivision, paginaDivisionActual * filasDivision)

  useEffect(() => { setPaginaDivision(1); setMostrarTodasAlertasDivision(false) }, [areaId, busquedaDivision, estadoDivision, filasDivision])

  const revisarPresupuestosClienteDivision = (cliente: ClienteCartera) => {

    // El administrador ve la misma gestión que el jefe de área: bolsas y equipo.

    setClienteGestion(cliente)

  }

  const ejecutarAccionPresupuesto = async (presupuestoId: number, accion: 'APROBAR' | 'ACTIVAR_BOLSAS') => {

    setAccionandoPresupuesto(true)

    setAvisoPresupuesto(null)

    try {

      const respuesta = await fetch(`/api/presupuestos/${presupuestoId}/accion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, justificacion: '' }),
      })

      const cuerpo = await respuesta.json()

      setAvisoPresupuesto({ ok: respuesta.ok, texto: cuerpo.mensaje ?? cuerpo.error ?? 'Sin respuesta del servidor.' })

      if (respuesta.ok) {
        await cargarPresupuestos()

        setPresupuestoSeleccionado((anterior) => {
          if (!anterior || anterior.presupuesto.id !== presupuestoId) return anterior
          const cliente = clientesCartera.find((c) => c.id === anterior.cliente.id)
          const presupuesto = (presupuestosPorCliente[anterior.cliente.id] ?? []).find((p) => p.id === presupuestoId)
          return cliente && presupuesto ? { cliente, presupuesto } : anterior
        })
      }

    } catch {

      setAvisoPresupuesto({ ok: false, texto: 'No se pudo ejecutar la acción.' })

    } finally {

      setAccionandoPresupuesto(false)

    }

  }

  useEffect(() => { setPaginaPresupuestos(1) }, [pendientesRevision.length])

  const solicitudesReales = clientesCartera.flatMap(cliente => (presupuestosPorCliente[cliente.id] ?? []).map(presupuesto => ({cliente,presupuesto})))

  const solicitudes = solicitudesReales
  const solicitudesFiltradas = solicitudes.filter(({cliente,presupuesto}) => {
    if (filtroPresupuestos === 'pendientes' && presupuesto.estado !== 'EN_REVISION') return false
    if (filtroPresupuestos === 'borradores' && presupuesto.estado !== 'BORRADOR') return false
    if (filtroPresupuestos === 'aprobados' && presupuesto.estado !== 'APROBADO') return false
    if (filtroPresupuestos === 'observados' && presupuesto.estado !== 'OBSERVADO') return false
    if (divisionSolicitudes !== null && Number(cliente.area_id) !== divisionSolicitudes) return false
    const q = busquedaSolicitudes.trim().toLocaleLowerCase('es')
    if (q && !(cliente.nombre + ' ' + presupuesto.id).toLocaleLowerCase('es').includes(q)) return false
    return true
  })
  const paginasSolicitudes = Math.max(1, Math.ceil(solicitudesFiltradas.length / POR_PAGINA_SOLICITUDES))
  const paginaSolicitudActual = Math.min(paginaSolicitudes, paginasSolicitudes)
  const solicitudesPagina = solicitudesFiltradas.slice((paginaSolicitudActual - 1)*POR_PAGINA_SOLICITUDES, paginaSolicitudActual*POR_PAGINA_SOLICITUDES)

  if (!usuario) return null

  return (

    <div className="space-y-4">

      <div className="flex gap-1 rounded-xl border border-border bg-card/60 p-1">

        {([

          { key: 'general', texto: 'Vista general', icono: <BarChart3 size={14} /> },

          { key: 'areas', texto: 'Cartera por división', icono: <FolderKanban size={14} /> },

          { key: 'presupuestos', texto: 'Presupuestos', icono: <ClipboardList size={14} /> },

        ] as Array<{ key: TabKey; texto: string; icono: React.ReactNode }>).map((boton) => (

          <button

            key={boton.key}

            type="button"

            role="tab"

            aria-selected={tab === boton.key}

            onClick={() => setTab(boton.key)}

            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === boton.key ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}

          >

            {boton.icono}{boton.texto}

          </button>

        ))}

      </div>

      {clienteGestion ? (
        <ClienteGestion
          cliente={clienteGestion}
          onVolver={() => setClienteGestion(null)}
          onImportarPresupuesto={(c) => {
            setClienteGestion(null)
            setClientePresupuesto({ id: c.id, nombre: c.nombre })
          }}
          onEditar={() => setClienteGestion(null)}
        />
      ) : (<>
      {tab === 'general' && (

        <div className="space-y-3">

          {cargandoCartera || !cartera ? (

            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Cargando cartera...</div>

          ) : (

            <>

              <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" aria-label="Indicadores de cartera">

                {[

                  { titulo: 'Clientes en cartera', valor: String(cartera.totales.clientes), detalle: `${cartera.clientes.length} registros en cartera`, icono: Users, color: 'text-violet-400 bg-violet-500/10' },

                  { titulo: 'Horas contratadas', valor: formato(cartera.totales.contratadas), detalle: 'Bolsas vigentes', icono: FileCheck2, color: 'text-blue-400 bg-blue-500/10' },

                  { titulo: 'Horas consumidas', valor: formato(cartera.totales.consumidas), detalle: cartera.totales.contratadas > 0 ? `${Math.round(cartera.totales.consumidas / cartera.totales.contratadas * 100)}% del total contratado` : 'Sin horas contratadas', icono: Clock3, color: 'text-sky-400 bg-sky-500/10' },

                  { titulo: 'Horas disponibles', valor: formato(cartera.totales.disponibles), detalle: 'Saldo disponible', icono: Wallet, color: 'text-emerald-400 bg-emerald-500/10' },

                  { titulo: 'Por revisar', valor: cargandoPresupuestos ? '…' : String(pendientesRevisionGeneral.length), detalle: 'Presupuestos en revisión', icono: ClipboardList, color: 'text-amber-400 bg-amber-500/10' },

                ].map((kpi) => {

                  const Icono = kpi.icono

                  return <div key={kpi.titulo} className="min-w-0 rounded-xl border border-border/70 bg-card/80 px-3 py-3">

                    <div className="mb-2 flex items-center gap-2"><span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${kpi.color}`}><Icono size={15}/></span><span className="text-[11px] font-medium text-muted-foreground">{kpi.titulo}</span></div>

                    <div className="truncate text-xl font-semibold tracking-tight tabular-nums" title={kpi.valor}>{kpi.valor}</div>

                    <div className="mt-1 truncate text-[10px] text-muted-foreground" title={kpi.detalle}>{kpi.detalle}</div>

                  </div>

                })}

              </section>

              <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(310px,1fr)]">

                <div className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card/80">

                  <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">

                    <h3 className="flex items-center gap-2 text-sm font-semibold"><ClipboardList size={16} className="text-violet-400"/> Presupuestos por revisar <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">{pendientesRevisionGeneral.length}</span></h3>

                    <button type="button" className="text-xs text-violet-300 hover:text-violet-200" onClick={() => { setFiltroPresupuestos('pendientes'); setTab('presupuestos') }}>Ver todos →</button>

                  </div>

                  <div className="overflow-x-auto">

                    <table className="w-full min-w-[540px] text-xs">

                      <thead className="bg-muted/20 text-[10px] text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">División</th><th className="px-3 py-2 text-left font-medium">Cliente</th><th className="px-3 py-2 text-left font-medium">Estado</th><th className="px-3 py-2 text-right font-medium">Acción</th></tr></thead>

                      <tbody>

                        {pendientesRevisionPagina.map(({ cliente, presupuesto }) => <tr key={`${cliente.id}-${presupuesto.id}`} className="border-t border-border/40 hover:bg-muted/20">

                          <td className="max-w-[150px] truncate px-3 py-2.5 text-muted-foreground" title={cliente.area_nombre}>{cliente.area_nombre}</td>

                          <td className="max-w-[180px] truncate px-3 py-2.5 font-semibold" title={cliente.nombre}>{cliente.nombre}</td>

                          <td className="px-3 py-2.5"><span className="rounded-md bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">{formatearEstado(presupuesto.estado)}</span></td>

                          <td className="px-3 py-2 text-right"><button type="button" className="rounded-md border border-violet-500/40 px-2.5 py-1.5 font-medium text-violet-300 hover:bg-violet-500/10" onClick={() => { setClientePresupuesto({ id: cliente.id, nombre: cliente.nombre }); setTab('presupuestos') }}>Revisar</button></td>

                        </tr>)}

                        {!cargandoPresupuestos && pendientesRevisionGeneral.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground"><CheckCircle2 size={19} className="mx-auto mb-1.5 text-emerald-400"/>No hay presupuestos en revisión.</td></tr>}

                        {cargandoPresupuestos && <tr><td colSpan={4} className="px-4 py-5 text-center text-muted-foreground">Consultando presupuestos...</td></tr>}

                      </tbody>

                    </table>

                  </div>

                  <div className="flex items-center justify-between border-t border-border/40 px-4 py-2 text-xs">

                    <button type="button" onClick={() => setPaginaPresupuestos((p) => Math.max(1, p - 1))} disabled={paginaActualPresupuestos === 1} className="rounded-md border border-border px-2 py-1 disabled:opacity-40">Anterior</button>

                    <span>{paginaActualPresupuestos} de {totalPaginasPresupuestos}</span>

                    <button type="button" onClick={() => setPaginaPresupuestos((p) => Math.min(totalPaginasPresupuestos, p + 1))} disabled={paginaActualPresupuestos === totalPaginasPresupuestos} className="rounded-md border border-border px-2 py-1 disabled:opacity-40">Siguiente</button>

                  </div>

                </div>

                <div className="min-w-0 space-y-3">

                <section className="overflow-hidden rounded-xl border border-border/70 bg-card/80">

                  <div className="flex items-center justify-between border-b border-border/60 px-4 py-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} className="text-amber-400"/> Alertas y desviaciones</h3><span className="text-[10px] text-muted-foreground">{cartera.alertas?.length ?? 0} alertas</span></div>

                  <div className="divide-y divide-border/40">

                    {(cartera.alertas ?? []).slice(0,4).map((alerta) => <div key={alerta.id} className="flex items-center gap-2.5 px-4 py-2.5 text-xs">

                      <span className={`size-1.5 shrink-0 rounded-full ${alerta.tipo === 'desviacion' ? 'bg-rose-400' : 'bg-amber-400'}`}/>

                      <div className="min-w-0 flex-1"><p className="truncate font-medium" title={alerta.titulo}>{alerta.titulo}</p><p className="truncate text-[10px] text-muted-foreground" title={alerta.clienteNombre}>{alerta.clienteNombre}</p></div><strong className="shrink-0 text-rose-300 tabular-nums">{alerta.dato}</strong>

                    </div>)}

                    {!cartera.alertas?.length && <p className="px-4 py-5 text-center text-xs text-muted-foreground">Sin alertas pendientes.</p>}

                  </div>

                </section>

                <section className="overflow-hidden rounded-xl border border-border/70 bg-card/80">

                  <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">

                    <h3 className="flex items-center gap-2 text-sm font-semibold"><Target size={16} className="text-violet-400"/> Foco de cartera</h3>

                    <button type="button" className="text-[11px] text-violet-300 hover:text-violet-200" onClick={() => setTab('areas')}>Ver por división <ChevronRight size={12} className="inline"/></button>

                  </div>

                  <div className="space-y-3 px-3 py-3">

                    <div>

                      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-label="Distribución de cartera por estado">

                        <div className="bg-emerald-500" style={{ width: `${focoCartera.total ? focoCartera.resto / focoCartera.total * 100 : 0}%` }}/>

                        <div className="bg-amber-400" style={{ width: `${focoCartera.total ? focoCartera.enRiesgo / focoCartera.total * 100 : 0}%` }}/>

                        <div className="bg-rose-500" style={{ width: `${focoCartera.total ? focoCartera.sinBolsa / focoCartera.total * 100 : 0}%` }}/>

                      </div>

                      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">

                        {[

                          { nombre: 'Otros', valor: focoCartera.resto, color: 'bg-emerald-500' },

                          { nombre: 'En riesgo', valor: focoCartera.enRiesgo, color: 'bg-amber-400' },

                          { nombre: 'Sin bolsa', valor: focoCartera.sinBolsa, color: 'bg-rose-500' },

                        ].map((dato) => <div key={dato.nombre} className="min-w-0"><div className="flex items-center gap-1 text-muted-foreground"><span className={`size-1.5 rounded-full ${dato.color}`}/>{dato.nombre}</div><strong className="font-semibold tabular-nums">{dato.valor} <span className="font-normal text-muted-foreground">({focoCartera.total ? Math.round(dato.valor / focoCartera.total * 100) : 0}%)</span></strong></div>)}

                      </div>

                    </div>

                    <div className="grid grid-cols-3 gap-1.5">

                      {[

                        { titulo: 'Divisiones con alertas', valor: focoCartera.areasConAlertas, tono: 'text-violet-300' },

                        { titulo: 'Clientes excedidos', valor: focoCartera.excedidos, tono: 'text-rose-300' },

                        { titulo: 'Consumo ≥ 90%', valor: focoCartera.cercaDelLimite, tono: 'text-sky-300' },

                      ].map((dato) => <div key={dato.titulo} className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-2 py-2"><div className="truncate text-[9px] text-muted-foreground" title={dato.titulo}>{dato.titulo}</div><div className={`mt-1 text-base font-semibold tabular-nums ${dato.tono}`}>{dato.valor}</div></div>)}

                    </div>

                    <div>

                      <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Divisiones con más alertas</p>

                      {focoCartera.areasPrioritarias.length ? <div className="grid grid-cols-3 gap-1.5">

                        {focoCartera.areasPrioritarias.map((area, i) => <button type="button" key={`${area.id ?? area.nombre}`} onClick={() => { setAreaId(area.id); setTab('areas') }} className="min-w-0 rounded-lg border border-border/60 bg-muted/15 px-2 py-1.5 text-left hover:bg-violet-500/10" title={`${area.nombre}: ${area.alertas} alertas`}>

                          <div className="truncate text-[10px] font-medium"><span className="mr-1 text-violet-400">{i+1}.</span>{area.nombre}</div>

                          <div className="text-[9px] text-muted-foreground">{area.alertas} {area.alertas === 1 ? 'alerta' : 'alertas'}</div>

                        </button>)}

                      </div> : <p className="text-[10px] text-muted-foreground">Sin alertas asociadas a áreas.</p>}

                    </div>

                  </div>

                </section>

                </div>

              </section>

            </>

          )}

        </div>

      )}

      {tab === 'areas' && (

        <div className="space-y-3">

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/80 px-3 py-2.5">

            <div className="flex min-w-0 flex-wrap items-center gap-3">

              <label htmlFor="division-cartera" className="text-xs font-semibold">División</label>

              <select id="division-cartera" value={areaId ?? ''} onChange={e => setAreaId(e.target.value ? Number(e.target.value) : null)} className="h-9 min-w-[225px] max-w-full rounded-lg border border-border bg-background px-3 text-xs">

                <option value="">Todas las divisiones</option>

                {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}

              </select>

              <span className="text-[11px] text-muted-foreground">Mostrando la cartera de {nombreDivision}.</span>

            </div>

            <button type="button" onClick={() => void cargarCartera()} disabled={cargandoCartera} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"><RefreshCw size={13} className={cargandoCartera ? 'animate-spin' : ''}/> Actualizar</button>

          </div>

          {(!cartera || cargandoCartera) && <div role="status" className="rounded-xl border border-border bg-card px-4 py-5 text-xs text-muted-foreground">{cargandoCartera ? 'Actualizando datos de cartera…' : 'Cargando cartera…'}</div>}

          {cartera && <>

            <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5" aria-label="Indicadores por división">

              {[

                { label: 'Clientes en cartera', valor: String(resumenDivision.clientes), detalle: 'Clientes de la selección', icon: Users, cls: 'text-violet-400 bg-violet-500/10' },

                { label: 'Horas contratadas', valor: formato(resumenDivision.contratadas), detalle: 'Bolsas registradas', icon: FileCheck2, cls: 'text-emerald-400 bg-emerald-500/10' },

                { label: 'Horas consumidas', valor: formato(resumenDivision.consumidas), detalle: resumenDivision.contratadas > 0 ? `${Math.round(resumenDivision.consumidas / resumenDivision.contratadas * 100)}% respecto a contratadas` : 'Sin base contractual', icon: Clock3, cls: 'text-sky-400 bg-sky-500/10' },

                { label: 'Horas disponibles', valor: formato(resumenDivision.disponibles), detalle: 'Saldo de bolsas', icon: Wallet, cls: 'text-green-400 bg-green-500/10' },

                { label: 'Clientes en riesgo', valor: String(resumenDivision.categorias.riesgo), detalle: 'Excesos y riesgo reportado', icon: AlertTriangle, cls: 'text-rose-400 bg-rose-500/10' },

              ].map(item => { const Icon = item.icon; return <div key={item.label} className="min-w-0 rounded-xl border border-border/70 bg-card/80 px-3 py-3">

                <div className="mb-2 flex items-center gap-2"><span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${item.cls}`}><Icon size={15}/></span><span className="text-[11px] text-muted-foreground">{item.label}</span></div>

                <div className="truncate text-lg font-semibold tabular-nums" title={item.valor}>{item.valor}</div><p className="mt-1 truncate text-[10px] text-muted-foreground">{item.detalle}</p>

              </div> })}

            </section>

            <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(250px,0.85fr)]">

              <div className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card/80">

                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-3">

                  <div className="flex items-center gap-2"><BriefcaseBusiness size={16} className="text-violet-400"/><h3 className="text-sm font-semibold">Clientes de {areaId == null ? 'todas las divisiones' : nombreDivision}</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{clientesDivisionFiltrados.length}</span></div>

                  <div className="flex flex-wrap gap-2">

                    <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground"/><input aria-label="Buscar clientes o servicios" placeholder="Buscar cliente..." value={busquedaDivision} onChange={e => setBusquedaDivision(e.target.value)} className="h-9 w-[170px] rounded-lg border border-border bg-background pl-8 pr-2 text-xs"/></div>

                    <select aria-label="Filtrar estado de cartera" value={estadoDivision} onChange={e => setEstadoDivision(e.target.value)} className="h-9 max-w-[155px] rounded-lg border border-border bg-background px-2 text-xs"><option value="todos">Todos los estados</option><option value="curso">En curso</option><option value="limite">Próxima a agotarse</option><option value="riesgo">En riesgo</option><option value="sin_presupuesto">Sin presupuesto</option></select>

                  </div>

                </div>

                <div className="overflow-x-auto">

                  <table className="w-full min-w-[620px] text-[11px]"><thead className="bg-muted/20 text-[10px] text-muted-foreground"><tr>

                    <th className="px-3 py-2 text-left font-medium">Cliente</th><th className="px-2 py-2 text-left font-medium">Servicios</th><th className="px-2 py-2 text-right font-medium">Contratadas</th><th className="px-2 py-2 text-right font-medium">Consumidas</th><th className="px-2 py-2 text-right font-medium">Disponibles</th><th className="px-2 py-2 text-right font-medium">Desviación</th><th className="px-2 py-2 text-center font-medium">Estado</th><th className="px-2 py-2 text-center font-medium">Detalle</th>

                  </tr></thead><tbody>

                    {paginaClientesDivision.map(cliente => { const contratado = Number(cliente.horasContratadas)||0; const consumido=Number(cliente.horasConsumidas)||0; const exceso = Number(cliente.horasExcedidas)||0; const pct=contratado>0 ? consumido/contratado*100:0; const cat=resumenDivision.clasificar(cliente); const tonos: Record<string,string> = { curso: 'bg-emerald-500/10 text-emerald-400', limite:'bg-amber-500/10 text-amber-300', riesgo:'bg-rose-500/10 text-rose-300', sin_presupuesto:'bg-muted text-muted-foreground' }; const nombres:Record<string,string>={curso:'En curso',limite:'Por agotarse',riesgo:'En riesgo',sin_presupuesto:'Sin presupuesto'};

                    return <tr key={`${cliente.area_id}-${cliente.id}`} className="border-t border-border/40 hover:bg-muted/10">

                      <td className="max-w-[170px] px-3 py-3"><div className="flex items-center gap-2"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-200">{cliente.nombre.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}</span><div className="min-w-0"><p className="truncate font-semibold" title={cliente.nombre}>{cliente.nombre}</p>{areaId==null && <p className="truncate text-[10px] text-muted-foreground">{cliente.area_nombre}</p>}</div></div></td>

                      <td className="max-w-[160px] px-2 py-3"><div className="flex max-w-[160px] flex-wrap gap-1">{(cliente.servicios??[]).slice(0,2).map((servicio,i)=><span key={`${i}-${servicio}`} title={servicio} className="max-w-[90px] truncate rounded-md bg-muted/70 px-1.5 py-1 text-[9px]">{servicio}</span>)}{(cliente.servicios?.length??0)>2&&<span className="rounded-md bg-muted/70 px-1.5 py-1 text-[9px]">+{cliente.servicios!.length-2}</span>}</div></td>

                      <td className="px-2 py-3 text-right tabular-nums">{formato(contratado)}</td>

                      <td className="px-2 py-3 text-right"><div className="tabular-nums">{formato(consumido)}</div><div className="mt-1 ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${cat==='riesgo'?'bg-rose-500':cat==='limite'?'bg-amber-400':'bg-violet-500'}`} style={{width:`${Math.min(100,Math.max(0,pct))}%`}}/></div></td>

                      <td className="px-2 py-3 text-right tabular-nums">{formato(cliente.horasDisponibles)}</td>

                      <td className={`px-2 py-3 text-right tabular-nums ${exceso>0?'font-semibold text-rose-400':'text-muted-foreground'}`}>{exceso>0?`+${formato(exceso)}`:'—'}</td>

                      <td className="px-2 py-3 text-center"><span className={`inline-block whitespace-nowrap rounded-md px-2 py-1 text-[9px] ${tonos[cat]}`}>{nombres[cat]}</span></td>

                      <td className="px-2 py-3 text-center"><button type="button" title="Consultar presupuestos del cliente" aria-label={`Consultar presupuestos de ${cliente.nombre}`} onClick={()=>revisarPresupuestosClienteDivision(cliente)} className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"><Eye size={14}/></button></td>

                    </tr>})}

                    {paginaClientesDivision.length===0&&<tr><td colSpan={8} className="px-3 py-8 text-center text-xs text-muted-foreground">No hay clientes para la división y filtros seleccionados.</td></tr>}

                  </tbody></table>

                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-3 py-2 text-[10px] text-muted-foreground"><span>Mostrando {clientesDivisionFiltrados.length===0?0:(paginaDivisionActual-1)*filasDivision+1}–{Math.min(paginaDivisionActual*filasDivision,clientesDivisionFiltrados.length)} de {clientesDivisionFiltrados.length}</span><div className="flex items-center gap-2"><label>Filas <select aria-label="Filas por página" value={filasDivision} onChange={e=>setFilasDivision(Number(e.target.value))} className="rounded border border-border bg-background p-1"><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></select></label><button type="button" aria-label="Página anterior" disabled={paginaDivisionActual<=1} onClick={()=>setPaginaDivision(p=>p-1)} className="rounded border border-border p-1 disabled:opacity-30"><ChevronLeft size={13}/></button><span>{paginaDivisionActual}/{paginasDivision}</span><button type="button" aria-label="Página siguiente" disabled={paginaDivisionActual>=paginasDivision} onClick={()=>setPaginaDivision(p=>p+1)} className="rounded border border-border p-1 disabled:opacity-30"><ChevronRight size={13}/></button></div></div>

              </div>

              <div className="min-w-0 space-y-3">

                <div className="rounded-xl border border-border/70 bg-card/80"><div className="border-b border-border/60 px-3 py-3"><h3 className="text-sm font-semibold">Estado de la cartera</h3><p className="text-[10px] text-muted-foreground">{nombreDivision}</p></div><div className="space-y-3 px-3 py-3">{[

                  {key:'curso',label:'En curso',color:'bg-emerald-500'}, {key:'limite',label:'Bolsa próxima a agotarse',color:'bg-amber-400'}, {key:'riesgo',label:'En riesgo (exceso)',color:'bg-rose-500'}, {key:'sin_presupuesto',label:'Sin presupuesto',color:'bg-slate-400'},

                ].map(item=>{ const cantidad=resumenDivision.categorias[item.key as keyof typeof resumenDivision.categorias];const pct=resumenDivision.clientes ? cantidad/resumenDivision.clientes*100:0;return <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto_84px] items-center gap-2 text-[10px]"><span className="flex min-w-0 items-center gap-1.5"><span className={`size-1.5 shrink-0 rounded-full ${item.color}`}/><span className="truncate" title={item.label}>{item.label}</span></span><span className="tabular-nums text-muted-foreground">{cantidad} · {Math.round(pct)}%</span><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${item.color}`} style={{width:`${pct}%`}}/></div></div>})}</div></div>

                <div className="rounded-xl border border-border/70 bg-card/80"><div className="flex items-center justify-between border-b border-border/60 px-3 py-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={15} className="text-amber-400"/>Alertas y desviaciones</h3><button type="button" onClick={()=>setMostrarTodasAlertasDivision(v=>!v)} className="text-[10px] text-violet-300">{mostrarTodasAlertasDivision?'Ver menos':`Ver todas (${alertasDivision.length})`}</button></div><div className="divide-y divide-border/40">{(mostrarTodasAlertasDivision?alertasDivision:alertasDivision.slice(0,5)).map(a=><div key={a.id} className="flex items-start gap-2 px-3 py-2 text-[11px]"><span className={`mt-1 size-1.5 shrink-0 rounded-full ${a.tipo==='desviacion'?'bg-rose-400':'bg-amber-400'}`}/><div className="min-w-0 flex-1"><div className="truncate font-medium" title={a.titulo}>{a.titulo}</div><div className="truncate text-[10px] text-muted-foreground">{a.clienteNombre}</div></div><span className="shrink-0 font-semibold text-rose-300">{a.dato}</span></div>)}{alertasDivision.length===0&&<p className="px-3 py-5 text-center text-[11px] text-muted-foreground">No hay alertas para esta división.</p>}</div></div>

              </div>

            </section>

            <p className="text-[10px] text-muted-foreground">Los indicadores usan la cartera devuelta por la API. Si un cliente tiene servicios de varias divisiones, los totales precisos por división requieren que el backend desglose las bolsas por división.</p>

          </>}

        </div>

      )}

      {tab === 'presupuestos' && (
        <div className="space-y-3">
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Indicadores de presupuestos">
            {[
              { titulo: 'Por aprobar', valor: String(solicitudes.filter(x => x.presupuesto.estado === 'EN_REVISION').length), subtitulo: 'Enviados a revisión', icono: ClipboardList, color: 'text-amber-300 bg-amber-500/10' },
              { titulo: 'Aprobados', valor: String(solicitudes.filter(x => x.presupuesto.estado === 'APROBADO').length), subtitulo: 'Presupuestos autorizados', icono: CheckCircle2, color: 'text-emerald-300 bg-emerald-500/10' },
              { titulo: 'Observados', valor: String(solicitudes.filter(x => x.presupuesto.estado === 'OBSERVADO').length), subtitulo: 'Requieren seguimiento', icono: AlertTriangle, color: 'text-rose-300 bg-rose-500/10' },
              { titulo: 'Presupuestos', valor: String(solicitudes.length), subtitulo: 'Registros disponibles', icono: Layers3, color: 'text-violet-300 bg-violet-500/10' },
            ].map(item => { const Icono = item.icono; return <div key={item.titulo} className="rounded-xl border border-border/70 bg-card/80 px-3 py-3">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className={`rounded-lg p-2 ${item.color}`}><Icono size={15}/></span>{item.titulo}</div>
              <div className="mt-2 text-xl font-semibold tabular-nums">{cargandoPresupuestos ? '…' : item.valor}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{item.subtitulo}</div>
            </div> })}
          </section>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/70 p-2">
            {[
              { key: 'todos', texto: 'Todos' }, { key: 'pendientes', texto: 'Por aprobar' },
              { key: 'borradores', texto: 'Borradores' }, { key: 'aprobados', texto: 'Aprobados' }, { key: 'observados', texto: 'Observados' },
            ].map(op => <button type="button" key={op.key} onClick={() => { setFiltroPresupuestos(op.key); setPaginaSolicitudes(1) }} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filtroPresupuestos === op.key ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}>{op.texto}</button>)}
            <div className="relative ml-auto"><Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground"/><input value={busquedaSolicitudes} onChange={e => {setBusquedaSolicitudes(e.target.value);setPaginaSolicitudes(1)}} placeholder="Buscar cliente o presupuesto" aria-label="Buscar presupuestos" className="h-9 w-[210px] max-w-full rounded-lg border border-border bg-background pl-8 pr-2 text-xs" /></div>
            <select aria-label="Filtrar división" value={divisionSolicitudes ?? ''} onChange={e => {setDivisionSolicitudes(e.target.value ? Number(e.target.value) : null);setPaginaSolicitudes(1)}} className="h-9 max-w-[200px] rounded-lg border border-border bg-background px-2 text-xs"><option value="">Todas las divisiones</option>{areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>
            <button type="button" onClick={() => void cargarPresupuestos()} disabled={cargandoPresupuestos} className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"><RefreshCw size={14} className={cargandoPresupuestos ? 'animate-spin' : ''}/></button>
          </div>
          <div className={`grid items-start gap-3 ${presupuestoSeleccionado ? 'xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.9fr)]' : ''}`}>
            <section className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card/80">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3"><div><h3 className="text-sm font-semibold">Solicitudes presupuestarias</h3><p className="text-[10px] text-muted-foreground">Una fila por presupuesto; cada uno puede incluir varios servicios.</p></div><span className="text-xs text-muted-foreground">{solicitudesFiltradas.length} presupuestos</span></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-[11px]">
                <thead className="bg-muted/20 text-[10px] text-muted-foreground"><tr><th className="px-3 py-2 text-left">Cliente / División</th><th className="px-3 py-2 text-left">Servicios incluidos</th><th className="px-3 py-2 text-right">Total horas</th><th className="px-3 py-2 text-left">Responsable</th><th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Estado</th><th className="px-3 py-2 text-right">Acción</th></tr></thead>
                <tbody>
                  {solicitudesPagina.map(({cliente,presupuesto}) => {const servicios = serviciosDe(presupuesto);const h=horasPresupuesto(presupuesto);const activo=presupuestoSeleccionado?.presupuesto.id===presupuesto.id&&presupuestoSeleccionado?.cliente.id===cliente.id;return <tr key={`${cliente.id}-${presupuesto.id}`} className={`border-t border-border/40 hover:bg-muted/20 ${activo ? 'bg-violet-500/10' : ''}`}>
                    <td className="max-w-[165px] px-3 py-3"><p className="truncate font-semibold" title={cliente.nombre}>{cliente.nombre}</p><p className="text-[10px] text-muted-foreground">{cliente.area_nombre}</p></td>
                    <td className="max-w-[230px] px-3 py-3"><div className="flex flex-wrap gap-1">{servicios.length ? <>{servicios.slice(0,2).map((serv,i)=><span key={i} className="max-w-[115px] truncate rounded-md bg-muted/60 px-1.5 py-1 text-[10px]" title={etiqueta(serv,['nombre','servicio_nombre','descripcion','titulo'])}>{etiqueta(serv,['nombre','servicio_nombre','descripcion','titulo'])}</span>)}{servicios.length>2&&<span className="rounded-md bg-muted/60 px-1.5 py-1">+{servicios.length-2} más</span>}</> : <span className="text-muted-foreground">Consultar detalle</span>}</div></td>
                    <td className="px-3 py-3 text-right tabular-nums">{h === null ? '—' : formato(h)}</td>
                    <td className="max-w-[130px] px-3 py-3 truncate text-[10px] text-muted-foreground" title={presupuesto.creadoPor ?? undefined}>{presupuesto.creadoPor ?? '—'}</td>
                    <td className="px-3 py-3 text-[10px] text-muted-foreground">{presupuesto.creadoEn ? new Date(presupuesto.creadoEn).toLocaleDateString('es-PE') : '—'}</td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-[10px] ${presupuesto.estado==='APROBADO'?'bg-emerald-500/10 text-emerald-300':presupuesto.estado==='OBSERVADO'?'bg-rose-500/10 text-rose-300': 'bg-amber-500/10 text-amber-300'}`}>{formatearEstado(presupuesto.estado)}</span></td>
                    <td className="px-3 py-3 text-right"><button type="button" disabled={cliente.id >= 900000} onClick={()=>setPresupuestoSeleccionado({cliente,presupuesto})} className="rounded-md border border-violet-500/40 px-2 py-1.5 text-violet-300 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-40">{presupuesto.estado==='APROBADO'?'Ver detalle':'Revisar'}</button></td>
                  </tr>})}
                  {!cargandoPresupuestos && solicitudesFiltradas.length===0&&<tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">No hay presupuestos para estos filtros.</td></tr>}
                  {cargandoPresupuestos && <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">Cargando presupuestos…</td></tr>}
                </tbody>
              </table></div>
              <div className="flex items-center justify-between border-t border-border/40 px-3 py-2 text-[11px] text-muted-foreground"><span>Página {paginaSolicitudActual} de {paginasSolicitudes}</span><div className="flex gap-2"><button type="button" disabled={paginaSolicitudActual<=1} onClick={()=>setPaginaSolicitudes(p=>Math.max(1,p-1))} className="rounded border border-border px-2 py-1 disabled:opacity-30">Anterior</button><button type="button" disabled={paginaSolicitudActual>=paginasSolicitudes} onClick={()=>setPaginaSolicitudes(p=>Math.min(paginasSolicitudes,p+1))} className="rounded border border-border px-2 py-1 disabled:opacity-30">Siguiente</button></div></div>
            </section>
            {presupuestoSeleccionado && <aside className="min-w-0 overflow-hidden rounded-xl border border-violet-500/40 bg-card/90" aria-label="Detalle del presupuesto seleccionado">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3"><div><h3 className="text-sm font-semibold">Detalle del presupuesto</h3><p className="text-[10px] text-muted-foreground">Servicios, responsables y bolsas por integrante</p></div><button type="button" aria-label="Cerrar detalle" onClick={()=>setPresupuestoSeleccionado(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X size={16}/></button></div>
              <div className="max-h-[65vh] space-y-3 overflow-y-auto px-4 py-3">
                <div className="rounded-lg border border-border/60 bg-muted/15 p-3 text-xs"><div className="grid grid-cols-[100px_1fr] gap-y-2"><span className="text-muted-foreground">Código</span><strong>#{presupuestoSeleccionado.presupuesto.id}</strong><span className="text-muted-foreground">Cliente</span><strong>{presupuestoSeleccionado.cliente.nombre}</strong><span className="text-muted-foreground">División</span><strong>{presupuestoSeleccionado.cliente.area_nombre}</strong><span className="text-muted-foreground">Enviado por</span><strong>{presupuestoSeleccionado.presupuesto.creadoPor ?? '—'}</strong><span className="text-muted-foreground">Estado</span><strong>{formatearEstado(presupuestoSeleccionado.presupuesto.estado)}</strong></div></div>
                <div className="flex items-center justify-between"><h4 className="text-xs font-semibold">Servicios incluidos ({serviciosDe(presupuestoSeleccionado.presupuesto).length})</h4><span className="text-xs font-semibold text-violet-300">{formato(horasPresupuesto(presupuestoSeleccionado.presupuesto))}</span></div>
                {serviciosDe(presupuestoSeleccionado.presupuesto).length ? serviciosDe(presupuestoSeleccionado.presupuesto).map((servicio,i)=><div key={i} className="space-y-2 rounded-lg border border-border/60 p-3">
                  <div className="flex justify-between gap-2 text-xs"><strong className="min-w-0 flex-1">{etiqueta(servicio,['nombre','servicio_nombre','descripcion','titulo'],`Servicio ${i+1}`)}</strong><span className="shrink-0 font-semibold tabular-nums">{horas(servicio,['horas','horasAsignadas','horas_asignadas','horasPresupuestadas','horas_presupuestadas'])===null?'—':formato(horas(servicio,['horas','horasAsignadas','horas_asignadas','horasPresupuestadas','horas_presupuestadas'])??0)}</span></div>
                  <div className="text-[10px] font-semibold text-muted-foreground">Responsables y bolsas individuales</div>
                  {responsablesDe(servicio).length ? <div className="divide-y divide-border/40 rounded-md bg-muted/20">{responsablesDe(servicio).map((resp,j)=><div key={j} className="flex items-center justify-between gap-2 px-2 py-2 text-[11px]"><span className="flex min-w-0 items-center gap-1.5"><UserRound size={12} className="shrink-0 text-violet-300"/><span className="truncate">{etiqueta(resp,['nombre','usuarioNombre','nombreTexto','usuario_nombre','colaborador_nombre','responsable_nombre','nombre_completo'])}</span></span><span className="shrink-0 tabular-nums">{horas(resp,['horas','horasAsignadas','horas_asignadas','bolsaHoras','horas_presupuestadas'])===null?'Sin dato':formato(horas(resp,['horas','horasAsignadas','horas_asignadas','bolsaHoras','horas_presupuestadas'])??0)}</span></div>)}</div> : <p className="text-[10px] text-muted-foreground">No se recibió el desglose por integrante para este servicio.</p>}
                </div>) : <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">La lista no incluye los servicios ni las asignaciones. Abre la gestión existente para ver el detalle disponible en el sistema.</div>}
                {avisoPresupuesto && <p role="status" className={`rounded-lg border px-3 py-2 text-xs ${avisoPresupuesto.ok ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/25 bg-rose-500/10 text-rose-300'}`}>{avisoPresupuesto.texto}</p>}
                {!esSocio && presupuestoSeleccionado.presupuesto.estado === 'EN_REVISION' && <button type="button" disabled={accionandoPresupuesto} onClick={()=>void ejecutarAccionPresupuesto(presupuestoSeleccionado.presupuesto.id,'APROBAR')} className="w-full rounded-lg bg-[#7c3aed] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:opacity-50">{accionandoPresupuesto?'Procesando...':'Aprobar presupuesto'}</button>}
                {!esSocio && presupuestoSeleccionado.presupuesto.estado === 'APROBADO' && <button type="button" disabled={accionandoPresupuesto} onClick={()=>void ejecutarAccionPresupuesto(presupuestoSeleccionado.presupuesto.id,'ACTIVAR_BOLSAS')} className="w-full rounded-lg border border-violet-500/40 px-3 py-2 text-xs font-medium text-violet-300 hover:bg-violet-500/10 disabled:opacity-50">{accionandoPresupuesto?'Procesando...':'Activar bolsas aprobadas'}</button>}
                <button type="button" onClick={()=>{setClientePresupuesto({id:presupuestoSeleccionado.cliente.id,nombre:presupuestoSeleccionado.cliente.nombre});setPresupuestoSeleccionado(null)}} className="w-full rounded-lg border border-violet-500/40 px-3 py-2 text-xs font-medium text-violet-300 hover:bg-violet-500/10">Abrir gestión de presupuestos del cliente</button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">Las acciones de aprobación y corrección se realizan en el componente de gestión existente, sujeto a sus permisos y validaciones del servidor.</p>
              </div>
            </aside>}
          </div>
          {clientePresupuesto && <div className="rounded-xl border border-border bg-card p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Presupuestos de {clientePresupuesto.nombre}</h3><button type="button" onClick={()=>setClientePresupuesto(null)} className="rounded-md border border-border px-3 py-1 text-xs">Cerrar</button></div><SettingsClientePresupuestos cliente={clientePresupuesto} onCerrar={()=>setClientePresupuesto(null)}/></div>}
        </div>
      )}
      </>)}
    </div>

  )

}
