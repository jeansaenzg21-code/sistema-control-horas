'use client'

import { useEffect, useMemo, useState } from 'react'

import { BarChart3, ClipboardList, FolderKanban, Loader2, Users, Clock3, Wallet, FileCheck2, Search, AlertTriangle, CheckCircle2, Target, ChevronRight, RefreshCw, Eye, ChevronLeft, BriefcaseBusiness, X, UserRound, Layers3 } from 'lucide-react'

import { useAuth } from '@/lib/auth-context'

import { useAreas } from '@/lib/areas-context'

import type { ClienteCartera } from './cartera-ui'
import type { ResumenPresupuesto } from '@/lib/presupuestos/consultar'

import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { useCartera } from '@/lib/use-cartera'

const ClienteGestion = dynamic(() => import('./cliente-gestion').then((modulo) => modulo.ClienteGestion), {
  loading: () => <p role="status" className="p-4 text-sm text-muted-foreground">Cargando gestión del cliente…</p>,
})
const SettingsClientePresupuestos = dynamic(() => import('./settings-cliente-presupuestos').then((modulo) => modulo.SettingsClientePresupuestos))

import { formatoHoras } from '@/lib/utils'
import { DetalleSolicitudPresupuesto } from './detalle-solicitud-presupuesto'
import { ResumenSolicitudesPresupuesto, estadosPresupuesto } from './resumen-solicitudes-presupuesto'
import { CarteraDivisionGraficos } from './cartera-division-graficos'
import { EvolucionCartera } from './evolucion-cartera'
import styles from './cartera-general.module.css'

type TabKey = 'general' | 'areas' | 'presupuestos'

type PresupuestoLista = ResumenPresupuesto

const VIGENCIA_SOLICITUD_APROBADA = 10 * 24 * 60 * 60 * 1000
const PRIORIDAD_SOLICITUD: Record<PresupuestoLista['estado'], number> = {
  EN_REVISION: 0,
  OBSERVADO: 1,
  BORRADOR: 2,
  APROBADO: 3,
}

function fechaSolicitud(presupuesto: PresupuestoLista): number {
  const fecha = presupuesto.estado === 'APROBADO' ? presupuesto.revisadoEn ?? presupuesto.creadoEn : presupuesto.creadoEn
  return Date.parse(fecha) || 0
}

export function ClientesAdmin({ onCabecera }: { onCabecera?: (titulo: string, subtitulo: string) => void }) {
  const { usuario, empresaActiva } = useAuth()
  const esSocio = usuario?.rol === 'socio'

  const { areas, cargarAreas } = useAreas()

  const [tab, setTab] = useState<TabKey>('general')


  const [busquedaDivision, setBusquedaDivision] = useState('')

  const [estadoDivision, setEstadoDivision] = useState('todos')

  const [paginaDivision, setPaginaDivision] = useState(1)

  const [filasDivision, setFilasDivision] = useState(10)


  const carteraQuery = useCartera()
  const cartera = carteraQuery.data
  const cargandoCartera = carteraQuery.isFetching
  const cargarCartera = carteraQuery.refetch
  const clientesCartera = useMemo(() => cartera?.clientes ?? [], [cartera])

  const [busquedaGeneral, setBusquedaGeneral] = useState('')

  const [filtroGeneral, setFiltroGeneral] = useState('todos')

  const [areaGeneral, setAreaGeneral] = useState<number | null>(null)

  const [paginaPresupuestos, setPaginaPresupuestos] = useState(1)

  const PRESUPUESTOS_POR_PAGINA = 9

  // Budgets tab state.

  const presupuestosQuery = useQuery({
    queryKey: ['presupuestos-cartera', empresaActiva?.id, usuario?.id],
    enabled: Boolean(cartera && usuario && empresaActiva),
    queryFn: async ({ signal }) => {
      const respuesta = await fetch('/api/presupuestos?cartera=1', { signal })
      if (!respuesta.ok) throw new Error('No se pudieron cargar los presupuestos.')
      return await respuesta.json() as Record<number, PresupuestoLista[]>
    },
  })
  const presupuestosPorCliente = useMemo(() => presupuestosQuery.data ?? {}, [presupuestosQuery.data])
  const cargandoPresupuestos = presupuestosQuery.isFetching
  const cargarPresupuestos = presupuestosQuery.refetch

  const [filtroPresupuestos, setFiltroPresupuestos] = useState('todos')

  const [clientePresupuesto, setClientePresupuesto] = useState<{ id: number; nombre: string } | null>(null)
  const [clienteGestion, setClienteGestion] = useState<ClienteCartera | null>(null)
  const [presupuestoSeleccionado, setPresupuestoSeleccionado] = useState<{ cliente: ClienteCartera; presupuesto: PresupuestoLista } | null>(null)
  const [busquedaSolicitudes, setBusquedaSolicitudes] = useState('')
  const [divisionSolicitudes, setDivisionSolicitudes] = useState<number | null>(null)
  const [paginaSolicitudes, setPaginaSolicitudes] = useState(1)
  const [ahoraSolicitudes, setAhoraSolicitudes] = useState(() => Date.now())
  const POR_PAGINA_SOLICITUDES = 8
  const [accionandoPresupuesto, setAccionandoPresupuesto] = useState(false)
  const [avisoPresupuesto, setAvisoPresupuesto] = useState<{ ok: boolean; texto: string } | null>(null)

  // Campos opcionales: su disponibilidad depende del contrato real de /api/presupuestos.
  // No se atribuyen bolsas u horas sin que el backend las proporcione.
  type Registro = Record<string, unknown>
  const texto = (valor: unknown): string => typeof valor === 'string' ? valor : ''
  const numero = (valor: unknown): number | null => typeof valor === 'number' && Number.isFinite(valor) ? valor : (typeof valor === 'string' && valor.trim() && Number.isFinite(Number(valor)) ? Number(valor) : null)
  const valorDe = (o: Registro | null, claves: string[]): unknown => claves.map(k => o?.[k]).find(v => v !== undefined && v !== null)
  const etiqueta = (o: Registro | null, claves: string[], fallback = 'Sin identificar') => texto(valorDe(o, claves)) || fallback
  const horas = (o: Registro | null, claves: string[]): number | null => numero(valorDe(o, claves))
  const serviciosDe = (p: PresupuestoLista): Registro[] => p.servicios.map((s) => ({ id: s.id, origen: s.origen, nombre: s.nombre, horas: s.horas, nota: s.nota, proyectoId: s.proyectoId, asignaciones: s.asignaciones }) as Registro)
  const horasPresupuesto = (p: PresupuestoLista): number => Number(p.totales.horasDetallado ?? 0)


  useEffect(() => { if (areas.length === 0) void cargarAreas() }, [areas.length, cargarAreas])

  useEffect(() => {

    if (!onCabecera) return

    onCabecera('Cartera de clientes', 'Vista general, por división y presupuestos de toda la empresa.')

  }, [onCabecera])

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

  const estadosCartera = [
    { estado: 'EN_CURSO', nombre: 'En curso', tono: 'verde' },
    { estado: 'EN_RIESGO', nombre: 'En riesgo', tono: 'rosa' },
    { estado: 'SIN_PRESUPUESTO', nombre: 'Sin presupuesto', tono: 'violeta' },
    { estado: 'PENDIENTE', nombre: 'Por revisar', tono: 'ambar' },
  ].map((dato) => {
    const clientes = cartera?.clientes ?? []
    const cantidad = clientes.filter((cliente) => cliente.estado === dato.estado).length
    return { ...dato, cantidad, porcentaje: clientes.length ? cantidad / clientes.length * 100 : 0 }
  })


  // Se usa la misma cartera cargada del servidor para todos los bloques de esta vista.

  // Si un cliente tiene bolsas repartidas entre varias divisiones, la API deberá devolver

  // registros ya desglosados por división para que las sumas sean contractualmente exactas.


  const clientesDivision = useMemo(() => [...(cartera?.clientes ?? [])].sort((a, b) => Number(b.horasContratadas) - Number(a.horasContratadas) || Number(b.horasConsumidas) - Number(a.horasConsumidas) || a.nombre.localeCompare(b.nombre, 'es')), [cartera])

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

  const clientesEnRiesgo = useMemo(() => clientesDivision
    .filter((cliente) => resumenDivision.clasificar(cliente) === 'riesgo')
    .sort((a, b) => b.horasExcedidas - a.horasExcedidas || b.horasConsumidas - a.horasConsumidas),
  [clientesDivision, resumenDivision])

  const clientesDivisionFiltrados = useMemo(() => clientesDivision.filter(c => {

    if (busquedaDivision.trim() && !(`${c.nombre} ${c.area_nombre} ${(c.servicios ?? []).join(' ')}`).toLocaleLowerCase('es').includes(busquedaDivision.trim().toLocaleLowerCase('es'))) return false

    if (estadoDivision !== 'todos' && resumenDivision.clasificar(c) !== estadoDivision) return false

    return true

  }), [clientesDivision, busquedaDivision, estadoDivision, resumenDivision])

  const paginasDivision = Math.max(1, Math.ceil(clientesDivisionFiltrados.length / filasDivision))

  const paginaDivisionActual = Math.min(paginaDivision, paginasDivision)

  const paginaClientesDivision = clientesDivisionFiltrados.slice((paginaDivisionActual - 1) * filasDivision, paginaDivisionActual * filasDivision)

  useEffect(() => { setPaginaDivision(1) }, [busquedaDivision, estadoDivision, filasDivision])

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
        const [{ data: presupuestosActualizados }] = await Promise.all([cargarPresupuestos(), cargarCartera()])

        setPresupuestoSeleccionado((anterior) => {
          if (!anterior || anterior.presupuesto.id !== presupuestoId) return anterior
          const cliente = clientesCartera.find((c) => c.id === anterior.cliente.id)
          const presupuesto = (presupuestosActualizados?.[anterior.cliente.id] ?? []).find((p) => p.id === presupuestoId)
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

  useEffect(() => {
    if (tab !== 'presupuestos') return
    const actualizar = () => setAhoraSolicitudes(Date.now())
    const intervalo = window.setInterval(actualizar, 30_000)
    window.addEventListener('focus', actualizar)
    return () => {
      window.clearInterval(intervalo)
      window.removeEventListener('focus', actualizar)
    }
  }, [tab])

  const solicitudes = useMemo(() => clientesCartera
    .flatMap((cliente) => (presupuestosPorCliente[cliente.id] ?? []).map((presupuesto) => ({ cliente, presupuesto })))
    .filter(({ presupuesto }) => presupuesto.estado !== 'APROBADO' ||
      ahoraSolicitudes - fechaSolicitud(presupuesto) < VIGENCIA_SOLICITUD_APROBADA)
    .sort((a, b) =>
      PRIORIDAD_SOLICITUD[a.presupuesto.estado] - PRIORIDAD_SOLICITUD[b.presupuesto.estado] ||
      fechaSolicitud(b.presupuesto) - fechaSolicitud(a.presupuesto) ||
      b.presupuesto.id - a.presupuesto.id
    ), [clientesCartera, presupuestosPorCliente, ahoraSolicitudes])
  const solicitudesDivision = solicitudes.filter(({ cliente }) => divisionSolicitudes === null || Number(cliente.area_id) === divisionSolicitudes)
  const solicitudesFiltradas = solicitudesDivision.filter(({cliente,presupuesto}) => {
    if (filtroPresupuestos === 'pendientes' && presupuesto.estado !== 'EN_REVISION') return false
    if (filtroPresupuestos === 'borradores' && presupuesto.estado !== 'BORRADOR') return false
    if (filtroPresupuestos === 'aprobados' && presupuesto.estado !== 'APROBADO') return false
    if (filtroPresupuestos === 'observados' && presupuesto.estado !== 'OBSERVADO') return false
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

      <div className={styles.tabs} role="tablist" aria-label="Vistas de cartera">

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

            onClick={() => {
              if (boton.key === 'presupuestos' && tab !== 'presupuestos') {
                setAhoraSolicitudes(Date.now())
                setPaginaSolicitudes(1)
              }
              setTab(boton.key)
            }}

            className={styles.tab}

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
        <div className={styles.general}>
          {carteraQuery.isError && !cartera ? (
            <p role="alert" className={styles.message}>{carteraQuery.error.message} <button className={styles.action} type="button" onClick={() => void cargarCartera()}>Reintentar</button></p>
          ) : !cartera ? (
            <p role="status" className={styles.message}>Cargando cartera…</p>
          ) : <>
            <section className={styles.metrics} aria-label="Indicadores de cartera">
              {[
                { titulo: 'Clientes en cartera', valor: String(cartera.totales.clientes), detalle: `${cartera.clientes.length} registros en cartera`, icono: Users, tono: 'violeta' },
                { titulo: 'Horas contratadas', valor: formato(cartera.totales.contratadas), detalle: 'Bolsas vigentes', icono: FileCheck2, tono: 'azul' },
                { titulo: 'Horas consumidas', valor: formato(cartera.totales.consumidas), detalle: cartera.totales.contratadas > 0 ? `${Math.round(cartera.totales.consumidas / cartera.totales.contratadas * 100)}% del total contratado` : 'Sin horas contratadas', icono: Clock3, tono: 'cian' },
                { titulo: 'Horas disponibles', valor: formato(cartera.totales.disponibles), detalle: 'Saldo disponible', icono: Wallet, tono: 'verde' },
                { titulo: 'Por revisar', valor: presupuestosQuery.data ? String(pendientesRevisionGeneral.length) : presupuestosQuery.isError ? '—' : '…', detalle: 'Presupuestos en revisión', icono: ClipboardList, tono: 'ambar' },
              ].map(({ titulo, valor, detalle, icono: Icono, tono }) => (
                <article key={titulo} className={styles.metric} data-cartera-tone={tono}>
                  <div><span className={styles.metricIcon}><Icono size={21} /></span><h3>{titulo}</h3></div>
                  <strong>{valor}</strong><p>{detalle}</p>
                </article>
              ))}
            </section>

            <div className={styles.panels}>
              <EvolucionCartera />
              <section className={styles.panel}>
                <div className={styles.heading}>
                  <h3><AlertTriangle className={styles.warning} size={21} />Alertas y desviaciones</h3>
                  <span className={styles.hint}>{cartera.alertas.length} alertas</span>
                </div>
                <ul className={styles.alerts}>
                  {cartera.alertas.slice(0, 4).map((alerta) => (
                    <li key={alerta.id} data-cartera-tone={alerta.tipo === 'desviacion' ? 'rosa' : alerta.tipo === 'pendiente' ? 'ambar' : 'violeta'}>
                      <i aria-hidden="true" />
                      <div><strong>{alerta.titulo}</strong><p>{alerta.clienteNombre}</p></div>
                      <span>{alerta.dato}</span>
                    </li>
                  ))}
                </ul>
                {!cartera.alertas.length && <p className={styles.message}>Sin alertas pendientes.</p>}
              </section>

              <section className={styles.panel}>
                <div className={styles.heading}>
                  <h3><ClipboardList size={21} />Presupuestos por revisar <span className={styles.count}>{presupuestosQuery.data ? pendientesRevisionGeneral.length : '…'}</span></h3>
                  <button type="button" className={styles.action} onClick={() => { setFiltroPresupuestos('pendientes'); setPaginaSolicitudes(1); setAhoraSolicitudes(Date.now()); setTab('presupuestos') }}>Ver todos →</button>
                </div>
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead><tr>{['División', 'Cliente', 'Estado', 'Acción'].map((columna) => <th scope="col" key={columna}>{columna}</th>)}</tr></thead>
                    <tbody>
                      {pendientesRevisionPagina.map(({ cliente, presupuesto }) => (
                        <tr key={presupuesto.id}>
                          <td>{cliente.area_nombre}</td>
                          <td>{cliente.nombre}</td>
                          <td>{formatearEstado(presupuesto.estado)}</td>
                          <td><button type="button" className={styles.action} onClick={() => { setClientePresupuesto({ id: cliente.id, nombre: cliente.nombre }); setTab('presupuestos') }}>Revisar</button></td>
                        </tr>
                      ))}
                      {presupuestosQuery.isError ? <tr><td colSpan={4}><p className={styles.message} role="alert">{presupuestosQuery.error.message} <button type="button" className={styles.action} onClick={() => void cargarPresupuestos()}>Reintentar</button></p></td></tr>
                        : cargandoPresupuestos && !pendientesRevisionPagina.length ? <tr><td colSpan={4}><p className={styles.message} role="status">Consultando presupuestos…</p></td></tr>
                          : !pendientesRevisionGeneral.length && <tr><td colSpan={4}><div className={styles.empty}><CheckCircle2 size={32} />No hay presupuestos en revisión.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className={styles.pagination}>
                  <button type="button" onClick={() => setPaginaPresupuestos(paginaActualPresupuestos - 1)} disabled={paginaActualPresupuestos === 1}>Anterior</button>
                  <span>{paginaActualPresupuestos} de {totalPaginasPresupuestos}</span>
                  <button type="button" onClick={() => setPaginaPresupuestos(paginaActualPresupuestos + 1)} disabled={paginaActualPresupuestos === totalPaginasPresupuestos}>Siguiente</button>
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.heading}>
                  <h3><Target size={21} />Foco de cartera</h3>
                  <button type="button" className={styles.action} onClick={() => setTab('areas')}>Ver por división →</button>
                </div>
                <div className={styles.focus}>
                  <div className={styles.segments} aria-hidden="true">
                    {estadosCartera.map((dato) => <span key={dato.estado} data-cartera-tone={dato.tono} style={{ width: `${dato.porcentaje}%` }} />)}
                  </div>
                  <ul>
                    {estadosCartera.filter((dato) => dato.estado !== 'PENDIENTE' || dato.cantidad > 0).map((dato) => (
                      <li key={dato.estado} data-cartera-tone={dato.tono}><i aria-hidden="true" />{dato.nombre}<strong>{dato.cantidad} · {Math.round(dato.porcentaje)}%</strong></li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>
          </>}
        </div>
      )}

      {tab === 'areas' && (

        <div className={styles.divisionView}>

          {carteraQuery.isError && <p role="alert" className={styles.message}>{carteraQuery.error.message} <button className={styles.action} type="button" onClick={() => void cargarCartera()}>Reintentar</button></p>}
          {!cartera && !carteraQuery.isError && <p role="status" className={styles.message}>Cargando cartera…</p>}

          {cartera && <>

            <section className={styles.metrics} aria-label="Indicadores por división">

              {[

                { label: 'Clientes en cartera', valor: String(resumenDivision.clientes), detalle: 'Clientes de la selección', icon: Users, tono: 'violeta' },

                { label: 'Horas contratadas', valor: formato(resumenDivision.contratadas), detalle: 'Bolsas registradas', icon: FileCheck2, tono: 'cian' },

                { label: 'Horas consumidas', valor: formato(resumenDivision.consumidas), detalle: resumenDivision.contratadas > 0 ? `${Math.round(resumenDivision.consumidas / resumenDivision.contratadas * 100)}% respecto a contratadas` : 'Sin base contractual', icon: Clock3, tono: 'cian' },

                { label: 'Horas disponibles', valor: formato(resumenDivision.disponibles), detalle: 'Saldo de bolsas', icon: Wallet, tono: 'violeta' },

                { label: 'Clientes en riesgo', valor: String(resumenDivision.categorias.riesgo), detalle: 'Excesos y riesgo reportado', icon: AlertTriangle, tono: 'rosa' },

              ].map(({ label, valor, detalle, icon: Icono, tono }) => (
                <article key={label} className={styles.metric} data-cartera-tone={tono}>
                  <div><span className={styles.metricIcon}><Icono size={21} /></span><h3>{label}</h3></div>
                  <strong>{valor}</strong><p>{detalle}</p>
                </article>
              ))}
            </section>

            <CarteraDivisionGraficos
              clientes={clientesDivision}
              categorias={resumenDivision.categorias}
              clientesEnRiesgo={clientesEnRiesgo}
              onAbrirCliente={revisarPresupuestosClienteDivision}
              onVerRiesgo={() => {
                setBusquedaDivision('')
                setEstadoDivision('riesgo')
                setPaginaDivision(1)
              }}
            />

            <section id="clientes-cartera-division" className={styles.divisionTable}>
                <div className={styles.heading}>

                  <div className="flex items-center gap-2"><BriefcaseBusiness size={16} className={styles.sectionIcon}/><h3 className="font-semibold">Clientes de todas las divisiones</h3><span className="rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground">{clientesDivisionFiltrados.length}</span></div>

                  <div className="flex flex-wrap gap-2">

                    <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground"/><input aria-label="Buscar clientes o servicios" placeholder="Buscar cliente..." value={busquedaDivision} onChange={e => setBusquedaDivision(e.target.value)} className="h-9 w-[220px] max-w-full rounded-lg border border-border bg-background pl-8 pr-2 text-sm"/></div>

                    <select aria-label="Filtrar estado de cartera" value={estadoDivision} onChange={e => setEstadoDivision(e.target.value)} className="h-9 max-w-[205px] rounded-lg border border-border bg-background px-2 text-sm"><option value="todos">Todos los estados</option><option value="curso">En curso</option><option value="limite">Próxima a agotarse</option><option value="riesgo">En riesgo</option><option value="sin_presupuesto">Sin presupuesto</option></select>
                    <button type="button" onClick={() => void cargarCartera()} disabled={cargandoCartera} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"><RefreshCw size={13} className={cargandoCartera ? 'animate-spin' : ''}/> Actualizar</button>

                  </div>

                </div>

                <div className="overflow-x-auto">

                  <table className={styles.clientTable}><thead className="bg-muted/20 text-sm text-muted-foreground"><tr>

                    <th className="px-3 py-2 text-left font-medium">Cliente</th><th className="px-2 py-2 text-left font-medium">División</th><th className="px-2 py-2 text-left font-medium">Servicios</th><th className="px-2 py-2 text-right font-medium">Contratadas</th><th className="px-2 py-2 text-right font-medium">Consumidas</th><th className="px-2 py-2 text-right font-medium">Disponibles</th><th className="px-2 py-2 text-right font-medium">Uso</th><th className="px-2 py-2 text-center font-medium">Estado</th><th className="px-2 py-2 text-center font-medium">Detalle</th>

                  </tr></thead><tbody>

                    {paginaClientesDivision.map(cliente => { const servicios = cliente.servicios ?? []; const contratado = Number(cliente.horasContratadas)||0; const consumido=Number(cliente.horasConsumidas)||0; const exceso = Number(cliente.horasExcedidas)||0; const pct=contratado>0 ? consumido/contratado*100:0; const cat=resumenDivision.clasificar(cliente); const tonos: Record<string,string> = { curso: 'bg-emerald-500/10 text-emerald-400', limite:'bg-amber-500/10 text-amber-300', riesgo:'bg-rose-500/10 text-rose-300', sin_presupuesto:'bg-muted text-muted-foreground' }; const nombres:Record<string,string>={curso:'En curso',limite:'Por agotarse',riesgo:'En riesgo',sin_presupuesto:'Sin presupuesto'};

                    return <tr key={`${cliente.area_id}-${cliente.id}`} className="border-t border-border/40 hover:bg-muted/10">

                      <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-200">{cliente.nombre.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}</span><div className="min-w-0"><p className="break-words font-semibold" title={cliente.nombre}>{cliente.nombre}</p></div></div></td>

                      <td className="px-2 py-3 text-muted-foreground">{cliente.area_nombre}</td>

                      <td className="px-2 py-3">
                        {servicios.length ? <div className={styles.serviceCell}>
                          <span title={servicios[0]}>{servicios[0]}</span>
                          {servicios.length > 1 && <span title={servicios.slice(1).join(' · ')} aria-label={servicios.slice(1).join(', ')}>+{servicios.length - 1}</span>}
                        </div> : <span className="text-muted-foreground">—</span>}
                      </td>

                      <td className="px-2 py-3 text-right tabular-nums">{formato(contratado)}</td>

                      <td className="px-2 py-3 text-right tabular-nums">{formato(consumido)}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{formato(cliente.horasDisponibles)}</td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        <div className={styles.tableUsage}>
                          <span>{contratado > 0 ? Math.round(pct) + '%' : '—'}</span>
                          {contratado > 0 && <span aria-hidden="true"><i className={cat === 'riesgo' ? 'bg-rose-500' : cat === 'limite' ? 'bg-amber-400' : 'bg-primary'} style={{ width: Math.min(100, pct) + '%' }} /></span>}
                        </div>
                        {exceso > 0 && <small className={styles.excessAmount}>+{formato(exceso)}</small>}
                      </td>

                      <td className="px-2 py-3 text-center"><span className={`inline-block whitespace-nowrap rounded-md px-2 py-1 text-sm ${tonos[cat]}`}>{nombres[cat]}</span></td>

                      <td className="px-2 py-3 text-center"><button type="button" title="Consultar presupuestos del cliente" aria-label={`Consultar presupuestos de ${cliente.nombre}`} onClick={()=>revisarPresupuestosClienteDivision(cliente)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Eye size={18}/></button></td>

                    </tr>})}

                    {paginaClientesDivision.length===0&&<tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">No hay clientes para la división y filtros seleccionados.</td></tr>}

                  </tbody></table>

                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-3 py-2 text-sm text-muted-foreground"><span>Mostrando {clientesDivisionFiltrados.length===0?0:(paginaDivisionActual-1)*filasDivision+1}–{Math.min(paginaDivisionActual*filasDivision,clientesDivisionFiltrados.length)} de {clientesDivisionFiltrados.length}</span><div className="flex items-center gap-2"><label>Filas <select aria-label="Filas por página" value={filasDivision} onChange={e=>setFilasDivision(Number(e.target.value))} className="rounded border border-border bg-background p-1"><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></select></label><button type="button" aria-label="Página anterior" disabled={paginaDivisionActual<=1} onClick={()=>setPaginaDivision(paginaDivisionActual - 1)} className="rounded border border-border p-1 disabled:opacity-30"><ChevronLeft size={13}/></button><span>{paginaDivisionActual}/{paginasDivision}</span><button type="button" aria-label="Página siguiente" disabled={paginaDivisionActual>=paginasDivision} onClick={()=>setPaginaDivision(paginaDivisionActual + 1)} className="rounded border border-border p-1 disabled:opacity-30"><ChevronRight size={13}/></button></div></div>

            </section>
          </>}
        </div>
      )}

      {tab === 'presupuestos' && !presupuestosQuery.data && (
        carteraQuery.isError || presupuestosQuery.isError
          ? <p role="alert" className={styles.message}>No se pudieron cargar los presupuestos. <button type="button" className={styles.action} onClick={() => void (cartera ? cargarPresupuestos() : cargarCartera())}>Reintentar</button></p>
          : <p role="status" className={styles.message}>Cargando presupuestos…</p>
      )}
      {tab === 'presupuestos' && presupuestosQuery.data && (
        <div className={styles.budgetView}>
          <section className={styles.budgetMetrics} aria-label="Indicadores de presupuestos">
            {[
              { titulo: 'Por aprobar', valor: String(solicitudesDivision.filter(x => x.presupuesto.estado === 'EN_REVISION').length), subtitulo: 'Enviados a revisión', icono: ClipboardList, tono: 'ambar' },
              { titulo: 'Aprobados', valor: String(solicitudesDivision.filter(x => x.presupuesto.estado === 'APROBADO').length), subtitulo: 'Aprobados en los últimos 10 días', icono: CheckCircle2, tono: 'verde' },
              { titulo: 'Observados', valor: String(solicitudesDivision.filter(x => x.presupuesto.estado === 'OBSERVADO').length), subtitulo: 'Requieren seguimiento', icono: AlertTriangle, tono: 'rosa' },
              { titulo: 'Presupuestos', valor: String(solicitudesDivision.length), subtitulo: 'Registros disponibles', icono: Layers3, tono: 'violeta' },
            ].map(({ titulo, valor, subtitulo, icono: Icono, tono }) => (
              <article key={titulo} className={styles.budgetMetric} data-cartera-tone={tono}>
                <span className={styles.metricIcon}><Icono size={23} /></span>
                <div><h3>{titulo}</h3><strong>{valor}</strong><p>{subtitulo}</p></div>
              </article>
            ))}
          </section>
          <div className={styles.budgetFilters}>
            <div className={styles.budgetFilterGroup} role="group" aria-label="Estado de la solicitud">
            {[
              { key: 'todos', texto: 'Todos' }, { key: 'pendientes', texto: 'Por aprobar' },
              { key: 'borradores', texto: 'Borradores' }, { key: 'aprobados', texto: 'Aprobados' }, { key: 'observados', texto: 'Observados' },
            ].map(op => <button type="button" key={op.key} onClick={() => { setFiltroPresupuestos(op.key); setPaginaSolicitudes(1) }} aria-pressed={filtroPresupuestos === op.key} className={styles.filter}>{op.texto}</button>)}
            </div>
            <div className={styles.budgetSearch}>
              <div><Search size={16} aria-hidden="true" /><input value={busquedaSolicitudes} onChange={e => { setBusquedaSolicitudes(e.target.value); setPaginaSolicitudes(1) }} placeholder="Buscar cliente o presupuesto" aria-label="Buscar presupuestos" /></div>
              <select aria-label="Filtrar división" value={divisionSolicitudes ?? ''} onChange={e => { setDivisionSolicitudes(e.target.value ? Number(e.target.value) : null); setPaginaSolicitudes(1) }}><option value="">Todas las divisiones</option>{areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>
            </div>
          </div>
          <div className={styles.budgetMain} data-detail-open={Boolean(presupuestoSeleccionado)}>
            <section className={`min-w-0 overflow-hidden ${styles.surface}`}>
              <div className={styles.heading}>
                <div className={styles.chartTitle}><span className={styles.chartIcon}><Layers3 size={22} /></span><div><h3>Solicitudes presupuestarias</h3><p>Primero las solicitudes en revisión. Las aprobadas se muestran durante 10 días.</p></div></div>
                <span className={styles.budgetCount}>{solicitudesFiltradas.length} presupuestos</span>
              </div>
              <div className={styles.budgetTableScroll}><table className={styles.budgetTable}>
                <thead><tr><th scope="col">Cliente / División</th><th scope="col">Servicios incluidos</th><th scope="col">Total horas</th><th scope="col">Responsable</th><th scope="col">Fecha</th><th scope="col">Estado</th><th scope="col">Acción</th></tr></thead>
                <tbody>
                  {solicitudesPagina.map(({cliente,presupuesto}) => {const servicios = serviciosDe(presupuesto);const h=horasPresupuesto(presupuesto);const estado=estadosPresupuesto[presupuesto.estado];const IconoEstado=estado.icono;const activo=presupuestoSeleccionado?.presupuesto.id===presupuesto.id&&presupuestoSeleccionado?.cliente.id===cliente.id;return <tr key={`${cliente.id}-${presupuesto.id}`} data-cartera-tone={estado.tono} className={`border-t border-border/40 hover:bg-muted/20 ${activo ? styles.selectedRow : ''}`}>
                    <td className={styles.budgetClient}><p className="font-semibold" title={cliente.nombre}>{cliente.nombre}</p><p className="text-muted-foreground">{cliente.area_nombre}</p></td>
                    <td className={styles.budgetService}><div className={styles.serviceCell}>{servicios.length ? <>{servicios.slice(0,2).map((serv,i)=><span key={i} className={styles.serviceTag} title={etiqueta(serv,['nombre','servicio_nombre','descripcion','titulo'])}>{etiqueta(serv,['nombre','servicio_nombre','descripcion','titulo'])}</span>)}{servicios.length>2&&<span className={styles.serviceTag}>+{servicios.length-2} más</span>}</> : <span className="text-muted-foreground">Consultar detalle</span>}</div></td>
                    <td className="px-3 py-3 text-right tabular-nums">{h === null ? '—' : formato(h)}</td>
                    <td className="text-muted-foreground" title={presupuesto.creadoPor ?? undefined}>{presupuesto.creadoPor ?? '—'}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{presupuesto.creadoEn ? new Date(presupuesto.creadoEn).toLocaleDateString('es-PE') : '—'}</td>
                    <td className="px-3 py-3"><span className={styles.budgetBadge}><IconoEstado size={13} />{formatearEstado(presupuesto.estado)}</span></td>
                    <td className="px-3 py-3 text-right"><button type="button" disabled={cliente.id >= 900000} onClick={() => { setAvisoPresupuesto(null); setPresupuestoSeleccionado({ cliente, presupuesto }) }} className={`${styles.outlineAction} px-2 py-1.5 disabled:cursor-not-allowed disabled:opacity-40`}>{presupuesto.estado==='APROBADO'?'Ver detalle':'Revisar'}</button></td>
                  </tr>})}
                  {!cargandoPresupuestos && !presupuestosQuery.isError && solicitudesFiltradas.length===0&&<tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">No hay presupuestos para estos filtros.</td></tr>}
                  {presupuestosQuery.isError && <tr><td colSpan={7} className="p-4 text-center text-rose-300">{presupuestosQuery.error.message} <button className="underline" onClick={() => void cargarPresupuestos()}>Reintentar</button></td></tr>}
                        {cargandoPresupuestos && <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">Cargando presupuestos…</td></tr>}
                </tbody>
              </table></div>
              <div className="flex items-center justify-between border-t border-border/40 px-3 py-2 text-[11px] text-muted-foreground"><span>Página {paginaSolicitudActual} de {paginasSolicitudes}</span><div className="flex gap-2"><button type="button" disabled={paginaSolicitudActual<=1} onClick={()=>setPaginaSolicitudes(paginaSolicitudActual - 1)} className="rounded border border-border px-2 py-1 disabled:opacity-30">Anterior</button><button type="button" disabled={paginaSolicitudActual>=paginasSolicitudes} onClick={()=>setPaginaSolicitudes(paginaSolicitudActual + 1)} className="rounded border border-border px-2 py-1 disabled:opacity-30">Siguiente</button></div></div>
            </section>
            {presupuestoSeleccionado ? <DetalleSolicitudPresupuesto
              cliente={presupuestoSeleccionado.cliente}
              presupuesto={presupuestoSeleccionado.presupuesto}
              estado={formatearEstado(presupuestoSeleccionado.presupuesto.estado)}
              soloLectura={esSocio}
              procesando={accionandoPresupuesto}
              aviso={avisoPresupuesto}
              onCerrar={() => setPresupuestoSeleccionado(null)}
              onGestion={() => {
                const { id, nombre } = presupuestoSeleccionado.cliente
                setClientePresupuesto({ id, nombre })
                setPresupuestoSeleccionado(null)
              }}
              onAccion={(accion) => void ejecutarAccionPresupuesto(presupuestoSeleccionado.presupuesto.id, accion)}
            /> : !presupuestosQuery.isPending && !presupuestosQuery.isError && <ResumenSolicitudesPresupuesto solicitudes={solicitudesDivision} />}
          </div>
          {clientePresupuesto && <div className={`${styles.surface} p-4`}><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Presupuestos de {clientePresupuesto.nombre}</h3><button type="button" onClick={()=>setClientePresupuesto(null)} className="rounded-md border border-border px-3 py-1 text-xs">Cerrar</button></div><SettingsClientePresupuestos cliente={clientePresupuesto} onCerrar={()=>setClientePresupuesto(null)}/></div>}
        </div>
      )}
      </>)}
    </div>

  )

}
