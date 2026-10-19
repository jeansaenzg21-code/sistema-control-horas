import type { RowDataPacket } from 'mysql2'

import pool from '@/lib/db'

/**
 * Gestión integral a NIVEL DE CLIENTE.
 *
 * El cliente es el ancla, no el proyecto. Un presupuesto pertenece siempre a un
 * cliente (`presupuestos.cliente_id` es NOT NULL) y su proyecto es opcional
 * (`presupuesto_servicios.proyecto_id` admite NULL). Por eso todo lo que se ve
 * en la ficha del cliente se agrega desde el Excel del cliente y sus servicios,
 * sin depender de que exista un proyecto ni de que alguien lo haya vinculado.
 *
 * Reglas que se respetan aquí y que no se pueden relajar:
 *
 * - Lo contratado son las bolsas ACTIVAS. Un presupuesto en revisión no suma
 *   contrato: son horas propuestas.
 * - El equipo sale de las asignaciones CONFIRMADAS del Excel, no de una lista de
 *   participantes inventada. El "rol" que se muestra es la categoría del Excel.
 * - El consumo son las horas realmente registradas contra una bolsa. Lo que no
 *   tiene bolsa vinculada NO se reparte por parecido: se declara sin imputar.
 * - Sin horas registradas no hay desviación. Reportar "0 - 272 = -272 h" como
 *   desviación sería una alarma falsa: es trabajo sin empezar.
 */

export type FilaServicio = {
  id: number
  origen: 'DETALLADO' | 'CONSOLIDADO' | 'COMPLEMENTARIO'
  nombre: string
  activo: boolean
  horas: number
  asignado: number
  registrado: number
  aprobado: number
  /** Nulo mientras la bolsa no esté activa: no hay saldo disponible todavía. */
  saldo: number | null
  desviacion: number
  consumo: 'medido' | 'sin_imputar'
  pendientePorConfirmar: number
}

export type FilaIntegrante = {
  usuarioId: number
  nombre: string
  cargo: string | null
  /** Área de la persona, que puede no ser la del cliente. */
  area: string | null
  areaId: number | null
  esDelAreaDelCliente: boolean
  /** Rol = categoría del Excel; `horasPropuestas` = lo que el Excel le asigna. */
  rol: string
  asignado: number
  /** Horas del Excel, activen o no. */
  horasPropuestas: number
  registrado: number
  aprobado: number
  disponible: number | null
  desviacion: number
  porcentaje: number
  porServicio: { servicioId: number; servicio: string; horas: number }[]
}

export type FilaPlan = {
  subetapa: string
  etapa: string | null
  horas: number
  semanaInicio: number | null
  semanaFin: number | null
  mes: string | null
  /** Nulo si la sub-etapa no está vinculada a una bolsa. No se deduce por texto. */
  servicioId: number | null
}

export type Desviacion = {
  usuarioId: number | null
  nombre: string
  asignado: number
  registrado: number
  desviacion: number
  porcentaje: number
  detalle: string
}

export type Candidato = {
  id: number
  nombre: string
  cargo: string | null
  /** Si ya tiene horas asignadas en este cliente. */
  yaAsignado: boolean
}

export type EstadoPresupuesto = {
  id: number
  version: number
  estado: string
  archivoNombre: string
  horasComplementariasSinConfirmar: number
  asignacionesSinConfirmar: number
}

/**
 * Fila de `clientes` tal y como la leen la ruta de la API y este módulo.
 *
 * Se pide UNA sola vez, en la ruta, porque allí es donde se comprueba que el
 * cliente sea de la empresa activa. Pedirla otra vez aquí sería un viaje más a
 * la base de datos por una fila que ya se tiene en la mano.
 */
export type FilaCliente = RowDataPacket & {
  id: number
  nombre: string
  area_id: number
  area: string
  ruc: string | null
  correo: string | null
  telefono: string | null
}

export type GestionCliente = {
  cliente: {
    id: number
    nombre: string
    area: string
    areaId: number
    ruc: string | null
    correo: string | null
    telefono: string | null
  }
  presupuestos: EstadoPresupuesto[]
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
    /** Id del servicio, para emparejar por id y no por texto. */
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

function n(v: unknown): number {
  return Math.round(Number(v ?? 0) * 100) / 100
}

/** Suma DECIMAL de MySQL, que llegan como texto, sin concatenarlos. */
function sumar(vals: unknown[]): number {
  return Math.round(vals.reduce<number>((t, v) => t + Number(v ?? 0), 0) * 100) / 100
}

function fecha(v: string | Date | null): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

/** Horas de una actividad: transcurrido menos pausas. */
const HORAS_ACTIVIDAD = `GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, a.fin) -
  COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, a.fin)))
             FROM pausas p WHERE p.actividad_id = a.id), 0))`

/**
 * @param cliente  Fila ya validada del cliente. La lee la ruta, que es donde se
 *                 comprueba que el cliente sea de la empresa activa; aquí se usa
 *                 tal cual para no repetir la consulta.
 */
export async function obtenerGestionCliente(
  cliente: FilaCliente,
  puedeGestionar: boolean,
  motivoPermiso: string
): Promise<GestionCliente> {
  const clienteId = cliente.id

  // --- presupuestos del cliente --------------------------------------------
  //
  // Es la única consulta que no tiene compañía en esta tanda: las ocho de abajo
  // necesitan sus ids, así que tienen que esperarla.
  //
  // ANTES, las diez consultas de esta función iban en serie, una detrás de otra,
  // y encima la ruta pedía aparte la fila del cliente que esta función volvía a
  // pedir por su cuenta. Abrir la ficha de un cliente pagaba once viajes seguidos
  // a la base de datos antes de pintar nada en pantalla. Con una BD remota eso es
  // justo lo que se notaba al pulsar "Ver": la tarjeta se quedaba en "Cargando el
  // presupuesto del cliente..." durante segundos.
  //
  // Ahora son dos tandas: está, y la de abajo con las ocho restantes en
  // paralelo. El tiempo total es el de la consulta más lenta de cada tanda, no
  // la suma de todas.
  const [presupuestos] = await pool.query<
    (RowDataPacket & {
      id: number
      version: number
      estado: string
      archivo_nombre: string
      horas_complementarias_sin_confirmar: string
      asignaciones_sin_confirmar: string
    })[]
  >(
    `SELECT p.id, p.version, p.estado, p.archivo_nombre,
            COALESCE((SELECT SUM(a.horas) FROM presupuesto_asignaciones a
                        JOIN presupuesto_servicios s ON s.id = a.servicio_id
                       WHERE s.presupuesto_id = p.id AND s.origen = 'COMPLEMENTARIO'
                         AND a.estado <> 'CONFIRMADA'), 0) AS horas_complementarias_sin_confirmar,
            COALESCE((SELECT COUNT(*) FROM presupuesto_asignaciones a
                        JOIN presupuesto_servicios s ON s.id = a.servicio_id
                       WHERE s.presupuesto_id = p.id AND s.origen <> 'CONSOLIDADO'
                         AND a.estado = 'PENDIENTE_REVISION'), 0) AS asignaciones_sin_confirmar
       FROM presupuestos p
      WHERE p.cliente_id = ?
      ORDER BY (p.estado = 'APROBADO') DESC, (p.estado = 'EN_REVISION') DESC, p.version DESC`,
    [clienteId]
  )

  // El vigente es el aprobado; si no hay ninguno, el de versión más alta. Un
  // presupuesto en revisión manda sobre uno en borrador, no al revés.
  const listaPresupuestos: EstadoPresupuesto[] = presupuestos.map((p) => ({
    id: p.id,
    version: p.version,
    estado: p.estado,
    archivoNombre: p.archivo_nombre,
    horasComplementariasSinConfirmar: n(p.horas_complementarias_sin_confirmar),
    asignacionesSinConfirmar: Number(p.asignaciones_sin_confirmar),
  }))
  const ids = presupuestos.map((p) => p.id)
  const vigente = presupuestos[0]?.id ?? null
  const tienePresupuestos = ids.length > 0
  const marcas = ids.map(() => '?').join(',')

  // --- segunda tanda: siete consultas en paralelo --------------------------
  //
  // Ninguna necesita el resultado de otra. Todas dependen de los ids de los
  // presupuestos, así que tienen que esperar a la primera tanda.
  //
  // Si el cliente no tiene presupuestos, las seis primeras no tendrían nada que
  // devolver, así que se quedan en null y sus listas salen vacías: es el mismo
  // resultado que saltárselas. La de candidatos va siempre porque solo depende
  // del área del cliente.
  const [serviciosRes, consumoRes, equipoRes, registroRes, detalleRes, sinResolverRes, planRes, candidatosRes] =
    await Promise.all([
      tienePresupuestos
        ? pool.query<
            (RowDataPacket & {
              id: number
              origen: 'DETALLADO' | 'CONSOLIDADO' | 'COMPLEMENTARIO'
              nombre: string
              activo: number
              horas: string
              asignado_confirmado: string
              pendiente_confirmar: string
            })[]
          >(
            `SELECT s.id, s.origen, s.nombre, s.activo, s.horas,
                    COALESCE((SELECT SUM(a.horas) FROM presupuesto_asignaciones a
                               WHERE a.servicio_id = s.id AND a.estado = 'CONFIRMADA'), 0) AS asignado_confirmado,
                    COALESCE((SELECT SUM(a.horas) FROM presupuesto_asignaciones a
                               WHERE a.servicio_id = s.id AND a.estado = 'PENDIENTE_REVISION'), 0) AS pendiente_confirmar
               FROM presupuesto_servicios s
              WHERE s.presupuesto_id IN (${marcas})
              ORDER BY s.origen = 'CONSOLIDADO', s.horas DESC`,
            ids
          )
        : null,
      // Consumo real, atribuido solo a las horas con bolsa vinculada.
      tienePresupuestos
        ? pool.query<(RowDataPacket & { servicio_id: number; registrado: number; aprobado: number })[]>(
            `SELECT presupuesto_servicio_id AS servicio_id,
                    COALESCE(SUM(${HORAS_ACTIVIDAD}), 0) / 3600 AS registrado,
                    COALESCE(SUM(CASE WHEN a.estado = 'APROBADA' THEN ${HORAS_ACTIVIDAD} ELSE 0 END), 0) / 3600 AS aprobado
               FROM actividades a
              WHERE a.cliente_id = ? AND a.presupuesto_servicio_id IS NOT NULL AND a.fin IS NOT NULL
                AND a.estado IN ('PENDIENTE_APROBACION','APROBADA')
              GROUP BY presupuesto_servicio_id`,
            [clienteId]
          )
        : null,
      tienePresupuestos
        ? pool.query<
            (RowDataPacket & {
              usuario_id: number
              nombre: string
              cargo: string | null
              categoria: string | null
              asignado: string
              area_id: number | null
              area: string | null
            })[]
          >(
            `SELECT a.usuario_id, u.nombre, u.cargo, u.area_id, ar.nombre AS area,
                    (SELECT GROUP_CONCAT(DISTINCT aa.categoria ORDER BY aa.categoria SEPARATOR ' · ')
                       FROM presupuesto_asignaciones aa
                      WHERE aa.servicio_id IN (SELECT id FROM presupuesto_servicios
                                                WHERE presupuesto_id IN (${marcas}))
                        AND aa.usuario_id = a.usuario_id AND aa.estado = 'CONFIRMADA'
                        AND aa.categoria IS NOT NULL AND aa.categoria <> '') AS categoria,
                    SUM(a.horas) AS asignado
               FROM presupuesto_asignaciones a
               JOIN presupuesto_servicios s ON s.id = a.servicio_id
               JOIN usuarios u ON u.id = a.usuario_id
               LEFT JOIN areas ar ON ar.id = u.area_id
              WHERE a.estado = 'CONFIRMADA' AND a.usuario_id IS NOT NULL
                AND s.presupuesto_id IN (${marcas})
                AND s.origen <> 'CONSOLIDADO'
              GROUP BY a.usuario_id, u.nombre, u.cargo, u.area_id, ar.nombre
              ORDER BY SUM(a.horas) DESC`,
            [...ids, ...ids]
          )
        : null,
      // Consumo por persona,同样 solo contra horas imputadas a una bolsa.
      tienePresupuestos
        ? pool.query<
            (RowDataPacket & { usuario_id: number; registrado: string; aprobado: string; pendiente: string })[]
          >(
            `SELECT a.usuario_id,
                    COALESCE(SUM(${HORAS_ACTIVIDAD}), 0) / 3600 AS registrado,
                    COALESCE(SUM(CASE WHEN a.estado = 'APROBADA' THEN ${HORAS_ACTIVIDAD} ELSE 0 END), 0) / 3600 AS aprobado,
                    COALESCE(SUM(CASE WHEN a.estado = 'PENDIENTE_APROBACION' THEN ${HORAS_ACTIVIDAD} ELSE 0 END), 0) / 3600 AS pendiente
               FROM actividades a
              WHERE a.cliente_id = ? AND a.fin IS NOT NULL
                AND a.estado IN ('PENDIENTE_APROBACION','APROBADA')
              GROUP BY a.usuario_id`,
            [clienteId]
          )
        : null,
      // Detalle por servicio, para el desplegable de cada persona.
      tienePresupuestos
        ? pool.query<
            (RowDataPacket & { usuario_id: number; servicio_id: number; servicio: string; horas: string })[]
          >(
            `SELECT a.usuario_id, s.id AS servicio_id, s.nombre AS servicio, a.horas
               FROM presupuesto_asignaciones a
               JOIN presupuesto_servicios s ON s.id = a.servicio_id
              WHERE a.estado = 'CONFIRMADA' AND a.usuario_id IS NOT NULL
                AND s.presupuesto_id IN (${marcas})
                AND s.origen <> 'CONSOLIDADO'
              ORDER BY s.nombre`,
            ids
          )
        : null,
      tienePresupuestos
        ? pool.query<
            (RowDataPacket & {
              id: number
              servicio_id: number
              servicio: string
              etiqueta: string | null
              categoria: string | null
              horas: string
              motivo: string | null
            })[]
          >(
            `SELECT a.id, s.id AS servicio_id, s.nombre AS servicio, a.nombre_texto AS etiqueta, a.categoria, a.horas, a.motivo
               FROM presupuesto_asignaciones a
               JOIN presupuesto_servicios s ON s.id = a.servicio_id
              WHERE a.estado = 'PENDIENTE_REVISION'
                AND s.presupuesto_id IN (${marcas})
                AND s.origen <> 'CONSOLIDADO'
              ORDER BY s.nombre, a.horas DESC`,
            ids
          )
        : null,
      tienePresupuestos
        ? pool.query<
            (RowDataPacket & {
              subetapa: string
              etapa: string | null
              horas: string
              semana_inicio: number | null
              semana_fin: number | null
              mes: string | null
              presupuesto_servicio_id: number | null
            })[]
          >(
            `SELECT pp.subetapa, pp.etapa, pp.horas, pp.semana_inicio, pp.semana_fin, pp.mes,
                    pp.presupuesto_servicio_id
               FROM presupuesto_planificacion pp
              WHERE pp.presupuesto_id IN (${marcas})
              ORDER BY COALESCE(pp.semana_inicio, 999), pp.id`,
            ids
          )
        : null,
      // Candidatos para repartir: el equipo del ÁREA del cliente. Sin proyecto
      // ya no hay "participantes del proyecto", así que la lista sensata es el
      // personal del área a la que pertenece el cliente. No depende de los
      // presupuestos, así que se lanza siempre en esta misma tanda.
      pool.query<
        (RowDataPacket & { id: number; nombre: string; cargo: string | null; area_id: number })[]
      >(
        `SELECT u.id, u.nombre, u.cargo, u.area_id
           FROM usuarios u
          WHERE u.activo = TRUE AND u.area_id = ?
          ORDER BY u.nombre`,
        [cliente.area_id]
      ),
    ])

  // --- bolsas ---------------------------------------------------------------
  const filas = serviciosRes?.[0] ?? []
  const consumo = consumoRes?.[0] ?? []
  const servicios: FilaServicio[] = []

  const consumoPorServicio = new Map<number, { registrado: number; aprobado: number }>()
  for (const c of consumo) {
    consumoPorServicio.set(c.servicio_id, { registrado: n(c.registrado), aprobado: n(c.aprobado) })
  }

  for (const s of filas) {
    const c = consumoPorServicio.get(s.id) ?? { registrado: 0, aprobado: 0 }
    const horas = n(s.horas)
    const activo = s.activo === 1
    servicios.push({
      id: s.id,
      origen: s.origen,
      nombre: s.nombre,
      activo,
      horas,
      asignado: n(s.asignado_confirmado),
      registrado: c.registrado,
      aprobado: c.aprobado,
      // Sin bolsa activa no hay saldo: son horas propuestas, no comprometidas.
      saldo: activo ? n(horas - c.registrado) : null,
      desviacion: activo ? n(c.registrado - n(s.asignado_confirmado)) : 0,
      consumo: c.registrado > 0 ? 'medido' : 'sin_imputar',
      pendientePorConfirmar: n(s.pendiente_confirmar),
    })
  }

  // --- equipo: las personas que el Excel nombra, con lo que tienen asignado ---
  const equipo: FilaIntegrante[] = []
  let horasPendientesPorPersona = 0
  const filasEquipo = equipoRes?.[0] ?? []
  const registro = registroRes?.[0] ?? []
  const detalleServicios = detalleRes?.[0] ?? []

  const regPorUsuario = new Map<number, { registrado: number; aprobado: number; pendiente: number }>()
  for (const r of registro) {
    regPorUsuario.set(r.usuario_id, { registrado: n(r.registrado), aprobado: n(r.aprobado), pendiente: n(r.pendiente) })
  }

  const hayBolsasActivas = servicios.some((s) => s.activo && s.origen !== 'CONSOLIDADO')

  for (const f of filasEquipo) {
    const r = regPorUsuario.get(f.usuario_id) ?? { registrado: 0, aprobado: 0, pendiente: 0 }
    const propio = detalleServicios.filter((x) => x.usuario_id === f.usuario_id)
    // Las horas del Excel son la propuesta. Solo cuentan como asignadas si la
    // bolsa está activa; sin activar, la columna se dice y no se imputa a nadie.
    const asignado = hayBolsasActivas ? n(f.asignado) : 0
    equipo.push({
      usuarioId: f.usuario_id,
      nombre: f.nombre,
      cargo: f.cargo,
      area: f.area,
      areaId: f.area_id,
      /** `true` cuando la persona es del área del cliente. `false` cuando
       *  viene de otra: en un servicio multidisciplinario eso es lo normal y
       *  hay que decirlo, no esconderlo. */
      esDelAreaDelCliente: f.area_id === null || f.area_id === cliente.area_id,
      rol: f.categoria ?? 'Sin categoría en el Excel',
      asignado,
      horasPropuestas: sumar(propio.map((x) => x.horas)),
      registrado: r.registrado,
      aprobado: r.aprobado,
      disponible: hayBolsasActivas ? n(asignado - r.registrado) : null,
      desviacion: hayBolsasActivas ? n(r.registrado - asignado) : 0,
      porcentaje: asignado > 0 ? Math.min(100, Math.round((r.registrado / asignado) * 100)) : 0,
      porServicio: propio.map((x) => ({ servicioId: x.servicio_id, servicio: x.servicio, horas: n(x.horas) })),
    })
    horasPendientesPorPersona += r.pendiente
  }

  // --- horas sin dueño -------------------------------------------------------
  const sinResolver: GestionCliente['sinResolver'] = []
  for (const p of sinResolverRes?.[0] ?? []) {
    sinResolver.push({
      id: p.id,
      servicioId: p.servicio_id,
      servicio: p.servicio,
      etiqueta: p.etiqueta,
      categoria: p.categoria,
      horas: n(p.horas),
      motivo: p.motivo,
    })
  }

  // --- planificación del Excel del cliente ---------------------------------
  // Se lee por presupuesto, no por proyecto: así sigue llegando aunque el
  // proyecto no exista o nunca se haya vinculado.
  const planificacion: FilaPlan[] = []
  for (const p of planRes?.[0] ?? []) {
    planificacion.push({
      subetapa: p.subetapa,
      etapa: p.etapa,
      horas: n(p.horas),
      semanaInicio: p.semana_inicio,
      semanaFin: p.semana_fin,
      mes: p.mes,
      servicioId: p.presupuesto_servicio_id,
    })
  }

  const yaAsignados = new Set(equipo.map((e) => e.usuarioId))
  const candidatos: Candidato[] = (candidatosRes[0] ?? []).map((u) => ({
    id: u.id,
    nombre: u.nombre,
    cargo: u.cargo,
    yaAsignado: yaAsignados.has(u.id),
  }))

  // --- indicadores ----------------------------------------------------------
  // El cronograma del Excel viene en semanas relativas, y sin proyecto no hay
  // dónde registrar una fecha de inicio que lo convierta en fechas de
  // calendario. Se dice siempre que faltan esas fechas: no se inventa un
  // calendario a partir de semanas, ni se consulta una tabla que el módulo de
  // clientes no usa.
  const cronogramaConFechas = false

  const horasContratadas = sumar(
    servicios.filter((s) => s.activo && s.origen !== 'CONSOLIDADO').map((s) => s.horas)
  )
  const horasPropuestas = sumar(
    servicios.filter((s) => !s.activo && s.origen !== 'CONSOLIDADO').map((s) => s.horas)
  )
  const horasRegistradas = sumar(equipo.map((e) => e.registrado))
  const horasAprobadas = sumar(equipo.map((e) => e.aprobado))
  const asignadasTotales = sumar(equipo.map((e) => e.asignado))
  // Sin consumo no hay desviación: hay trabajo sin empezar.
  const desviacionHoras = horasRegistradas > 0 ? n(horasRegistradas - asignadasTotales) : null

  const desviaciones: Desviacion[] = equipo
    .filter((e) => e.desviacion > 0)
    .map((e) => ({
      usuarioId: e.usuarioId,
      nombre: e.nombre,
      asignado: e.asignado,
      registrado: e.registrado,
      desviacion: e.desviacion,
      porcentaje: e.asignado > 0 ? Math.round((e.desviacion / e.asignado) * 1000) / 10 : 0,
      detalle: `Registró más horas de las que tiene asignadas.`,
    }))

  return {
    cliente: {
      id: cliente.id,
      nombre: cliente.nombre,
      area: cliente.area,
      areaId: cliente.area_id,
      ruc: cliente.ruc,
      correo: cliente.correo,
      telefono: cliente.telefono,
    },
    presupuestos: listaPresupuestos,
    presupuestoVigente: vigente,
    indicadores: {
      horasContratadas,
      horasPropuestas,
      horasRegistradas,
      horasAprobadas,
      horasPendientesAprobacion: n(horasPendientesPorPersona),
      horasDisponibles: n(horasContratadas - horasRegistradas),
      desviacionHoras,
      desviacionPorcentaje:
        desviacionHoras === null || asignadasTotales <= 0
          ? null
          : Math.round((desviacionHoras / asignadasTotales) * 1000) / 10,
      cronogramaConFechas,
    },
    equipo,
    servicios,
    sinResolver,
    desviaciones,
    planificacion,
    candidatos,
    permisos: { puedeGestionar, motivo: motivoPermiso },
  }
}

export { fecha }
