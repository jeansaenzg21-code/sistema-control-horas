'use client'

// Panel del jefe de área.
//
// Todo lo que se ve sale de cuatro llamadas agrupadas (lib/use-dashboard-jefe.ts)
// que ya vienen acotadas al área por el SERVIDOR. Aquí no hay ni un solo id de
// área que enviar: el filtro que se puede tocar son las fechas, y ni el nombre de
// la división ni sus cifras cambian de ámbito.
//
// La cartera NO se recalcula: se reutilizan tal cual los números que devuelve
// /api/clientes/cartera, que es la misma fuente que usa la pantalla /clientes.
// Rehacer aquí el cálculo de contratadas, consumidas, saldo y exceso significaría
// dos verdades para el mismo número, y basta que una cambie para que el panel y
// la cartera se contradigan.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ArrowRight, Building2, CalendarCheck, CheckCircle2, Clock,
  FileSpreadsheet, Hourglass, UsersRound, Wallet,
} from 'lucide-react'

import { MainLayout } from '@/components/main-layout'
import { DateRangeFilter } from '@/components/date-range-filter'
import {
  Avatar, CabeceraPanel, colorDeCliente, Estado, horas, inicialesDe,
  Kpi, PANEL, porcentaje,
} from '@/components/cartera-ui'
import { useAuth } from '@/lib/auth-context'
import { useAreas } from '@/lib/areas-context'
import { obtenerEstiloEstado } from '@/lib/estado'
import type { EstadoActividad } from '@/lib/types'
import { rangoDelMes, useDatosJefeArea } from '@/lib/use-dashboard-jefe'
import { useResumenActividades } from '@/lib/use-resumen'
import { cn, fechaLocalISO, formatoHoras, nombreCorto } from '@/lib/utils'

/**
 * Los estados que muestra el donut, con el color que ya usa el resto del
 * sistema para cada uno (`lib/estado.ts`).
 *
 * El color aquí no es decorativo: es el mismo del badge que aparece en la tabla
 * de actividad reciente, así que "el rojo" significa lo mismo en los dos sitios.
 * Con la paleta morada del gráfico, cuatro estados de cuatro tonos parecidos
 * obligaban a leer la leyenda para saber qué era qué.
 */
const ESTADOS_DONUT = [
  { estado: 'APROBADA', etiqueta: 'Aprobados', color: '#34d399' },
  { estado: 'PENDIENTE_APROBACION', etiqueta: 'Pendientes', color: '#fbbf24' },
  { estado: 'CORRECCION_SOLICITADA', etiqueta: 'Observados', color: '#38bdf8' },
  { estado: 'RECHAZADA', etiqueta: 'Rechazados', color: '#fb7185' },
] as const

/**
 * Un estado que todavía no tiene ningún registro se apaga a un morado claro.
 *
 * Un rojo o un ámbar junto a un "0" se lee como "hay algo pendiente", que es
 * justo lo contrario de lo que significa. En cero, el arco no compite con los
 * que sí tienen datos: el color de verdad vuelve en cuanto aparece el primero.
 */
const COLOR_ESTADO_EN_CERO = '#a78bfa'

function colorDeEstado(estado: string, valor: number): string {
  if (valor > 0) return ESTADOS_DONUT.find((e) => e.estado === estado)?.color ?? COLOR_ESTADO_EN_CERO
  return COLOR_ESTADO_EN_CERO
}

const MAX_COLABORADORES = 10

export function DashboardJefeArea() {
  const { usuario, usuarios, cargarUsuarios } = useAuth()
  const { areas } = useAreas()
  const [rango, setRango] = useState(rangoDelMes)
  const datos = useDatosJefeArea(rango)

  const areaNombre = areas.find((a) => a.id === usuario?.area_id)?.nombre ?? 'Tu división'

  // El correo es lo que permite distinguir el nombre de pila de los apellidos:
  // la empresa usa el patrón `nombre.apellido@paredescano.com`. El endpoint de
  // usuarios lo trae, y para el jefe ya viene acotado a su área. Se reutiliza el
  // estado global en vez de pedirlo otra vez, así que si otro módulo del panel
  // ya lo cargó no hay una segunda petición.
  useEffect(() => {
    if (usuarios.length === 0) void cargarUsuarios()
  }, [usuarios.length, cargarUsuarios])
  const correoPorId = useMemo(
    () => new Map(usuarios.map((u) => [u.id, u.correo])),
    [usuarios],
  )

  // Todo lo derivado se calcula aquí, una vez, y se reparte a los bloques.
  const modelo = useMemo(() => construirModelo(datos, rango, correoPorId), [datos, rango, correoPorId])

  return (
    <MainLayout
      title="Panel de Jefatura de Área"
      subtitle="Seguimiento del equipo, cumplimiento, aprobaciones y cartera de clientes"
      ancho="ancho"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Building2 size={15} className="shrink-0 text-violet-300" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Especialidad / Área
              </p>
              <p className="text-sm font-semibold text-foreground">{areaNombre}</p>
            </div>
          </div>
          <DateRangeFilter
            desde={rango.desde}
            hasta={rango.hasta}
            onChange={(desde, hasta) => setRango({ desde, hasta })}
          />
        </div>

        <FilaKpis modelo={modelo} />

        {/* Fila 1: equipo y cartera, que son las dos tablas largas del panel, a media
            anchura cada una. Juntas miden casi lo mismo (8 personas y 8 clientes)
            y asi comparten fila sin que una le quede un hueco del tamano de la otra.

            Antes el equipo estaba debajo de una fila de tres bloques cortos. Como
            mide mas que cualquiera de ellos, terminaba arrastrando el alto de su
            fila y dejando huecos en los otros dos. A media columna el problema
            desaparece: el alto lo marca la mas alta de las dos y son del mismo
            orden de magnitud.

            SIN items-start: con el cada card mide lo suyo y queda un rectangulo
            vacio debajo de la mas baja.

El contenido de cada panel NO lleva `flex-1`. Estirar la card está
            bien; estirar su contenido no. Si las filas se reparten el alto
            sobrante, quedan separadas por huecos que se leen como si faltara
            información. */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <PanelEquipo modelo={modelo} />
          <PanelCartera modelo={modelo} />
        </div>

        {/* Fila 2: Estado de los registros arriba a la izquierda, Alertas debajo,
            y Actividad reciente a la derecha ocupando ambas filas. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="flex flex-col gap-3">
            <PanelEstados modelo={modelo} />
            <PanelAlertas modelo={modelo} />
          </div>
          <div className="lg:col-span-2">
            <ActividadReciente modelo={modelo} />
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

// --- modelo ----------------------------------------------------------------

type Modelo = ReturnType<typeof construirModelo>

function construirModelo(
  datos: ReturnType<typeof useDatosJefeArea>,
  rango: { desde: string; hasta: string },
  correoPorId: Map<number, string>,
) {
  const resumen = datos.resumen
  const anterior = datos.resumenAnterior
  const cumplimiento = datos.cumplimiento
  // Distinto nombre a propósito: `cartera` es la LISTA de clientes, no la
  // respuesta completa. Antes se llamaban igual y eso obligaba a repetir
  // `datos.cartera?.clientes ?? []` en cada acceso.
  const carteraRespuesta = datos.cartera

  const porEstado = new Map((resumen?.por_estado ?? []).map((e) => [e.estado, e]))

  // Comparación contra el rango anterior de la MISMA duración. Solo se pinta si
  // el rango previo trae datos: si no, un -100 % sería inventado.
  const horasActual = resumen?.totales.horas ?? 0
  const horasPrevias = anterior?.totales.horas ?? 0
  const variacion =
    horasPrevias > 0 ? Math.round(((horasActual - horasPrevias) / horasPrevias) * 1000) / 10 : null

  // Todos los estados, también los que valen 0: el donut se pinta entero siempre
  // y la leyenda enseña los cuatro, para que se vea qué está en cero.
  const estadosPorEstado: Record<string, number> = {}
  for (const e of resumen?.por_estado ?? []) estadosPorEstado[e.estado] = e.registros

  // Colaboradores con horas en el rango. Viene acotado al área por el servidor.
  const colaboradores = (resumen?.por_usuario ?? []).map((u) => ({
    id: u.usuario_id,
    nombre: u.nombre,
    correo: correoPorId.get(u.usuario_id) ?? null,
    cargo: u.cargo,
    horas: u.horas,
    registros: u.registros,
    // El cumplimiento mensual se cruza por usuario. `resumen.por_usuario` solo
    // trae los que registre horas en el rango; los del cumplimiento que no
    // aparecen aquí se añaden al final con 0 horas, para que un jefe vea también
    // a quien no ha registrado nada.
    cumplimiento:
      cumplimiento?.colaboradores.find((c) => c.id === u.usuario_id) ?? null,
  }))
  const cumplimientoDe = new Map((cumplimiento?.colaboradores ?? []).map((c) => [c.id, c]))
  for (const c of cumplimiento?.colaboradores ?? []) {
    if (!colaboradores.some((x) => x.id === c.id)) {
      colaboradores.push({
        id: c.id,
        nombre: c.nombre,
        correo: correoPorId.get(c.id) ?? null,
        cargo: c.cargo,
        horas: 0,
        registros: 0,
        cumplimiento: c,
      })
    }
  }
  colaboradores.sort((a, b) => b.horas - a.horas)

  const estadoHoy = (id: number) => cumplimientoDe.get(id)?.dias.at(-1)?.estado ?? null
  const sinRegistrarHoy = colaboradores.filter(
    (c) => c.cumplimiento && estadoHoy(c.id) === 'pendiente',
  ).length

  // El resumen de cartera sale de la MISMA fuente que la pantalla /clientes:
  // /api/clientes/cartera. Ahí vienen las cifras que importan y con la
  // aritmética que ya usa esa pantalla:
  //   - horasContratadas: bolsa activa, o sea lo COMPROMETIDO.
  //   - horasPropuestas:  bolsa declarada y todavía sin activar, o sea lo que
  //     se firmará en cuanto se apruebe el presupuesto.
  //   - horasConsumidas:  lo ya imputado contra una bolsa activa.
  //   - horasDisponibles: lo que queda de la bolsa.
  // No se recalcula nada aquí, ni se mezcla con las horas registradas del
  // resumen (que cuentan también lo que no está imputado a ninguna bolsa).
  //
  // El anillo exterior usa la bolsa activa y, si el cliente no tiene ninguna, la
  // propuesta. Sin ese margen, un cliente cuyo presupuesto sigue en revisión
  // desaparece del gráfico y el panel parece vacío cuando lo que hay es un
  // trabajo de aprobación pendiente, que es justo lo que el jefe tiene que ver.
  // Cartera del área, ORDENADA POR RIESGO DE DESVIACIÓN y no por tamaño ni por
  // orden de alta. La tarjeta es un resumen: no crece con cada cliente nuevo y
  // siempre deja arriba a los que están más cerca de pasarse de la bolsa.
  //
  // El orden es:
  //   1. los que ya se pasaron (mayor % de exceso primero),
  //   2. los que gastan sin bolsa declarada (trabajo que no se factura),
  //   3. los que tienen bolsa y ya consumieron parte (mayor % consumido primero),
  //   4. los que tienen bolsa sin tocar (dinero comprometido sin usar).
  // Dentro de cada grupo manda el porcentaje, no la cifra absoluta: 40 h de 50
  // (80 %) es más urgente que 100 h de 400 (25 %), aunque la segunda cifra sea
  // mayor.
  const cartera = carteraRespuesta?.clientes ?? []
  const grupoRiesgo = (c: (typeof cartera)[number]): number => {
    if (c.horasExcedidas > 0) return 3
    if (c.horasContratadas === 0 && c.horasConsumidas > 0) return 2
    if (c.horasContratadas > 0 && c.horasConsumidas > 0) return 1
    return 0
  }
  const porcentajeConsumido = (c: (typeof cartera)[number]): number =>
    c.horasContratadas > 0 ? (c.horasConsumidas / c.horasContratadas) * 100 : 0
  const carteraOrdenada = [...cartera].sort((a, b) => {
    const ga = grupoRiesgo(a)
    const gb = grupoRiesgo(b)
    if (ga !== gb) return gb - ga
    if (ga === 3) {
      const pa = a.desviacionPorcentaje ?? porcentajeConsumido(a)
      const pb = b.desviacionPorcentaje ?? porcentajeConsumido(b)
      if (pb !== pa) return pb - pa
      return b.horasExcedidas - a.horasExcedidas
    }
    if (ga === 2) return b.horasConsumidas - a.horasConsumidas
    if (ga === 1) {
      const pa = porcentajeConsumido(a)
      const pb = porcentajeConsumido(b)
      if (pb !== pa) return pb - pa
      return b.horasConsumidas - a.horasConsumidas
    }
    return b.horasContratadas - a.horasContratadas
  })

  const pendientesAprobacion = porEstado.get('PENDIENTE_APROBACION')?.registros ?? 0
  const observados = porEstado.get('CORRECCION_SOLICITADA')?.registros ?? 0

  const conExceso = cartera.filter((c) => c.horasExcedidas > 0)
  const presupuestoPendiente = cartera.filter((c) => c.estado === 'PENDIENTE')
  // Trabajo yaperformed pero sin bolsa detrás: no se factura. Es un agujero
  // distinto del exceso y no aparece en ninguna otra cifra del panel.
  const sinBolsa = cartera.filter((c) => c.horasContratadas === 0 && c.horasConsumidas > 0)
  const bolsaSinUsar = cartera.filter((c) => c.horasContratadas > 0 && c.horasConsumidas === 0)
  const sinRegistroHoyIds = new Set(
    colaboradores.filter((c) => c.cumplimiento && estadoHoy(c.id) === 'pendiente').map((c) => c.id),
  )

  return {
    cargando: datos.cargando,
    rango,
    resumen,
    resumenAnterior: anterior,
    cumplimiento,
    carteraRespuesta,
    // El correo se adjunta a las actividades por `usuario_id` para poder
    // recortar el nombre igual que en el resto del panel.
    recientes: datos.recientes.slice(0, 8).map((a) => ({
      ...a,
      correo: correoPorId.get(a.usuario_id) ?? null,
    })),
    horas: { actual: horasActual, previas: horasPrevias, variacion },
    registros: resumen?.totales.registros ?? 0,
    estadosPorEstado,
    estados: { pendientesAprobacion, observados },
    colaboradores,
    /** Cartera completa ordenada por riesgo de desviación. */
    carteraOrdenada,
    totalesClientesCartera: cartera.length,
    totalesCartera: datos.cartera?.totales ?? null,
    alertas: [
      // El orden es por gravedad, no por módulo: rojo primero, ámbar después,
      // violeta al final. Con muchas alertas en pantalla, la que está más abajo
      // es la que nadie va a leer.
      { etiqueta: 'Clientes que se pasaron de la bolsa', valor: conExceso.length, tono: 'rojo' as const, enlace: '/clientes' },
      { etiqueta: 'Clientes gastando sin bolsa', valor: sinBolsa.length, tono: 'rojo' as const, enlace: '/clientes' },
      { etiqueta: 'Sin registrar hoy', valor: sinRegistrarHoy, tono: 'ambar' as const, enlace: null },
      { etiqueta: 'Registros con observaciones', valor: observados, tono: 'ambar' as const, enlace: '/aprobaciones' },
      { etiqueta: 'Presupuesto sin aprobar', valor: presupuestoPendiente.length, tono: 'ambar' as const, enlace: '/clientes' },
      { etiqueta: 'Bolsa firmada sin usar', valor: bolsaSinUsar.length, tono: 'violeta' as const, enlace: '/clientes' },
      { etiqueta: 'Aprobaciones pendientes', valor: pendientesAprobacion, tono: 'violeta' as const, enlace: '/aprobaciones' },
    ].filter((a) => a.valor > 0),
    sinRegistroHoyIds,
  }
}

// --- fila 1: KPIs ----------------------------------------------------------

function FilaKpis({ modelo }: { modelo: Modelo }) {
  const m = modelo
  const totalCumplimiento = m.cumplimiento?.resumen.cobertura ?? null
  const disponibles = m.totalesCartera?.disponibles ?? null

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
      <Kpi
        icono={<Clock size={20} />}
        etiqueta="Horas registradas"
        valor={horas(m.horas.actual)}
        tono="azul"
        nota={
          m.horas.variacion === null
            ? `${m.registros} registros en el rango`
            : `${m.horas.variacion > 0 ? '+' : ''}${m.horas.variacion} % vs. rango anterior`
        }
      />
      <Kpi
        icono={<Hourglass size={20} />}
        etiqueta="Pendientes de aprobación"
        valor={String(m.estados.pendientesAprobacion)}
        tono={m.estados.pendientesAprobacion > 0 ? 'ambar' : 'verde'}
        nota={m.estados.pendientesAprobacion > 0 ? 'Esperando tu revisión' : 'Nada en la cola'}
      />
      <Kpi
        icono={<CalendarCheck size={20} />}
        etiqueta="Cumplimiento del área"
        valor={totalCumplimiento === null ? '—' : porcentaje(totalCumplimiento)}
        tono={totalCumplimiento === null ? 'violeta' : totalCumplimiento >= 90 ? 'verde' : 'ambar'}
        nota={
          m.cumplimiento
            ? `${m.cumplimiento.resumen.cumplen} de ${m.cumplimiento.resumen.colaboradores} cumplen`
            : 'Sin datos del mes en curso'
        }
      />
      <Kpi
        icono={<Building2 size={20} />}
        etiqueta="Clientes activos"
        valor={String(m.totalesCartera?.clientes ?? 0)}
        tono="violeta"
        nota={`${m.carteraRespuesta?.clientes.filter((c) => c.estado === 'EN_RIESGO').length ?? 0} en riesgo`}
      />
      <Kpi
        icono={<Wallet size={20} />}
        etiqueta="Bolsa disponible"
        valor={disponibles === null ? '—' : horas(disponibles)}
        tono="verde"
        nota={
          m.totalesCartera
            ? `de ${horas(m.totalesCartera.contratadas)} contratadas`
            : 'Sin bolsas activas'
        }
      />
    </div>
  )
}

// --- analítica --------------------------------------------------------------

/**
 * Estado de los registros, como BARRAS y no como anillo.
 *
 * El anillo de cuatro categorías y su leyenda repetían los mismos cuatro
 * números, y el KPI "Pendientes de aprobación" de la fila de arriba ya da el
 * dato que de verdad obliga a actuar. Con barras horizontales el panel ocupa
 * menos alto y, sobre todo, escala: con cinco estados caben en la misma altura
 * que con dos, mientras que un anillo con muchas categorías adelgaza los trazos
 * hasta volverlos ilegibles.
 *
 * La barra es la misma proporción que daba el anillo, así que no se pierde
 * información: se gana legibilidad y altura.
 */
function PanelEstados({ modelo: _modelo }: { modelo: Modelo }) {
  // Los estados se leen del histórico completo del área, no del rango elegido en el
  // panel. Las aprobaciones tampoco se filtran por fecha, así que con el rango del
  // mes en curso el card se vaciaba de aprobados y contradecía lo que ve el jefe en
  // Aprobaciones. Aquí el alcance por área ya lo pone el propio servidor.
  const { resumen: resumenEstados } = useResumenActividades({})
  const porEstado = new Map((resumenEstados.por_estado ?? []).map((e) => [e.estado, e.registros]))
  const segmentos = ESTADOS_DONUT.map((e) => ({
    clave: e.estado,
    nombre: e.etiqueta,
    valor: porEstado.get(e.estado) ?? 0,
  }))
  const coloresLeyenda = ESTADOS_DONUT.map((e) => e.color)
  const total = segmentos.reduce((t, s) => t + s.valor, 0)
  const detalle = segmentos.map((s) => ({
    nombre: s.nombre,
    valor: s.valor,
    pct: total ? Math.round((s.valor / total) * 100) : 0,
  }))
return (
    <section className={`${PANEL} flex min-w-0 flex-col overflow-hidden`}>
      <CabeceraPanel
        icono={<CheckCircle2 size={19} />}
        titulo="Estado de los registros"
        descripcion={`${total} registros en total`}
      />
      {/* Una fila por estado: color, nombre, número y barra. La barra es del
          ancho de la columna y el renglón mide lo que su contenido, sin repartir
          el alto sobrante de la card. */}
      <ul className="flex flex-col gap-2.5 p-4">
        {detalle.map((d, i) => (
          <li key={d.nombre} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: coloresLeyenda[i] }}
                />
                <span className="truncate text-[11px] text-muted-foreground">{d.nombre}</span>
              </span>
              <span className="shrink-0 text-[11px] tabular-nums">
                <span className="font-semibold text-foreground">{d.valor}</span>
                {/* El separador va dentro del span y NO con margin: el `ml` se
                    come el espacio y "6"+"13 %" salen pegados como "613 %". */}
                <span className="ml-2 text-muted-foreground">{d.pct} %</span>
              </span>
            </div>
            {/* El ancho mínimo del 2 % evita que un estado con pocos registros
                desaparezca: el renglón existe aunque la barra sea casi
                imperceptible. */}
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${d.pct}%`,
                  minWidth: d.valor > 0 ? 2 : 0,
                  backgroundColor: coloresLeyenda[i],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}




// --- cartera y alertas ------------------------------------------------------

/**
 * Resumen del equipo.
 *
 * Ahora incluye también la distribución de horas por persona, que antes vivía en
 * el gráfico de barras "Horas por colaborador". Ese gráfico se quitó porque
 * decía lo mismo que esta tabla (horas por persona) y solo con menos
 * información: no incluía a quien no había registrado nada, que es justo lo que
 * un jefe necesita ver. Aquí todos aparecen, tengan horas o no.
 *
 * Escala con áreas grandes: se listan MAX_COLABORADORES y el resto se cuenta, con
 * `max-h` y scroll para que la tabla no empuje el resto del panel fuera de
 * pantalla. El orden pone arriba a quien peor cumple, no a quien más horas hace:
 * en una división con mucha gente, el primero que hay que mirar es el que se
 * está quedando sin horas o sin registrar.
 */
function PanelEquipo({ modelo }: { modelo: Modelo }) {
  // `flex flex-col`: el grid estira la section al alto de su fila, y este
  // `flex` es lo que deja que la tabla de dentro ocupe ese alto en vez de
  // dejar el fondo vacío debajo de la última fila.
  const colaboradores = [...modelo.colaboradores].sort((a, b) => {
    // Sin cobertura se trata como 101 para que quien no tiene datos quede al
    // final: no es "el que peor cumple", es "el que no sabemos".
    const ca = a.cumplimiento?.cobertura ?? 101
    const cb = b.cumplimiento?.cobertura ?? 101
    if (ca !== cb) return ca - cb
    return b.horas - a.horas
  })
  const visibles = colaboradores.slice(0, MAX_COLABORADORES)
  const resto = colaboradores.slice(MAX_COLABORADORES)
  const horasResto = resto.reduce((t, c) => t + c.horas, 0)

  return (
    <section className={`${PANEL} min-w-0 overflow-hidden`}>
      <CabeceraPanel
        icono={<UsersRound size={19} />}
        titulo="Equipo de la división"
        descripcion="Primero quien peor cumple; incluye a quien no ha registrado"
        accion={
          <Link
            href="/cumplimiento"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Ver equipo completo <ArrowRight size={11} />
          </Link>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left text-[11px]">
          <colgroup>
            <col style={{ width: '38%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Colaborador</th>
              <th className="px-2 py-2.5 text-center font-medium">Horas</th>
              <th className="px-2 py-2.5 text-center font-medium">Cumplimiento</th>
              <th className="px-2 py-2.5 text-center font-medium">Pend.</th>
              <th className="px-2 py-2.5 text-center font-medium">Hoy</th>
            </tr>
          </thead>
          {/* `flex-1` + scroll: la tabla ocupa el alto que le da la fila y, si hay más
              gente de la que cabe, hace scroll dentro. Sin el `flex-1` el fondo
              de la card quedaría vacío debajo de la última fila. */}
          <tbody className="block max-h-[300px] overflow-y-auto sm:table-row-group">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  Sin colaboradores con actividad. Todas las cifras a 0.
                </td>
              </tr>
            )}
            {visibles.map((c) => {
              const sinHoy = modelo.sinRegistroHoyIds.has(c.id)
              const cob = c.cumplimiento
              return (
                <tr key={c.id} className="border-t border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {/* Las iniciales salen del nombre corto a propósito:
                          `inicialesDe` toma las dos primeras palabras, y en
                          "ALAYO BERECHE JULIA MERCEDES" eso son los apellidos.
                          Con "JULIA M." salen "JM", que sí corresponden a la
                          fila de al lado. */}
                      <Avatar iniciales={inicialesDe(nombreCorto(c.nombre, c.correo))} color={colorDeCliente(c.id)} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground" title={c.nombre}>
                          {nombreCorto(c.nombre, c.correo)}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground" title={c.cargo ?? ''}>
                          {c.cargo ?? 'Sin cargo'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center font-semibold tabular-nums text-foreground">
                    {formatoHoras(c.horas)}
                  </td>
                  {/* La barra y el porcentaje van como grupo centrado, no
                      estirados a todo el ancho: así la columna se lee igual
                      que las demás, que sí quedan centradas. */}
                  <td className="px-2 py-2 text-center">
                    {cob ? (
                      <div className="mx-auto flex max-w-[130px] items-center gap-1.5">
                        <div className="h-1.5 min-w-[28px] flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, cob.cobertura)}%`,
                              background: cob.cobertura >= 100 ? '#5ccaac' : cob.cobertura >= 50 ? '#efb64e' : '#fb7185',
                            }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                          {cob.cobertura}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-foreground">
                    {cob ? (
                      <span className={cob.pendientes > 0 ? 'text-amber-300' : 'text-muted-foreground'}>
                        {cob.pendientes}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {sinHoy ? (
                      <span className="inline-block rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                        sin hoy
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {/* Los que no caben se cuentan, no desaparecen. */}
            {resto.length > 0 && (
              <tr className="border-t border-border/60 bg-muted/30">
                <td className="px-3 py-2 text-muted-foreground">{resto.length} personas más</td>
                <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{horas(horasResto)}</td>
                <td colSpan={3} className="px-2 py-2 text-center text-[10px] text-muted-foreground">
                  <Link href="/cumplimiento" className="hover:text-foreground hover:underline">
                    ver el equipo completo
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * Cartera del área: resumen fijo + lista desplazable ordenada por riesgo.
 *
 * La tarjeta ya no crece con cada cliente nuevo. El alto lo marcan el resumen y
 * la lista con scroll propio; agregar clientes solo agrega filas dentro de ese
 * scroll, nunca empuja los KPIs ni las alertas fuera de la pantalla.
 *
 * El orden es por riesgo de desviación, no por tamaño: primero los que ya se
 * pasaron de la bolsa (mayor % de exceso), después los que gastan sin bolsa y,
 * por último, los que más han consumido de su bolsa. Un cliente recién creado
 * sin horas no desplaza a uno que está a punto de agotarse.
 */
function PanelCartera({ modelo }: { modelo: Modelo }) {
  const clientes = modelo.carteraOrdenada
  const excedidos = clientes.filter((c) => c.horasExcedidas > 0).length
  const sinBolsa = clientes.filter(
    (c) => c.horasContratadas === 0 && c.horasConsumidas > 0,
  ).length
  const enRiesgo = excedidos + sinBolsa

  const totales = modelo.totalesCartera
  const contratadas =
    totales?.contratadas ?? clientes.reduce((t, c) => t + c.horasContratadas, 0)
  const consumidas =
    totales?.consumidas ?? clientes.reduce((t, c) => t + c.horasConsumidas, 0)

  return (
    <section className={`${PANEL} flex min-h-[420px] min-w-0 flex-col overflow-hidden`}>
      <CabeceraPanel
        icono={<Wallet size={19} />}
        titulo="Cartera del área"
        descripcion="Resumen fijo y prioridad por riesgo de desviación"
        accion={
          <Link
            href="/clientes"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Ver todos <ArrowRight size={11} />
          </Link>
        }
      />

      {/* Resumen: no depende de cuántos clientes haya, siempre ocupa lo mismo. */}
      <div className="grid shrink-0 grid-cols-4 divide-x divide-border/60 border-b border-border/60">
        <div className="px-3 py-2">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Clientes</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {modelo.totalesClientesCartera}
          </p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Contratadas</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">{horas(contratadas)}</p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Consumidas</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">{horas(consumidas)}</p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">En riesgo</p>
          <p
            className={cn(
              'text-sm font-semibold tabular-nums',
              enRiesgo > 0 ? 'text-rose-300' : 'text-foreground',
            )}
          >
            {enRiesgo}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1.5 pt-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Mayor riesgo de desviación
        </p>
        <p className="text-[10px] text-muted-foreground">
          {excedidos} excedidos · {sinBolsa} sin bolsa
        </p>
      </div>

      {/* Alto de exactamente 4 filas: el resto se alcanza con la barra. */}
      <div className="h-[252px] shrink-0 overflow-y-auto">
        <table className="w-full table-fixed border-collapse text-left text-[11px]">
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-2 py-2 text-center font-medium">Contratadas</th>
              <th className="px-2 py-2 text-center font-medium">Consumidas</th>
              <th className="px-2 py-2 text-center font-medium">Disponibles</th>
              <th className="px-2 py-2 text-center font-medium">Desviación</th>
            </tr>
          </thead>
          <tbody>
            {clientes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  Sin clientes en el área. Todas las cifras a 0.
                </td>
              </tr>
            )}
            {clientes.map((c) => (
              <tr key={c.id} className="border-t border-border/60 hover:bg-muted/40">
                <td className="px-3 py-1.5">
                  <p className="truncate font-medium text-foreground" title={c.nombre}>
                    {c.nombre}
                  </p>
                  <div className="mt-0.5">
                    <Estado valor={c.estado} />
                  </div>
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums text-foreground">
                  {c.horasContratadas > 0 ? horas(c.horasContratadas) : '—'}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums text-foreground">
                  {horas(c.horasConsumidas)}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums">
                  {c.horasDisponibles > 0 ? (
                    <span className="text-emerald-300">{horas(c.horasDisponibles)}</span>
                  ) : c.horasContratadas > 0 ? (
                    <span className="text-muted-foreground">0 h</span>
                  ) : (
                    <span className="text-rose-300" title="Horas consumidas sin bolsa declarada">
                      sin bolsa
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {c.horasExcedidas > 0 ? (
                    <span className="font-semibold tabular-nums text-rose-300">
                      +{horas(c.horasExcedidas)}
                    </span>
                  ) : c.horasContratadas === 0 ? (
                    <span className="text-[10px] text-rose-300">no factura</span>
                  ) : c.desviacionPorcentaje !== null ? (
                    <span className="tabular-nums text-muted-foreground">{c.desviacionPorcentaje} %</span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-1 items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
        <p className="text-[10px] text-muted-foreground">
          {clientes.length > 4
            ? `${clientes.length - 4} clientes más abajo, ordenados por riesgo`
            : 'Cartera completa, ordenada por riesgo'}
        </p>
        <Link
          href="/clientes"
          className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver cartera <ArrowRight size={11} />
        </Link>
      </div>
    </section>
  )
}

function PanelAlertas({ modelo }: { modelo: Modelo }) {
  // El tono va en un punto y en el número, no en una caja con borde alrededor
  // del texto. La caja duplicaba el alto de cada renglón por dentro y por fuera
  // de una tarjeta que ya es corta.
  const puntos = {
    violeta: 'bg-violet-400',
    ambar: 'bg-amber-400',
    rojo: 'bg-rose-400',
  }
  const numeros = {
    violeta: 'text-violet-300',
    ambar: 'text-amber-300',
    rojo: 'text-rose-300',
  }
  return (
    <section className={`${PANEL} min-w-0 overflow-hidden`}>
      <CabeceraPanel
        icono={<AlertTriangle size={19} />}
        titulo="Alertas"
        descripcion={`${modelo.alertas.length || 'Sin'} pendientes`}
      />
      <div className="p-3">
        {modelo.alertas.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-4 text-center">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <p className="text-xs text-muted-foreground">
              Nada pendiente: sin excesses, observaciones ni aprobaciones encoladas.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {modelo.alertas.map((a) => {
              const contenido = (
                // Renglón compacto: sin caja propia. El color del tono va en el
                // punto de la izquierda y en el número, no en un borde alrededor
                // del texto. Con seis alertas, cada caja es 8 px de alto extra
                // que se pagan con espacio vacío dentro de la tarjeta.
                <div className="flex items-center gap-2">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', puntos[a.tono])} />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{a.etiqueta}</span>
                  <span className={cn('shrink-0 text-sm font-bold tabular-nums', numeros[a.tono])}>
                    {a.valor}
                  </span>
                  {a.enlace && <ArrowRight size={12} className="shrink-0 text-muted-foreground" />}
                </div>
              )
              return (
                <li key={a.etiqueta}>
                  {a.enlace ? (
                    <Link href={a.enlace} className="block transition-opacity hover:opacity-80">
                      {contenido}
                    </Link>
                  ) : (
                    contenido
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {modelo.totalesCartera && modelo.totalesCartera.porAprobar > 0 && (
          <p className="mt-2 border-t border-border/60 px-3 py-1.5 text-[10px] leading-4 text-muted-foreground">
            {horas(modelo.totalesCartera.porAprobar)} esperando aprobación en tu cartera.
          </p>
        )}
      </div>
    </section>
  )
}

// --- actividad reciente -----------------------------------------------------

function ActividadReciente({ modelo }: { modelo: Modelo }) {
  return (
    <section className={`${PANEL} flex h-full min-w-0 flex-col`}>
      <CabeceraPanel
        icono={<Clock size={19} />}
        titulo="Actividad reciente del equipo"
        descripcion="Últimos registros del área"
        accion={
          <Link
            href="/aprobaciones"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Ver todas <ArrowRight size={11} />
          </Link>
        }
      />
      {/* Sin `min-width`: la tarjeta ocupa dos tercios de una fila de tres, que
          en un portátil de 13" son unos 500-660 px reales. Un ancho mínimo por
          encima de eso devolvía la barra de desplazamiento horizontal que ya se
          había quitado. Con `table-fixed` y estos porcentajes la tabla mide
          siempre justo el hueco que tiene, y los textos largos se recortan con
          puntos suspensivos en vez de salirse de su celda. */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left text-[11px]">
          <colgroup>
            <col style={{ width: '26%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '13%' }} />
          </colgroup>
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-2 py-2.5 font-medium">Actividad</th>
              <th className="px-2 py-2.5 text-center font-medium">Colaborador</th>
              <th className="px-2 py-2.5 text-center font-medium">Cliente</th>
              <th className="px-2 py-2.5 text-center font-medium">Duración</th>
              <th className="px-2 py-2.5 text-center font-medium">Estado</th>
              <th className="px-2 py-2.5 text-center font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody className="sm:table-row-group">
            {modelo.recientes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                  Sin registros en el rango. Todas las cifras a 0.
                </td>
              </tr>
            )}
            {modelo.recientes.map((a) => {
              const estilo = obtenerEstiloEstado(a.estado)
              return (
              <tr key={a.id} className="border-t border-border/60 hover:bg-muted/40">
                <td className="px-2 py-2">
                  <p className="truncate font-medium text-foreground" title={a.tipo_actividad_nombre ?? ''}>
                    {a.tipo_actividad_nombre ?? 'Sin tipo'}
                  </p>
                  {a.descripcion && (
                    <p className="truncate text-[10px] text-muted-foreground" title={a.descripcion}>
                      {a.descripcion}
                    </p>
                  )}
                </td>
                <td className="truncate px-2 py-2 text-center text-muted-foreground" title={a.usuario_nombre ?? ''}>
                  {nombreCorto(a.usuario_nombre, a.correo)}
                </td>
                <td className="truncate px-2 py-2 text-center text-muted-foreground" title={a.cliente_nombre ?? ''}>
                  {a.cliente_nombre ?? '—'}
                </td>
                <td className="px-2 py-2 text-center tabular-nums whitespace-nowrap text-foreground">
                  {duracion(a)}
                </td>
                {/* Estado compacto: punto de color y etiqueta corta. El `title`
                    conserva el texto completo ("Pendiente de aprobación") para
                    cuando la celda es demasiado estrecha. */}
                <td className="px-2 py-2">
                  <span className="flex min-w-0 items-center justify-center gap-1.5" title={estilo.label}>
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', estilo.dot)} />
                    <span className={cn('truncate font-medium', estilo.text)}>
                      {etiquetaCortaEstado(a.estado)}
                    </span>
                  </span>
                </td>
                <td className="px-2 py-2 text-center tabular-nums whitespace-nowrap text-muted-foreground">
                  {fechaLocalISO(a.inicio)}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * Etiqueta corta del estado, para la tabla compacta de actividad reciente.
 *
 * `obtenerEstiloEstado` da la etiqueta completa, y dos de ellas son largas:
 * "Pendiente de aprobación" y "Corrección solicitada". En una celda estrecha
 * habría que recortarlas de todos modos, así que se recortan de origen a una
 * palabra que se entiende igual con el punto de color al lado. El `title` de la
 * celda conserva el texto íntegro.
 */
function etiquetaCortaEstado(estado: EstadoActividad): string {
  if (estado === 'PENDIENTE_APROBACION') return 'Pendiente'
  if (estado === 'CORRECCION_SOLICITADA') return 'Corrección'
  return obtenerEstiloEstado(estado).label
}

function duracion(a: { inicio: string; fin: string | null; pausa_acumulada_segundos: number }): string {
  if (!a.fin) return 'En curso'
  const seg = Math.max(
    0,
    (new Date(a.fin).getTime() - new Date(a.inicio).getTime()) / 1000 - (a.pausa_acumulada_segundos || 0),
  )
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}
