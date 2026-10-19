'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, FileSpreadsheet,
  Loader2, UserPlus, UsersRound,
} from 'lucide-react'

import {

  Avatar, BarraProgreso, BOTON, CabeceraPanel, colorDeCliente, Estado,

  horas, inicialesDe, Kpi, PANEL, type ClienteCartera,

} from './cartera-ui'

import { palabras } from '@/lib/presupuestos/nombres'

import { useAuth } from '@/lib/auth-context'



type Tab = 'equipo' | 'servicios' | 'planificacion' | 'desviaciones'



type FilaServicio = {

  id: number

  origen: 'DETALLADO' | 'CONSOLIDADO' | 'COMPLEMENTARIO'

  nombre: string

  activo: boolean

  horas: number

  asignado: number

  registrado: number

  aprobado: number

  saldo: number | null

  desviacion: number

  consumo: 'medido' | 'sin_imputar'

  pendientePorConfirmar: number

}

type FilaIntegrante = {

  usuarioId: number

  nombre: string

  cargo: string | null

  area: string | null

  areaId: number | null

  esDelAreaDelCliente: boolean

  rol: string

  asignado: number

  horasPropuestas: number

  registrado: number

  aprobado: number

  disponible: number | null

  desviacion: number

  porcentaje: number

  porServicio: { servicioId: number; servicio: string; horas: number }[]

}

type FilaPlan = {

  subetapa: string

  etapa: string | null

  horas: number

  semanaInicio: number | null

  semanaFin: number | null

  mes: string | null

  servicioId: number | null

}

type Desviacion = {

  usuarioId: number | null

  nombre: string

  asignado: number

  registrado: number

  desviacion: number

  porcentaje: number

  detalle: string

}

type Candidato = { id: number; nombre: string; cargo: string | null; yaAsignado: boolean }

type Gestion = {

  cliente: { id: number; nombre: string; area: string; areaId: number }

  presupuestos: { id: number; version: number; estado: string; archivoNombre: string }[]

  presupuestoVigente: number | null

  indicadores: {

    horasContratadas: number

    horasPropuestas: number

    horasRegistradas: number

    horasAprobadas: number

    horasPendientesAprobacion: number

    horasDisponibles: number

    desviacionHoras: number | null

    desviacionPorcentaje: number | null

    cronogramaConFechas: boolean

  }

  equipo: FilaIntegrante[]

  servicios: FilaServicio[]

  sinResolver: {

    id: number

    servicioId: number

    servicio: string

    etiqueta: string | null

    categoria: string | null

    horas: number

    motivo: string | null

  }[]

  desviaciones: Desviacion[]

  planificacion: FilaPlan[]

  candidatos: Candidato[]

  permisos: { puedeGestionar: boolean; motivo: string }

}



export function ClienteGestion({

  cliente,

  onVolver,

  onImportarPresupuesto,

  onEditar,

}: {

  cliente: ClienteCartera

  onVolver: () => void

  onImportarPresupuesto: (cliente: ClienteCartera) => void

  onEditar: (cliente: ClienteCartera) => void

}) {

  const [tab, setTab] = useState<Tab>('equipo')

  const { usuario } = useAuth()

  const esSocio = usuario?.rol === 'socio'

  const [datos, setDatos] = useState<Gestion | null>(null)

  const [cargando, setCargando] = useState(true)

  const [error, setError] = useState<string | null>(null)

  const [asignando, setAsignando] = useState<number[] | null>(null)

  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)



  const cargar = useCallback(async () => {

    try {

      const r = await fetch(`/api/clientes/${cliente.id}/gestion`)

      const cuerpo = await r.json()

      if (!r.ok) throw new Error(cuerpo.error ?? 'No se pudo cargar la gestión del cliente.')

      setDatos(cuerpo as Gestion)

      setError(null)

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Error.')

      setDatos(null)

    } finally {

      setCargando(false)

    }

  }, [cliente.id])



  useEffect(() => { void cargar() }, [cargar])



  /**

   * Reparte las horas sin dueño de una etiqueta a alguien del equipo del área.

   *

   * Recibe TODAS las filas de esa etiqueta, no una: el Excel puede traer la

   * misma persona en varios bloques del mismo servicio y son horas suyas, así

   * que se reparten juntas. Cada fila conserva su bolsa.

   *

   * No es un ajuste local: llama a la acción real del presupuesto, que comprueba

   * el permiso, que no se pase de ninguna bolsa y deja rastro en la auditoría.

   */

  const asignar = async (asignacionIds: number[], usuarioId: number) => {

    const presupuestoId = datos?.presupuestoVigente

    if (!presupuestoId) {

      setAviso({ ok: false, texto: 'Este cliente no tiene un presupuesto que repartir todavía.' })

      return

    }

    setAsignando(asignacionIds)

    setAviso(null)

    try {

      const r = await fetch(`/api/presupuestos/${presupuestoId}/accion`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          accion: 'CONFIRMAR_ASIGNACION',

          asignacion_ids: asignacionIds,

          usuario_id: usuarioId,

          justificacion: 'Reparto de horas sin persona a un integrante del área.',

        }),

      })

      const cuerpo = await r.json()

      setAviso({ ok: r.ok, texto: cuerpo.mensaje ?? cuerpo.error ?? 'Sin respuesta del servidor.' })

      if (r.ok) await cargar()

    } catch (e) {

      setAviso({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo completar la asignación.' })

    } finally {

      setAsignando(null)

    }

  }



  const presupuesto = datos?.presupuestos.find((p) => p.id === datos.presupuestoVigente) ?? null



  // La pestaña de Planificación depende de los datos, así que la lista se arma

  // aquí y no en el JSX. Si al recargar el Excel deja de traer cronograma, la

  // pestaña sigue seleccionada en el estado aunque ya no exista: por eso la

  // sección efectiva se recorta contra la lista en vez de confiar en `tab`.

  const hayCronograma = (datos?.planificacion.length ?? 0) > 0

  const pestanas = useMemo<readonly [Tab, string, typeof UsersRound][]>(() => {

    const conCronograma: [Tab, string, typeof UsersRound][] = [

      ['equipo', 'Equipo', UsersRound],

      ['servicios', 'Servicios', FileSpreadsheet],

      ['planificacion', 'Planificación', CalendarDays],

      ['desviaciones', 'Desviaciones', AlertTriangle],

    ]

    if (!hayCronograma) return conCronograma.filter(([clave]) => clave !== 'planificacion')

    return conCronograma

  }, [hayCronograma])

  const tabActiva = pestanas.some(([clave]) => clave === tab) ? tab : 'equipo'



  return (

    <div className="space-y-4">

      {/* El nombre y el área los muestra la cabecera de la página. Aquí queda la

          barra de acciones y de dónde sale el presupuesto. */}

      <div className="flex flex-wrap items-center justify-between gap-2">

        <button type="button" onClick={onVolver} className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-[#e7e9f3] transition hover:border-primary hover:bg-accent/15">

          <ArrowLeft size={14} /> Volver a la cartera

        </button>

        <div className="flex flex-wrap items-center gap-2">

          <Estado valor={cliente.estado} />

          {/* El SOCIO consulta la ficha; importar o editar son escrituras y la

              API las rechaza igual, así que ni se ofrecen. */}

          {esSocio ? null : (

            <>

              {usuario?.rol !== 'admin' && (

                <button

                  type="button"

                  className={BOTON}

                  disabled={(datos?.presupuestos.length ?? 0) > 0}

                  title={(datos?.presupuestos.length ?? 0) > 0 ? 'Ya hay un presupuesto cargado' : undefined}

                  onClick={() => onImportarPresupuesto(cliente)}

                >

                  <FileSpreadsheet size={15} /> Importar presupuesto

                </button>

              )}

              <button type="button" className={BOTON} onClick={() => onEditar(cliente)}>Editar cliente</button>

            </>

          )}

        </div>

      </div>



      {cargando ? (

        <div className={`${PANEL} flex items-center justify-center gap-2 px-4 py-10 text-sm text-[#a1a8bd]`}>

          <Loader2 size={16} className="animate-spin" /> Cargando el presupuesto del cliente...

        </div>

      ) : error ? (

        <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">{error}</p>

      ) : datos ? (

        <>

          <div className={`${PANEL} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>

            <div className="flex min-w-0 items-center gap-2.5">

              <FileSpreadsheet size={18} className="text-violet-300" />

              <div className="min-w-0">

                <p className="text-[10px] uppercase tracking-wide text-[#9ba5bc]">Presupuesto del cliente</p>

                <p className="truncate text-sm font-semibold text-[#eceaf6]">

                  {presupuesto

                    ? `${presupuesto.archivoNombre} · v${presupuesto.version} · ${presupuesto.estado}`

                    : 'Sin presupuesto importado'}

                </p>

              </div>

            </div>

            {datos.presupuestos.length > 1 && (

              <span className="rounded-md border border-border px-2 py-1 text-[10px] text-[#9aa2b8]">

                {datos.presupuestos.length} versiones en el historial

              </span>

            )}

          </div>



          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">

            <Kpi

              icono={<FileSpreadsheet size={20} />}

              etiqueta="Horas contratadas"

              valor={horas(datos.indicadores.horasContratadas)}

              nota={datos.indicadores.horasContratadas > 0 ? 'Bolsas activas' : 'Ninguna bolsa activa todavía'}

              tono="azul"

            />

            <Kpi

              icono={<CheckCircle2 size={20} />}

              etiqueta="Propostas por aprobar"

              valor={horas(datos.indicadores.horasPropuestas)}

              nota="No son contrato"

            />

            <Kpi

              icono={<UsersRound size={20} />}

              etiqueta="Horas registradas"

              valor={horas(datos.indicadores.horasRegistradas)}

              nota={`${horas(datos.indicadores.horasAprobadas)} aprobadas`}

              tono="verde"

            />

            <Kpi

              icono={<CalendarDays size={20} />}

              etiqueta="Disponibles"

              valor={datos.indicadores.horasDisponibles > 0 ? horas(datos.indicadores.horasDisponibles) : '—'}

              nota={datos.indicadores.horasDisponibles > 0 ? 'Sobre lo activo' : 'Requiere activar bolsas'}

              tono="ambar"

            />

            <Kpi

              icono={<AlertTriangle size={20} />}

              etiqueta="Exceso"

              valor={datos.indicadores.desviacionHoras === null ? '—' : `+${horas(Math.abs(datos.indicadores.desviacionHoras))}`}

              nota={datos.indicadores.desviacionHoras === null ? 'Sin horas registradas' : 'Sobre lo asignado'}

              tono="rojo"

            />

          </div>



          {/* "Planificación" solo existe si el Excel trajo cronograma. Muchas

              cotizaciones no lo tienen: mostrarla vacía sugeriría que falta

              algo por rellenar cuando el documento nunca lo trajo. */}

          <div className="flex flex-wrap gap-1.5 border-b border-border pb-2" role="tablist" aria-label="Secciones de gestión integral">

            {pestanas.map(([clave, texto, Icono]) => (

              <button

                key={clave}

                type="button"

                role="tab"

                aria-selected={tabActiva === clave}

                onClick={() => setTab(clave)}

                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${tabActiva === clave ? 'bg-violet-500/25 text-[#e4d0ff] ring-1 ring-primary/50' : 'text-[#a4acc0] hover:bg-muted hover:text-white'}`}

              >

                <Icono size={15} />{texto}

              </button>

            ))}

          </div>



          {tabActiva === 'equipo' && (

            <PanelEquipo

              datos={datos}

              asignando={asignando}

              onAsignar={asignar}

            />

          )}



          {tabActiva === 'servicios' && <PanelServicios datos={datos} />}



          {tabActiva === 'planificacion' && <PanelCronograma datos={datos} />}



          {tabActiva === 'desviaciones' && <PanelDesviaciones datos={datos} />}



          {aviso && (

            <p

              role="status"

              className={`rounded-lg border px-3 py-2 text-xs ${

                aviso.ok

                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'

                  : 'border-rose-500/25 bg-rose-500/10 text-rose-300'

              }`}

            >

              {aviso.texto}

            </p>

          )}



          <p className="text-[10px] leading-relaxed text-[#8b93a8]">

            {datos.permisos.motivo} Las bolsas salen del Excel del cliente.

            {hayCronograma &&

              ' El cronograma usa las semanas relativas del Excel, no fechas de calendario.'}

          </p>

        </>

      ) : null}

    </div>

  )

}




type FilaSinRepartir = Gestion['sinResolver'][number]

type GrupoSinRepartir = {

  /** Clave de agrupación, estable entre renders. */

  clave: string

  etiqueta: string | null

  /** Categorías distintas que el Excel le puso, en el orden en que aparecen. */

  categorias: (string | null)[]

  /** Horas sumadas de todos los bloques en los que aparece. */

  horas: number

  /** Cuántas filas del Excel se han unido. */

  bloques: number

  /** Nombres de servicio, sin repetir, para decir de dónde salen las horas. */

  servicios: string[]

  /** Todas las filas a las que hay que confirmar de una vez. */

  asignacionIds: number[]

  /** Una línea por fila del Excel, para el title cuando no cabe en la celda. */

  detalle: string[]

}



function agruparSinRepartir(filas: FilaSinRepartir[]): GrupoSinRepartir[] {

  const grupos = new Map<string, GrupoSinRepartir>()



  for (const f of filas) {

    // Sin etiqueta no se sabe de quién son: cada fila sin nombre se queda

    // aparte. Juntarlas produciría una persona inventada con la suma de todas.

    const clave = f.etiqueta ? [...palabras(f.etiqueta)].sort().join(' ') : `sin-persona:${f.id}`

    const existente = grupos.get(clave)

    if (!existente) {

      grupos.set(clave, {

        clave,

        etiqueta: f.etiqueta,

        categorias: [f.categoria],

        horas: f.horas,

        bloques: 1,

        servicios: [f.servicio],

        asignacionIds: [f.id],

        detalle: [`${f.categoria ?? 'Sin categoría'} · ${f.servicio}: ${horas(f.horas)}`],

      })

      continue

    }



    existente.horas = Math.round((existente.horas + f.horas) * 100) / 100

    existente.bloques += 1

    if (!existente.servicios.includes(f.servicio)) existente.servicios.push(f.servicio)

    if (!existente.categorias.includes(f.categoria)) existente.categorias.push(f.categoria)

    existente.asignacionIds.push(f.id)

    existente.detalle.push(`${f.categoria ?? 'Sin categoría'} · ${f.servicio}: ${horas(f.horas)}`)

  }



  return [...grupos.values()].sort((a, b) => b.horas - a.horas)

}



function PanelEquipo({

  datos,

  asignando,

  onAsignar,

}: {

  datos: Gestion

  asignando: number[] | null

  onAsignar: (asignacionIds: number[], usuarioId: number) => void

}) {

  const sinResolver = useMemo(() => agruparSinRepartir(datos.sinResolver), [datos.sinResolver])

  const puedeRepartir = datos.permisos.puedeGestionar

  const totalSinRepartir = Math.round(sinResolver.reduce((t, a) => t + a.horas, 0) * 100) / 100

  const vacio = datos.equipo.length === 0 && sinResolver.length === 0



  return (

    <section className={`${PANEL} min-w-0 overflow-hidden`}>

      <CabeceraPanel

        icono={<UsersRound size={19} />}

        titulo="Equipo y bolsas de horas"

        descripcion="Las personas que nombra el Excel del cliente"

      />

      {vacio ? (

        <p className="px-4 py-8 text-center text-xs text-[#9aa2b8]">

          Este presupuesto todavía no tiene horas repartidas. Importa el Excel del cliente y aquí

          aparecerán las personas y sus categorías.

        </p>

      ) : (

        <div className="min-w-0">

          {/* Sin min-w ni overflow-x: la tabla es table-fixed con anchos en

              porcentaje, igual que la de la cartera. Con un ancho mínimo

              aparecía la barra horizontal y había que arrastrarla para ver

              las columnas de la derecha. */}

          <table className="w-full table-fixed border-collapse text-left text-[11px]">

            <colgroup>

              <col style={{ width: '30%' }} />

              <col style={{ width: '13%' }} />

              <col style={{ width: '13%' }} />

              <col style={{ width: '12%' }} />

              <col style={{ width: '19%' }} />

              {puedeRepartir && sinResolver.length > 0 && <col style={{ width: '13%' }} />}

            </colgroup>

            <thead className="bg-muted text-[#aab2c4]">

              <tr>

                <th className="py-3 pl-4 pr-2 font-medium leading-tight">Colaborador</th>

                <th className="px-2 py-3 font-medium leading-tight">Asignadas</th>

                <th className="px-2 py-3 font-medium leading-tight">Registradas</th>

                <th className="px-2 py-3 font-medium leading-tight">Saldo</th>

                <th className="px-2 py-3 font-medium leading-tight">Consumo</th>

                {puedeRepartir && sinResolver.length > 0 && (

                  <th className="py-3 pl-2 pr-3 text-right font-medium leading-tight">Repartir</th>

                )}

              </tr>

            </thead>

            <tbody>

              {datos.equipo.map((persona) => {

                const color = colorDeCliente(persona.usuarioId)

                const sinBolsa = persona.disponible === null

                return (

                  <tr key={persona.usuarioId} className="border-t border-border hover:bg-white/[0.025]">

                    <td className="py-3 pl-4 pr-2">

                      <div className="flex min-w-0 items-center gap-2.5">

                        <Avatar iniciales={inicialesDe(persona.nombre)} color={color} />

                        <div className="min-w-0">

                          <p className="truncate text-[11px] font-semibold text-[#e8e9f3]" title={persona.nombre}>{persona.nombre}</p>

                          <p className={`mt-0.5 truncate text-[10px] ${sinBolsa ? 'text-amber-300' : 'text-[#9ba4b8]'}`}>

                            {persona.rol}

                            {sinBolsa && ' · sin bolsa activa'}

                          </p>

                          {/* En un servicio multidisciplinario entra gente de

                              otras áreas. Saying which one avoids that a name

                              out of nowhere appears charged to this client. */}

                          {!persona.esDelAreaDelCliente && persona.area && (

                            <span className="mt-0.5 block truncate text-[9px] text-sky-300/80" title={`Área: ${persona.area}`}>

                              de {persona.area}

                            </span>

                          )}

                        </div>

                      </div>

                    </td>

                    <td className="px-2 py-3 font-semibold tabular-nums">

                      {persona.asignado > 0 ? (

                        horas(persona.asignado)

                      ) : (

                        <span className="text-amber-300">{horas(persona.horasPropuestas)}</span>

                      )}

                      {persona.asignado === 0 && (

                        <span className="block text-[10px] font-medium text-[#8a93a8]">propuestas</span>

                      )}

                    </td>

                    <td className="px-2 py-3 tabular-nums">{horas(persona.registrado)}</td>

                    <td className={`px-2 py-3 font-semibold tabular-nums ${sinBolsa ? 'text-amber-300' : 'text-[#d8e0ef]'}`}>

                      {persona.disponible === null ? '—' : horas(persona.disponible)}

                    </td>

                    <td className="px-2 py-3">

                      {persona.asignado > 0

                        ? <BarraProgreso total={persona.asignado} consumidas={persona.registrado} />

                        : <span className="text-[10px] text-[#8a93a8]">sin consumo</span>}

                    </td>

                    {puedeRepartir && sinResolver.length > 0 && <td />}

                  </tr>

                )

              })}



              {/* Las horas sin dueño salen como filas, igual que en el Excel, y

                  no como un bloque de texto aparte que no deja hacer nada. Una

                  fila por persona aunque el Excel la reparta en varios bloques:

                  son sus mismas horas, sumadas. */}

              {sinResolver.map((a) => (

                <tr key={a.clave} className="border-t border-amber-500/20 bg-amber-500/[0.05] hover:bg-amber-500/[0.08]">

                  <td className="py-3 pl-4 pr-2">

                    <div className="flex min-w-0 items-center gap-2.5">

                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dashed border-amber-500/40 text-[10px] font-bold text-amber-300">

                        {inicialesDe(a.etiqueta ?? '—')}

                      </span>

                      <div className="min-w-0">

                        <p className="truncate text-[11px] font-semibold text-amber-200" title={a.etiqueta ?? 'Sin persona en el Excel'}>

                          {a.etiqueta ?? 'Sin persona en el Excel'}

                        </p>

                        <p className="mt-0.5 truncate text-[10px] text-[#b9a98a]" title={a.detalle.join('\n')}>

                          {a.categorias.filter(Boolean).join(' / ') || 'Sin categoría'} ·{' '}

                          {a.servicios.length === 1 ? a.servicios[0] : `${a.servicios.length} servicios`}

                        </p>

                      </div>

                    </div>

                  </td>

                  <td className="px-2 py-3 font-semibold tabular-nums text-amber-200">

                    {horas(a.horas)}

                    {a.bloques > 1 && (

                      <span className="block text-[10px] font-medium text-amber-300/80">

                        {a.bloques} bloques del Excel

                      </span>

                    )}

                  </td>

                  <td className="px-2 py-3 tabular-nums text-[#8a93a8]">—</td>

                  <td className="px-2 py-3 tabular-nums text-[#8a93a8]">—</td>

                  <td className="px-2 py-3">

                    <span className="text-[10px] text-amber-300/80">sin repartir</span>

                  </td>

                  {puedeRepartir && (

                    <td className="py-3 pl-2 pr-3 text-right">

                      <SelectorArea

                        candidatos={datos.candidatos}

                        disabled={asignando !== null && a.asignacionIds.some((id) => asignando.includes(id))}

                        onElegir={(usuarioId) => onAsignar(a.asignacionIds, usuarioId)}

                      />

                    </td>

                  )}

                </tr>

              ))}

            </tbody>

            {sinResolver.length > 0 && (

              <tfoot>

                <tr className="border-t border-amber-500/25 bg-amber-500/[0.08]">

                  <td className="px-4 py-2.5 text-[11px] font-semibold text-amber-200">Pendiente de repartir</td>

                  <td className="px-2 py-2.5 text-[11px] font-bold text-amber-200">{horas(totalSinRepartir)}</td>

                  <td colSpan={puedeRepartir ? 4 : 3} className="px-2 py-2.5 text-[10px] text-amber-200/80">

                    No se imputan a nadie hasta que se repartan.

                  </td>

                </tr>

              </tfoot>

            )}

          </table>

        </div>

      )}

    </section>

  )

}


function PanelServicios({ datos }: { datos: Gestion }) {
  const [mostrarConsolidados, setMostrarConsolidados] = useState(false)

  // Se usan las filas que entrega gestion: cada ID es una bolsa del Excel.
  // Nunca fusionar dos servicios solo porque tengan el mismo nombre.
  const porServicio = useMemo(() => {
    const mapa = new Map<number, { nombre: string; horas: number; sinRepartir: boolean; clave: string }[]>()
    for (const persona of datos.equipo) {
      for (const ps of persona.porServicio) {
        const lista = mapa.get(ps.servicioId) ?? []
        const clave = `usuario-${persona.usuarioId}`
        const existente = lista.find(x => x.clave === clave)
        if (existente) existente.horas += ps.horas
        else lista.push({ nombre: persona.nombre, horas: ps.horas, sinRepartir: false, clave })
        mapa.set(ps.servicioId, lista)
      }
    }
    for (const pendiente of datos.sinResolver) {
      const lista = mapa.get(pendiente.servicioId) ?? []
      // No fusionar filas sin nombre: pueden representar personas diferentes.
      const clave = pendiente.etiqueta ? `pendiente-${[...palabras(pendiente.etiqueta)].sort().join('-')}` : `sin-persona-${pendiente.id}`
      const existente = lista.find(x => x.clave === clave)
      if (existente) existente.horas += pendiente.horas
      else lista.push({ nombre: pendiente.etiqueta ?? 'Sin persona en el Excel', horas: pendiente.horas, sinRepartir: true, clave })
      mapa.set(pendiente.servicioId, lista)
    }
    for (const lista of mapa.values()) lista.sort((a, b) => b.horas - a.horas)
    return mapa
  }, [datos.equipo, datos.sinResolver])

  if (datos.servicios.length === 0) {
    return <section className={`${PANEL} min-w-0 overflow-hidden`}>
      <CabeceraPanel icono={<FileSpreadsheet size={19}/>} titulo="Servicios y bolsas de horas" descripcion="Servicios declarados en el presupuesto del cliente" />
      <p className="px-4 py-8 text-center text-xs text-[#9aa2b8]">Este cliente no tiene servicios cargados.</p>
    </section>
  }

  const servicios = datos.servicios.filter(s => s.origen !== 'CONSOLIDADO')
  const total = (s: FilaServicio) => (porServicio.get(s.id) ?? []).reduce((n, persona) => n + persona.horas, 0)
  // Las referencias consolidadas se comparan, nunca se suman a las bolsas.
  const consolidados = datos.servicios.filter(s => s.origen === 'CONSOLIDADO')
  const totalConsolidado = consolidados.reduce((n, s) => n + s.horas, 0)
  const totalBolsas = servicios.reduce((n, s) => n + s.horas, 0)
  const diferenciaConsolidacion = totalConsolidado - totalBolsas

  return <div className="space-y-3">
    <section className={`${PANEL} min-w-0 overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <UsersRound size={19} className="text-violet-300" />
          <div>
            <h3 className="text-[13px] font-semibold text-[#e8e9f3]">Servicios y bolsas de horas</h3>
            <p className="text-[10px] text-[#9aa2b8]">{servicios.length} {servicios.length === 1 ? 'bolsa' : 'bolsas'} · responsables, horas distribuidas y consumo</p>
          </div>
        </div>

      </div>
      {/* Todo el detalle relevante se muestra sin clics adicionales. */}
      <div className="space-y-2 p-3">
        {servicios.length === 0 && <p className="px-2 py-5 text-xs text-[#9aa2b8]">Este presupuesto no contiene servicios con bolsas individuales.</p>}
        {servicios.map((servicio, index) => {
          const personas = porServicio.get(servicio.id) ?? []
          const repartidas = total(servicio)
          const sinResolver = personas.filter(p => p.sinRepartir).reduce((n, p) => n + p.horas, 0)
          const diferencia = servicio.horas - repartidas
          const tono = index % 3 === 0 ? 'bg-violet-500/20 text-violet-300' : index % 3 === 1 ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'
          return (
            <article key={servicio.id} className="overflow-hidden rounded-xl border border-border/80 bg-secondary/25">
              <div className="grid grid-cols-1 items-center gap-3 px-3 py-3 lg:grid-cols-[minmax(180px,1.05fr)_minmax(215px,1.35fr)_minmax(270px,1fr)] lg:gap-4">
                {/* Nombre completo con espacio suficiente, sin ocultar a los responsables. */}
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tono}`}><FileSpreadsheet size={19} /></span>
                  <div className="min-w-0">
                    <h4 className="line-clamp-2 text-[11px] font-semibold leading-snug text-[#e8e9f3]" title={servicio.nombre}>{servicio.nombre}</h4>
                    <p className="mt-1 text-[10px] text-muted-foreground">{servicio.activo ? 'Bolsa activa' : 'Bolsa no activa'}</p>
                    <span className="mt-1 inline-flex rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 text-[9px] text-[#aeb7cb]">{personas.length} {personas.length === 1 ? 'integrante/asignación' : 'integrantes/asignaciones'}</span>
                  </div>
                </div>
                {/* Estilo del importador: nombres y asignaciones VISIBLE en la tarjeta. */}
                <div className="min-w-0 border-t border-border/50 pt-2 lg:border-l lg:border-t-0 lg:py-0 lg:pl-4">
                  <p className="mb-1.5 text-[9px] font-medium text-[#98a2b9]">Integrantes y horas repartidas</p>
                  {personas.length === 0 ? (
                    <p className="text-[10px] text-amber-300">Sin integrantes declarados en el Excel</p>
                  ) : (
                    <ul className="space-y-1">
                      {personas.map(persona => (
                        <li key={persona.clave} className="flex min-w-0 items-start justify-between gap-2 text-[10px] leading-snug" title={persona.nombre}>
                          <span className={`flex min-w-0 items-start gap-1.5 ${persona.sinRepartir ? 'text-amber-300' : 'text-[#cbd2e0]'}`}>
                            <span className={`mt-1 size-1.5 shrink-0 rounded-full ${persona.sinRepartir ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                            <span className="min-w-0 break-words">{persona.nombre}{persona.sinRepartir ? ' · sin identificar' : ''}</span>
                          </span>
                          <strong className={`shrink-0 whitespace-nowrap font-semibold tabular-nums ${persona.sinRepartir ? 'text-amber-300' : 'text-[#ebedf7]'}`}>{horas(persona.horas)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="min-w-0 border-t border-border/50 pt-2 lg:border-l lg:border-t-0 lg:py-0 lg:pl-4">
                  <div className="grid grid-cols-4 gap-2 text-[9px]">
                    <div><span className="block text-muted-foreground">Bolsa</span><strong className="mt-1 block whitespace-nowrap text-[11px] tabular-nums">{horas(servicio.horas)}</strong></div>
                    <div><span className="block text-muted-foreground">Repartidas</span><strong className="mt-1 block whitespace-nowrap text-[11px] tabular-nums">{horas(repartidas)}</strong></div>
                    <div><span className="block text-muted-foreground">Registradas</span><strong className="mt-1 block whitespace-nowrap text-[11px] tabular-nums">{servicio.consumo === 'sin_imputar' ? '—' : horas(servicio.registrado)}</strong></div>
                    <div><span className="block text-muted-foreground">Saldo</span><strong className={`mt-1 block whitespace-nowrap text-[11px] tabular-nums ${servicio.saldo === null ? 'text-amber-300' : servicio.saldo < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{servicio.saldo === null ? '—' : horas(servicio.saldo)}</strong></div>
                  </div>
                  <div className="mt-2">
                    {servicio.consumo === 'sin_imputar' ? <span className="text-[9px] text-muted-foreground">Consumo sin imputación por servicio</span> : <BarraProgreso total={servicio.horas} consumidas={servicio.registrado} />}
                  </div>
                </div>
              </div>
              {(!servicio.activo || sinResolver > 0 || Math.abs(diferencia) > 0.01) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 bg-amber-500/[0.035] px-4 py-2 text-[10px]">
                  {!servicio.activo && <span className="text-amber-300">Bolsa no activa; no cuenta como horas contratadas.</span>}
                  {sinResolver > 0 && <span className="text-amber-300">{horas(sinResolver)} pendientes de identificar o asignar.</span>}
                  {diferencia > 0.01 && <span className="text-amber-300">{horas(diferencia)} de bolsa aún sin distribuir.</span>}
                  {diferencia < -0.01 && <span className="text-rose-300">{horas(-diferencia)} distribuidas por encima de la bolsa.</span>}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>

    {datos.servicios.some(s => s.origen === 'CONSOLIDADO') && <section className={`${PANEL} min-w-0 overflow-hidden`}>
      <button type="button" onClick={() => setMostrarConsolidados(valor => !valor)} aria-expanded={mostrarConsolidados}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.025]">
        <span className="flex items-center gap-2 text-xs font-semibold text-[#e8e9f3]">
          <FileSpreadsheet size={17} className="text-violet-300" /> Consolidados de referencia
          <span className="hidden font-normal text-[10px] text-muted-foreground sm:inline">· no generan bolsas adicionales</span>
        </span>
        <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-[#e9e6f5]">Total: {horas(totalConsolidado)}</span>
        <span className="shrink-0 text-[11px] text-violet-300">{mostrarConsolidados ? 'Ocultar ▴' : 'Mostrar ▾'}</span>
      </button>
      {mostrarConsolidados && <ul className="divide-y divide-border border-t border-border">
        {datos.servicios.filter(s => s.origen === 'CONSOLIDADO').map(s =>
          <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[11px]">
            <span className="min-w-0 truncate" title={s.nombre}>{s.nombre}</span>
            <strong className="shrink-0 tabular-nums">{horas(s.horas)}</strong>
          </li>
        )}
        <li className="flex items-center justify-between gap-3 border-t border-violet-500/25 bg-violet-500/[0.06] px-4 py-3 text-[11px]">
          <span className="font-semibold text-[#e8e9f3]">Total consolidado de referencia</span>
          <strong className="tabular-nums text-[#e8e9f3]">{horas(totalConsolidado)}</strong>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[10px] text-[#aab2c4]">
          <span>Total de bolsas individuales: <strong className="text-[#e5e7ef]">{horas(totalBolsas)}</strong></span>
          {Math.abs(diferenciaConsolidacion) <= 0.01
            ? <span className="text-emerald-300">Los totales coinciden.</span>
            : <span className="text-amber-300">Diferencia de referencia: {horas(Math.abs(diferenciaConsolidacion))}. Revisar el alcance de los consolidados en el Excel.</span>}
        </li>
      </ul>}
    </section>}
  </div>
}


function SelectorArea({

  candidatos,

  disabled,

  onElegir,

}: {

  candidatos: Candidato[]

  disabled: boolean

  onElegir: (usuarioId: number) => void

}) {

  const [abierto, setAbierto] = useState(false)

  const [filtro, setFiltro] = useState('')

  const [pos, setPos] = useState<{ arriba: boolean; top: number; bottom: number; left: number }>({

    arriba: false,

    top: 0,

    bottom: 0,

    left: 0,

  })

  const boton = useRef<HTMLButtonElement>(null)

  const menu = useRef<HTMLDivElement>(null)



  const ALTO = 320

  const ANCHO = 288



  const calcular = useCallback(() => {

    const r = boton.current?.getBoundingClientRect()

    if (!r) return

    const espacioAbajo = window.innerHeight - r.bottom

    // Si no cabe abajo pero sí arriba, se abre arriba.

    const arriba = espacioAbajo < ALTO && r.top > espacioAbajo

    const left = Math.min(

      Math.max(8, r.left + r.width - ANCHO),

      Math.max(8, window.innerWidth - ANCHO - 8)

    )

    setPos({ arriba, top: r.top, bottom: r.bottom, left })

  }, [])



  useEffect(() => {

    if (!abierto) return

    calcular()

    const cerrar = (e: PointerEvent) => {

      if (!boton.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) {

        setAbierto(false)

      }

    }

    const tecla = (e: KeyboardEvent) => {

      if (e.key === 'Escape') {

        setAbierto(false)

        boton.current?.focus()

      }

    }

    // Con scroll o cambio de tamaño la posición fija quedaría desfasada.

    const ocultar = () => setAbierto(false)

    document.addEventListener('pointerdown', cerrar)

    document.addEventListener('keydown', tecla)

    window.addEventListener('scroll', ocultar, true)

    window.addEventListener('resize', ocultar)

    return () => {

      document.removeEventListener('pointerdown', cerrar)

      document.removeEventListener('keydown', tecla)

      window.removeEventListener('scroll', ocultar, true)

      window.removeEventListener('resize', ocultar)

    }

  }, [abierto, calcular])



  const q = filtro.trim().toLocaleLowerCase('es-PE')

  const lista = candidatos.filter((c) => !q || c.nombre.toLocaleLowerCase('es-PE').includes(q))



  if (disabled) {

    return (

      <span className="inline-flex items-center gap-1.5 text-[10px] text-amber-200/70">

        <Loader2 size={12} className="animate-spin" /> Asignando...

      </span>

    )

  }

  if (candidatos.length === 0) {

    return (

      <span className="text-[10px] text-amber-200/70" title="No hay personal activo en el área de este cliente.">

        Área vacía

      </span>

    )

  }



  return (

    <>

      <button

        ref={boton}

        type="button"

        aria-expanded={abierto}

        aria-haspopup="listbox"

        onClick={() => setAbierto((v) => !v)}

        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-500/20"

      >

        <UserPlus size={13} /> Asignar

      </button>

      {abierto &&

        createPortal(

          <div

            ref={menu}

            role="listbox"

            style={

              // Arriba: `bottom` a la altura del botón, para que el menú crezca

              // hacia arriba desde su borde. Abajo: `top` desde su borde inferior.

              pos.arriba

                ? { bottom: window.innerHeight - pos.top + 6, left: pos.left }

                : { top: pos.bottom + 6, left: pos.left }

            }

            className="fixed z-[100] w-[288px] rounded-xl border border-border bg-popover p-1.5 shadow-[0_16px_40px_#0009]"

          >

            <input

              autoFocus

              value={filtro}

              onChange={(e) => setFiltro(e.target.value)}

              placeholder="Buscar en el área..."

              className="mb-1 h-8 w-full rounded-lg border border-border bg-input px-2.5 text-xs text-[#e9e6f2] outline-none placeholder:text-[#7c7791] focus:border-primary"

            />

            <ul className="max-h-64 overflow-auto">

              {lista.map((c) => (

                <li key={c.id}>

                  <button

                    type="button"

                    role="option"

                    aria-selected={false}

                    onClick={() => {

                      setAbierto(false)

                      setFiltro('')

                      onElegir(c.id)

                    }}

                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[#ece9f5] hover:bg-secondary"

                  >

                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-[10px] font-bold text-[#c4b5fd]">

                      {inicialesDe(c.nombre)}

                    </span>

                    <span className="min-w-0 flex-1">

                      <span className="block truncate">{c.nombre}</span>

                      <span className="block truncate text-[10px] text-[#8f8aa3]">

                        {c.cargo ?? 'Sin cargo'}

                        {c.yaAsignado ? ' · ya tiene horas' : ''}

                      </span>

                    </span>

                  </button>

                </li>

              ))}

              {lista.length === 0 && (

                <li className="px-2.5 py-3 text-center text-[10px] text-[#8f8aa3]">

                  Nadie del área coincide con «{filtro}».

                </li>

              )}

            </ul>

          </div>,

          document.body

        )}

    </>

  )

}



function PanelCronograma({ datos }: { datos: Gestion }) {
  const filas = datos.planificacion

  // El orden y la duración pertenecen al cronograma original del Excel.
  // No inferimos fechas ni asociaciones con bolsas a partir de las tareas.
  const grupos = useMemo(() => {
    const resultado: { clave: string; etapa: string; tareas: { fila: FilaPlan; indice: number }[] }[] = []
    filas.forEach((fila, indice) => {
      const etapa = fila.etapa?.trim() || 'Otras tareas'
      const ultimo = resultado[resultado.length - 1]
      if (!ultimo || ultimo.etapa !== etapa) {
        resultado.push({ clave: `${indice}-${etapa}`, etapa, tareas: [] })
      }
      resultado[resultado.length - 1].tareas.push({ fila, indice })
    })
    return resultado
  }, [filas])

  const maxSemana = useMemo(() => Math.max(
    1,
    ...filas.flatMap(f => [f.semanaInicio ?? 0, f.semanaFin ?? 0])
      .filter(n => Number.isFinite(n) && n > 0)
  ), [filas])
  const meses = Math.ceil(maxSemana / 4)
  const anchoTarea = 330
  const anchoSemana = 32
  const minimo = anchoTarea + maxSemana * anchoSemana
  const plantilla = `repeat(${maxSemana}, minmax(${anchoSemana}px, 1fr))`

  if (filas.length === 0) {
    return <section className={`${PANEL} overflow-hidden`}>
      <CabeceraPanel icono={<CalendarDays size={19}/>} titulo="Planificación" descripcion="Cronograma del presupuesto importado" />
      <p className="px-4 py-8 text-center text-xs text-[#9aa2b8]">Este presupuesto no contiene tareas de planificación.</p>
    </section>
  }

  return (
    <section className={`${PANEL} min-w-0 overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <CalendarDays size={18} className="shrink-0 text-violet-300" />
          <div>
            <h3 className="text-[13px] font-semibold text-[#e8e9f3]">Planificación</h3>
            <p className="text-[10px] text-[#9ba5bc]">Cronograma del presupuesto · semanas relativas</p>
          </div>
        </div>
        <span className="text-[11px] text-[#aab2c4]">{filas.length} tareas</span>
      </div>

      <div className="min-w-0 overflow-x-auto [scrollbar-width:thin]">
        <div className="w-full" style={{ minWidth: minimo }}>
          <div className="flex border-b border-border bg-[#18181f] text-[10px] text-[#abb3c7]">
            <div className="sticky left-0 z-20 flex shrink-0 items-end border-r border-border bg-[#18181f] px-4 pb-2 font-medium" style={{ width: anchoTarea }}>
              Actividad
            </div>
            <div className="min-w-0 flex-1">
              <div className="grid border-b border-border/50 text-violet-300" style={{ gridTemplateColumns: plantilla }}>
                {Array.from({ length: meses }, (_, mes) => (
                  <div key={mes} className="py-1.5 text-center font-medium"
                    style={{ gridColumn: `${mes * 4 + 1} / span ${Math.min(4, maxSemana - mes * 4)}` }}>
                    Mes {mes + 1}
                  </div>
                ))}
              </div>
              <div className="grid" style={{ gridTemplateColumns: plantilla }}>
                {Array.from({ length: maxSemana }, (_, semana) => (
                  <div key={semana} className={`py-1.5 text-center ${semana % 4 === 3 ? 'border-r border-border/50' : ''}`}>
                    {semana + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {grupos.map(grupo => (
            <div key={grupo.clave}>
              <div className="border-b border-violet-500/10 bg-violet-500/[0.07] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                {grupo.etapa}
              </div>
              {grupo.tareas.map(({ fila, indice }) => {
                const inicio = fila.semanaInicio ?? fila.semanaFin
                const fin = fila.semanaFin ?? fila.semanaInicio
                const valido = inicio != null && fin != null && Number.isFinite(inicio) && Number.isFinite(fin) && inicio >= 1 && fin >= inicio
                const desde = valido ? Math.floor(inicio) : 1
                const hasta = valido ? Math.min(maxSemana, Math.floor(fin)) : desde
                return (
                  <div key={indice} className="flex min-h-10 border-b border-border/40 last:border-b-0 hover:bg-white/[0.025]">
                    <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-border bg-card px-4 py-2"
                      style={{ width: anchoTarea }}>
                      <span className="min-w-0 flex-1 text-[11px] leading-snug text-[#e0e4ef]" title={fila.subetapa}>
                        {fila.subetapa}
                      </span>
                      {fila.horas > 0 && <span className="shrink-0 text-[10px] tabular-nums text-[#8995ac]" title="Horas planificadas">{horas(fila.horas)}</span>}
                    </div>
                    <div className="relative grid min-w-0 flex-1 items-center" style={{ gridTemplateColumns: plantilla }}>
                      {Array.from({ length: maxSemana }, (_, semana) => (
                        <span key={semana} className={`h-full ${semana % 4 === 3 ? 'border-r border-border/40' : ''}`} />
                      ))}
                      {valido && <span className="z-[1] mx-0.5 h-3 rounded-full bg-violet-500/80"
                        style={{ gridColumn: `${desde} / span ${hasta - desde + 1}`, gridRow: 1 }}
                        title={`${fila.subetapa} · semana ${desde}${hasta !== desde ? ` a ${hasta}` : ''}${fila.horas > 0 ? ` · ${horas(fila.horas)} planificadas` : ''}`} />}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="border-t border-border/60 px-4 py-2.5 text-[10px] text-[#98a2b7]">
        Las semanas corresponden al Excel, no a fechas del calendario.
      </p>
    </section>
  )
}

function PanelDesviaciones({ datos }: { datos: Gestion }) {

  if (datos.desviaciones.length === 0) {

    return (

      <section className={PANEL}>

        <CabeceraPanel icono={<AlertTriangle size={19} className="text-rose-400" />} titulo="Desviaciones y alertas" descripcion="Excesos reales por persona" />

        <div className="px-4 py-8 text-center">

          <CheckCircle2 size={20} className="mx-auto mb-1.5 text-emerald-500" />

          <p className="text-xs text-[#9aa2b8]">

            {datos.indicadores.horasRegistradas === 0

              ? 'Todavía no hay horas registradas que comparar con las asignadas.'

              : 'Sin desviaciones de horas registradas.'}

          </p>

        </div>

      </section>

    )

  }

  return (

    <section className={PANEL}>

      <CabeceraPanel icono={<AlertTriangle size={19} className="text-rose-400" />} titulo="Desviaciones y alertas" descripcion="Excesos reales por persona" />

      <div className="grid gap-2 p-3 sm:grid-cols-2">

        {datos.desviaciones.map((d) => (

          <div key={d.usuarioId ?? d.nombre} className="flex items-start gap-3 rounded-xl border border-border bg-secondary p-3">

            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300"><AlertTriangle size={18} /></span>

            <div className="min-w-0 flex-1">

              <p className="text-xs font-semibold text-[#e8e8f2]">{d.nombre}</p>

              <p className="mt-1 text-[11px] text-[#a5aec2]">{d.detalle}</p>

              <p className="mt-2 text-xs font-semibold text-[#e5b8c7]">+{horas(d.desviacion)} · {Math.round(d.porcentaje)}%</p>

            </div>

          </div>

        ))}

      </div>

    </section>

  )

}
