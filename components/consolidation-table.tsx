'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Clock, TrendingUp, Wallet } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { StatusBadge } from './status-badge'
import { SelectorDivision } from './selector-division'
import { FacturableBadge } from './facturable-badge'
import { useHistorialRango } from '@/lib/use-historial-rango'
import { useAreas } from '@/lib/areas-context'
import { opcionesApi } from '@/lib/api-cliente'
import type { Actividad } from '@/lib/types'
import styles from './consolidacion.module.css'
import { esFacturable, esNoFacturable, fechaLocalISO, formatoHoras, nombreCorto } from '@/lib/utils'

type FiltroFactura = 'todas' | 'facturadas' | 'no_facturadas'

const REGISTROS_POR_PAGINA = 10

interface GrupoUsuario {
  key: string
  usuarioId: number
  nombre: string
  totalHoras: number
}

/** Totales por persona que devuelve /api/consolidacion (una fila por usuario). */
interface ResumenUsuario {
  usuario_id: number
  usuario_nombre: string
  cargo: string | null
  registros: number
  total_segundos: number
  facturadas_segundos: number
  no_facturadas_segundos: number
  por_definir_segundos: number
}

function esFacturada(r: Actividad): boolean {
  return r.estado === 'APROBADA' && esFacturable(r.facturable)
}

function esNoFacturada(r: Actividad): boolean {
  return r.estado === 'RECHAZADA' || (r.estado === 'APROBADA' && esNoFacturable(r.facturable))
}

/** Pasa de MAYÚSCULAS a "Julia Alayo", respetando tildes. */
function Titulo(valor: string): string {
  const minusculas = valor.toLocaleLowerCase('es-PE')
  return minusculas.charAt(0).toLocaleUpperCase('es-PE') + minusculas.slice(1)
}

export function ConsolidationTable() {
  const { areas } = useAreas()
  const { usuario, usuarios, empresaActiva } = useAuth()
  const jefeDeArea = usuario?.rol === 'jefe_area'
  const areaInicial = jefeDeArea && usuario?.area_id != null ? String(usuario.area_id) : ''
  const [areaId, setAreaId] = useState(areaInicial)
  const [desde, setDesde] = useState(() => `${new Date().getFullYear()}-01-01`)
  const [hasta, setHasta] = useState(() => fechaLocalISO(new Date()))

  // La division no se elige sola para admin/socio. Antes la pantalla pedia
  // igualmente TODAS las filas de la empresa al montar, aunque el aviso de
  // abajo dijera "Selecciona una division": era la causa de que entrar a
  // Consolidacion tardara decenas de segundos.
  const resumenQuery = useQuery({
    queryKey: ['consolidacion', empresaActiva?.id, usuario?.id, areaId, desde, hasta],
    enabled: areaId !== '' && Boolean(desde) && Boolean(hasta),
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ area_id: areaId, desde, hasta })
      const res = await fetch(`/api/consolidacion?${params.toString()}`, opcionesApi({ signal }))
      if (!res.ok) throw new Error('No se pudo cargar la consolidación.')
      return (await res.json()) as ResumenUsuario[]
    },
  })

  const resumenPorUsuario = useMemo(() => resumenQuery.data ?? [], [resumenQuery.data])
  const [filtro, setFiltro] = useState<FiltroFactura>('todas')
  const [usuarioSeleccionadoId, setUsuarioSeleccionadoId] = useState<number | null>(null)

  // El detalle se pide SOLO de la persona elegida. Antes se bajaban todas las
  // filas de la division para agruparlas en el navegador y mostrar 10.
  const {
    registros: registrosRango,
    completo: rangoCompleto,
    cargando: cargandoRegistros,
  } = useHistorialRango(desde, hasta, {
    usuarioId: usuarioSeleccionadoId,
    habilitado: usuarioSeleccionadoId != null,
  })

  const gruposPorUsuario = useMemo(
    () =>
      resumenPorUsuario.map((fila) => ({
        key: String(fila.usuario_id),
        usuarioId: fila.usuario_id,
        nombre: fila.usuario_nombre,
        totalHoras: fila.total_segundos / 3600,
      })),
    [resumenPorUsuario],
  )

  useEffect(() => {
    if (gruposPorUsuario.length === 0) {
      if (usuarioSeleccionadoId != null) setUsuarioSeleccionadoId(null)
      return
    }
    if (usuarioSeleccionadoId == null || !gruposPorUsuario.some((g) => g.usuarioId === usuarioSeleccionadoId)) {
      setUsuarioSeleccionadoId(gruposPorUsuario[0].usuarioId)
    }
  }, [gruposPorUsuario, usuarioSeleccionadoId])

  const [pagina, setPagina] = useState(1)

  const grupoActual =
    gruposPorUsuario.find((g) => g.usuarioId === usuarioSeleccionadoId) ?? gruposPorUsuario[0]

  const registros = registrosRango

  const filtradas = useMemo(() => {
    if (filtro === 'facturadas') return registros.filter((r) => esFacturada(r))
    if (filtro === 'no_facturadas') return registros.filter((r) => esNoFacturada(r))
    return registros
  }, [registros, filtro])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / REGISTROS_POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const inicioPagina = (paginaActual - 1) * REGISTROS_POR_PAGINA
  const filtradasPagina = filtradas.slice(inicioPagina, inicioPagina + REGISTROS_POR_PAGINA)

  useEffect(() => {
    setPagina(1)
  }, [areaId, desde, hasta, filtro, usuarioSeleccionadoId])

  const resumen = useMemo(() => {
    let total = 0
    let facturadas = 0
    let noFacturadas = 0
    let porDefinir = 0
    for (const fila of resumenPorUsuario) {
      total += fila.total_segundos
      facturadas += fila.facturadas_segundos
      noFacturadas += fila.no_facturadas_segundos
      porDefinir += fila.por_definir_segundos
    }
    return {
      total: total / 3600,
      facturadas: facturadas / 3600,
      noFacturadas: noFacturadas / 3600,
      porDefinir: porDefinir / 3600,
    }
  }, [resumenPorUsuario])

  const indicadores = [
    { etiqueta: 'Total de horas', valor: formatoHoras(resumen.total), icono: Clock, color: 'text-foreground' },
    { etiqueta: 'Horas facturadas', valor: formatoHoras(resumen.facturadas), icono: TrendingUp, color: 'text-emerald-400' },
    { etiqueta: 'Horas no facturadas', valor: formatoHoras(resumen.noFacturadas), icono: Wallet, color: 'text-foreground' },
    { etiqueta: 'Por definir', valor: formatoHoras(resumen.porDefinir), icono: CalendarDays, color: styles.undefinedValue },
  ]

  /**
   * El boton de cada colaborador muestra "Julia Alayo", no
   * "ALAYO BERECHE JULIA MERCEDES".
   *
   * El orden de las palabras en `usuario_nombre` NO es uniforme en la base de
   * datos: hay "ALAYO BERECHE JULIA MERCEDES" (apellidos primero) y
   * "BONIFACIO CAMPOS ALEJANDRO" (apellidos en medio). Cualquier regla que mire
   * solo la posicion de las palabras acierta en un caso y falla en el otro.
   *
   * Por eso el nombre de pila se saca del CORREO, que si sigue el patron
   * `nombre.apellido@paredescano.com` en todos los casos utilizables. Si el
   * correo no sirve (genericos como `sistemas@`, o alias como `trainee.soporte@`)
   * se recurre a la regla por posicion, que es una aproximacion, y se conserva
   * el nombre completo en el `title` del boton para no perder nada.
   */
  const nombreLegible = (nombreCompleto: string): string => {
    const persona = usuarios.find((u) => u.nombre === nombreCompleto)
    return Titulo(nombreCorto(nombreCompleto, persona?.correo))
  }

  const opciones: { valor: FiltroFactura; etiqueta: string }[] = [
    { valor: 'todas', etiqueta: 'Todas' },
    { valor: 'facturadas', etiqueta: 'Facturadas' },
    { valor: 'no_facturadas', etiqueta: 'No facturadas' },
  ]

  return (
    <div className={styles.view}>
      {areaId !== '' && resumenQuery.isPending && (
        <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Cargando consolidación…
        </p>
      )}
      {areaId !== '' && resumenQuery.isError && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          No se pudo cargar la consolidación. Intenta de nuevo.
        </p>
      )}
      {/* Si el periodo tiene mas registros de los que se pueden traer, los
          totales de abajo NO son los reales. Se dice, en vez de dejar que una
          cifra incompleta parezca la definitiva. */}
      {!rangoCompleto && usuarioSeleccionadoId != null && (
        <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Este periodo tiene demasiados registros para resumirlos aquí. Acota las
          fechas para ver el total completo.
        </p>
      )}
      {resumenQuery.data && <section className={styles.metrics} aria-label="Indicadores de consolidación">
        {indicadores.map(({ etiqueta, valor, icono: Icono, color }) => (
          <article key={etiqueta} className={styles.metric}>
            <span className={styles.metricIcon}><Icono size={24} /></span>
            <div><h2>{etiqueta}</h2><p className={color}>{valor}</p></div>
          </article>
        ))}
      </section>}

      {!jefeDeArea && (
        <div className={styles.division}>
          <label htmlFor="division-consolidacion"><Building2 size={16} aria-hidden="true" />División</label>
          <SelectorDivision id="division-consolidacion" areas={areas} areaId={areaId} onChange={(id) => {
            setUsuarioSeleccionadoId(null)
            setAreaId(id)
          }} />
        </div>
      )}
      {areaId === '' ? (
        <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          {jefeDeArea ? 'No hay una división asignada para consultar.' : 'Selecciona una división para ver la consolidación por persona.'}
        </p>
       ) : (<>
      <div className={styles.people} role="group" aria-label="Colaboradores">
        {gruposPorUsuario.map((grupo) => (
          <button key={grupo.key} type="button" onClick={() => setUsuarioSeleccionadoId(grupo.usuarioId)}
            title={grupo.nombre} aria-pressed={grupo.key === grupoActual?.key} className={styles.person}>
            <strong>{nombreLegible(grupo.nombre)}</strong>
            <span>{formatoHoras(grupo.totalHoras)}</span>
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs} role="group" aria-label="Filtrar facturación">
          {opciones.map((opcion) => (
            <button key={opcion.valor} type="button" onClick={() => setFiltro(opcion.valor)}
              aria-pressed={filtro === opcion.valor}>
              {opcion.etiqueta}
            </button>
          ))}
        </div>
        <div className={styles.dateRange}>
          <label><CalendarDays size={16} aria-hidden="true" />Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={styles.control} />
          </label>
          <label>Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={styles.control} />
          </label>
        </div>
      </div>

      <section className={styles.panel} aria-label="Registros consolidados">
        <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {['Actividad', 'Usuario', 'Duración', 'Estado', 'Facturación', 'Fecha'].map((encabezado) => (
                <th key={encabezado} scope="col">{encabezado}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargandoRegistros && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Cargando registros…
                </td>
              </tr>
            )}
            {!cargandoRegistros && filtradasPagina.map((actividad) => (
              <tr
                key={actividad.id}
                className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  {/* La columna se llama "Actividad" y mostraba `descripcion`,
                      que es el texto libre que escribe cada persona ("revisar el
                      Excel", "llamada con el cliente"). Al consolidar, lo que
                      interesa es QUÉ tipo de actividad se contabilizó, porque es
                      lo comparable entre personas y meses. La descripción sigue
                      visible debajo, en pequeño, para no perder el detalle. */}
                  <p className="font-medium text-foreground">
                    {actividad.tipo_actividad_nombre ?? 'Sin tipo'}
                  </p>
                  {actividad.descripcion && (
                    // `max-w` es necesario: en una tabla `w-full` sin anchos fijos
                    // el truncate no hace nada y el texto parte la fila.
                    <p
                      className={styles.description}
                      title={actividad.descripcion}
                    >
                      {actividad.descripcion}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{actividad.usuario_nombre ?? '—'}</td>
                <td className="font-semibold tabular-nums text-foreground">{formatDuracion(actividad)}</td>
                <td className="px-3 py-2">
                  <StatusBadge estado={actividad.estado} />
                </td>
                <td className="px-3 py-2">
                  <FacturableBadge valor={actividad.facturable} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{fechaLocalISO(actividad.inicio)}</td>
              </tr>
            ))}
            {!cargandoRegistros && filtradas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No hay registros en esta categoría.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        {filtradas.length > REGISTROS_POR_PAGINA && (
          <div className={styles.pagination}>
            <span>Mostrando {inicioPagina + 1}-{Math.min(inicioPagina + REGISTROS_POR_PAGINA, filtradas.length)} de {filtradas.length}</span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setPagina(paginaActual - 1)} disabled={paginaActual === 1} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" aria-label="Página anterior">
                <ChevronLeft size={12} />
                Anterior
              </button>
              <span className="px-1 tabular-nums">{paginaActual} / {totalPaginas}</span>
              <button type="button" onClick={() => setPagina(paginaActual + 1)} disabled={paginaActual === totalPaginas} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" aria-label="Página siguiente">
                Siguiente
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </section>
      </>)}
    </div>
  )
}


function formatDuracion(r: Actividad): string {
  if (!r.fin || !r.inicio) return '—'
  const totalSeg = Math.max(0, (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 1000 - (r.pausa_acumulada_segundos || 0))
  const h = Math.floor(totalSeg / 3600)
  const m = Math.floor((totalSeg % 3600) / 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}
