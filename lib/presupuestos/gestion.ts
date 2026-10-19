// Cálculo de la vista integral de gestión de un proyecto.
//
// Todo se resuelve aquí, en el backend. La pantalla recibe totales ya hechos:
// nunca descarga actividades para contar en el navegador.
//
// Una separación importante: lo que el presupuesto PROPONE y lo que está
// APROBADO no se mezclan. Mientras no se activen las bolsas, las horas
// propuestas se muestran como propuestas y NO cuentan como saldo disponible.

import type { RowDataPacket } from 'mysql2'

import pool from '@/lib/db'

/**
 * MySQL devuelve los DECIMAL como TEXTO. Sin `Number` antes de sumar, el `+` de
 * los reduce concatena ("0" + "57.00" + "21.00" = "057.0021.00") y el
 * resultado no es un número. Por eso TODO importe pasa por aquí antes de
 * sumarse, y no solo al final.
 */
function n(v: unknown): number {
  return Math.round(Number(v ?? 0) * 100) / 100
}

/** Suma una lista de valores DECIMAL sin concatenarlos por el camino. */
function sumar(vals: unknown[]): number {
  return Math.round(vals.reduce<number>((t, v) => t + Number(v ?? 0), 0) * 100) / 100
}

export type EstadoPresupuesto = {
  id: number
  version: number
  estado: 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'OBSERVADO'
  archivoNombre: string
  /** Las 2 h complementarias siguen sin decidir: no se suman a lo aprobado. */
  horasComplementariasSinConfirmar: number
  observacionesBloqueantes: number
  asignacionesSinConfirmar: number
}

export type FilaServicio = {
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
  /** 'sin_imputar' = las actividades no tienen servicio asignado todavia. */
  consumo: 'medido' | 'sin_imputar'
  asignadoPorUsuario: number
  pendientePorConfirmar: number
}

export type FilaIntegrante = {
  usuarioId: number
  nombre: string
  cargo: string | null
  rolProyecto: string
  /** Horas repartidas sobre bolsas ya activadas. */
  asignado: number
  /** Horas repartidas en el documento, activen o no. */
  propuesto: number
  registrado: number
  aprobado: number
  /** Nulo mientras no haya bolsa activa: no hay saldo disponible todavia. */
  disponible: number | null
  desviacion: number
  porcentaje: number
  porServicio: { servicioId: number; servicio: string; horas: number }[]
}

export type AsignacionSinResolver = {
  id: number
  servicio: string
  // El Excel puede traer la celda de persona vacia: es justamente el caso que
  // el Lider tiene que resolver, asi que se conserva como null.
  etiqueta: string | null
  categoria: string | null
  horas: number
  motivo: string | null
}

export type Desviacion = {
  usuarioId: number | null
  nombre: string
  tipo: 'integrante' | 'servicio'
  asignado: number
  registrado: number
  desviacion: number
  porcentaje: number
  detalle: string
}

export type GestionProyecto = {
  proyecto: {
    id: number
    nombre: string
    cliente: string
    clienteId: number
    area: string
    lider: string
    liderId: number
    estado: string
    fechaInicio: string | null
    fechaFin: string | null
  }
  presupuestos: EstadoPresupuesto[]
  /** Presupuestos del cliente todavía sin vincular a este proyecto. */
  presupuestosDisponibles: { id: number; version: number; archivoNombre: string }[]
  indicadores: {
    /** Solo lo APROBADO cuenta como contratado. */
    horasContratadas: number
    horasPropuestas: number
    horasRegistradas: number
    horasAprobadas: number
    horasPendientesAprobacion: number
    horasDisponibles: number
  /** Nulo cuando no hay horas registradas: no es desviación, es trabajo sin empezar. */
  desviacionHoras: number | null
  desviacionPorcentaje: number | null
    /** Sin fecha de inicio confirmada no hay cronograma en fechas. */
    cronogramaConFechas: boolean
  }
  equipo: FilaIntegrante[]
  servicios: FilaServicio[]
  sinResolver: AsignacionSinResolver[]
  desviaciones: Desviacion[]
  planificacion: {
    subetapa: string
    etapa: string | null
    horas: number
    semanaInicio: number | null
    semanaFin: number | null
    mes: string | null
    /** El servicio al que se puede imputar, si el nombre coincide con uno. */
    servicioId: number | null
  }[]
  permisos: {
    puedeGestionar: boolean
    esAdmin: boolean
    puedeVerImportes: boolean
    motivo: string
  }
}

export async function obtenerGestionProyecto(
  proyectoId: number,
  usuarioId: number,
  opciones: { puedeVerImportes: boolean; puedeGestionar: boolean; esAdmin: boolean }
): Promise<GestionProyecto> {
  // --- encabezado ----------------------------------------------------------
  const [cab] = await pool.query<
    (RowDataPacket & {
      id: number
      nombre: string
      cliente: string | null
      cliente_id: number | null
      area: string
      lider: string
      lider_id: number
      estado: string
      fecha_inicio: string | Date | null
      fecha_fin: string | Date | null
    })[]
  >(
    `SELECT p.id, p.nombre, c.nombre AS cliente, c.id AS cliente_id,
            a.nombre AS area, u.nombre AS lider, u.id AS lider_id,
            p.estado, p.fecha_inicio, p.fecha_fin
       FROM proyectos p
       LEFT JOIN clientes c ON c.id = p.cliente_id
       -- El area se hereda del cliente: la tabla proyectos no tiene columna de area.
       LEFT JOIN areas a ON a.id = c.area_id
       LEFT JOIN usuarios u ON u.id = p.jefe_id
      WHERE p.id = ?`,
    [proyectoId]
  )
  const proyecto = cab[0]
  if (!proyecto) throw new Error('El proyecto no existe.')

  const fecha = (v: string | Date | null): string | null => {
    if (!v) return null
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    return String(v).slice(0, 10)
  }

  // --- presupuestos vinculados a ESTE proyecto ------------------------------
  // Regla dura: esta pantalla nunca mezcla proyectos. Un presupuesto del mismo
  // cliente que todavia no esta vinculado se lista aparte, como disponible para
  // que el ADMIN lo vincule, y no entra en ningun indicador ni en el equipo.
  const [presupuestos] = await pool.query<
    (RowDataPacket & {
      id: number
      version: number
      estado: EstadoPresupuesto['estado']
      archivo_nombre: string
      analisis: string | null
    })[]
  >(
    `SELECT DISTINCT p.id, p.version, p.estado, p.archivo_nombre, p.analisis
       FROM presupuestos p
       JOIN presupuesto_servicios s ON s.presupuesto_id = p.id
      WHERE s.proyecto_id = ?
      ORDER BY p.version DESC`,
    [proyectoId]
  )

  const [disponibles] = await pool.query<
    (RowDataPacket & { id: number; version: number; archivo_nombre: string })[]
  >(
    `SELECT p.id, p.version, p.archivo_nombre
       FROM presupuestos p
      WHERE p.cliente_id = ?
        AND NOT EXISTS (SELECT 1 FROM presupuesto_servicios s
                         WHERE s.presupuesto_id = p.id AND s.proyecto_id IS NOT NULL)
      ORDER BY p.version DESC`,
    [proyecto.cliente_id ?? 0]
  )

  const idsPresupuesto = presupuestos.map((p) => p.id)

  const bloqueantesPorPresupuesto = new Map<number, number>()
  for (const p of presupuestos) {
    let bloqueantes = 0
    try {
      const a = p.analisis ? (JSON.parse(p.analisis) as { observaciones?: { severidad: string }[] }) : null
      bloqueantes = (a?.observaciones ?? []).filter((o) => o.severidad === 'BLOQUEANTE').length
    } catch {
      bloqueantes = 0
    }
    bloqueantesPorPresupuesto.set(p.id, bloqueantes)
  }

  const [sinConfirmar] = idsPresupuesto.length
    ? await pool.query<(RowDataPacket & { presupuesto_id: number; n: number; horas: number })[]>(
        `SELECT s.presupuesto_id, COUNT(*) AS n, COALESCE(SUM(a.horas),0) AS horas
           FROM presupuesto_asignaciones a
           JOIN presupuesto_servicios s ON s.id = a.servicio_id
          WHERE s.presupuesto_id IN (${idsPresupuesto.map(() => '?').join(',')})
            AND a.estado = 'PENDIENTE_REVISION' AND s.origen <> 'CONSOLIDADO'
          GROUP BY s.presupuesto_id`,
        idsPresupuesto
      )
    : [[]]
  const porPresupuestoSinConfirmar = new Map<number, { n: number; horas: number }>()
  for (const r of sinConfirmar) porPresupuestoSinConfirmar.set(r.presupuesto_id, { n: r.n, horas: r.horas })

  const [complemento] = idsPresupuesto.length
    ? await pool.query<(RowDataPacket & { presupuesto_id: number; horas: number; asignado: number })[]>(
        `SELECT s.presupuesto_id, COALESCE(SUM(s.horas),0) AS horas,
                COALESCE(SUM(CASE WHEN a.estado = 'CONFIRMADA' THEN a.horas ELSE 0 END),0) AS asignado
           FROM presupuesto_servicios s
           LEFT JOIN presupuesto_asignaciones a ON a.servicio_id = s.id
          WHERE s.presupuesto_id IN (${idsPresupuesto.map(() => '?').join(',')})
            AND s.origen = 'COMPLEMENTARIO'
          GROUP BY s.presupuesto_id`,
        idsPresupuesto
      )
    : [[]]
  const complementoPorPresupuesto = new Map<number, { horas: number; asignado: number }>()
  for (const r of complemento) {
    complementoPorPresupuesto.set(r.presupuesto_id, { horas: r.horas, asignado: r.asignado })
  }

  const listaPresupuestos: EstadoPresupuesto[] = presupuestos.map((p) => {
    const comp = complementoPorPresupuesto.get(p.id)
    const sinC = porPresupuestoSinConfirmar.get(p.id)
    return {
      id: p.id,
      version: p.version,
      estado: p.estado,
      archivoNombre: p.archivo_nombre,
      // Lo complementario que todavia no se ha repartido no se da por contratado.
      horasComplementariasSinConfirmar: comp ? n(comp.horas - comp.asignado) : 0,
      observacionesBloqueantes: bloqueantesPorPresupuesto.get(p.id) ?? 0,
      asignacionesSinConfirmar: sinC?.n ?? 0,
    }
  })

  // --- servicios -----------------------------------------------------------
  const [servicios] = await pool.query<
    (RowDataPacket & {
      id: number
      origen: FilaServicio['origen']
      nombre: string
      activo: number
      horas: string
      asignado_confirmado: string
      pendiente_confirmar: string
      sin_imputar: number
    })[]
  >(
    `SELECT s.id, s.origen, s.nombre, s.activo, s.horas,
            COALESCE((SELECT SUM(a.horas) FROM presupuesto_asignaciones a
                       WHERE a.servicio_id = s.id AND a.estado = 'CONFIRMADA'), 0) AS asignado_confirmado,
            COALESCE((SELECT SUM(a.horas) FROM presupuesto_asignaciones a
                       WHERE a.servicio_id = s.id AND a.estado = 'PENDIENTE_REVISION'), 0) AS pendiente_confirmar,
            (SELECT COUNT(*) FROM actividades act
              WHERE act.presupuesto_servicio_id = s.id AND act.fin IS NOT NULL) AS sin_imputar
       FROM presupuesto_servicios s
      WHERE s.proyecto_id = ?
      ORDER BY s.origen = 'CONSOLIDADO', s.horas DESC`,
    [proyectoId]
  )

  // Consumo real: solo cuenta lo que tiene servicio asignado. Lo demas se
  // declara "sin imputar" en vez de repartirse por parecido.
  const [consumo] = await pool.query<
    (RowDataPacket & { servicio_id: number; registrado: number; aprobado: number })[]
  >(
    `SELECT presupuesto_servicio_id AS servicio_id,
            COALESCE(SUM(GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, a.fin)) -
              COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, a.fin)))
                          FROM pausas p WHERE p.actividad_id = a.id), 0)), 0) / 3600 AS registrado,
            COALESCE(SUM(CASE WHEN a.estado = 'APROBADA' THEN
                      GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, a.fin)) -
                      COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, a.fin)))
                                  FROM pausas p WHERE p.actividad_id = a.id), 0) ELSE 0 END), 0) / 3600 AS aprobado
       FROM actividades a
      WHERE a.proyecto_id = ? AND a.presupuesto_servicio_id IS NOT NULL AND a.fin IS NOT NULL
        AND a.estado IN ('PENDIENTE_APROBACION','APROBADA')
      GROUP BY presupuesto_servicio_id`,
    [proyectoId]
  )
  const consumoPorServicio = new Map<number, { registrado: number; aprobado: number }>()
  for (const c of consumo) consumoPorServicio.set(c.servicio_id, { registrado: n(c.registrado), aprobado: n(c.aprobado) })

  const filasServicio: FilaServicio[] = servicios.map((s) => {
    const c = consumoPorServicio.get(s.id) ?? { registrado: 0, aprobado: 0 }
    const horas = n(s.horas)
    const asignado = n(s.asignado_confirmado)
    // Mientras la bolsa no este activa NO hay saldo disponible: las horas son
    // una propuesta. Publicar "horas - consumido" aqui seria mostrar dinero
    // comprometido que todavia nadie firmo.
    const saldo = s.activo === 1 ? n(horas - c.registrado) : null
    return {
      id: s.id,
      origen: s.origen,
      nombre: s.nombre,
      activo: s.activo === 1,
      horas,
      asignado,
      registrado: c.registrado,
      aprobado: c.aprobado,
      saldo,
      desviacion: s.activo === 1 ? n(c.registrado - asignado) : 0,
      consumo: c.registrado > 0 ? 'medido' : 'sin_imputar',
      asignadoPorUsuario: asignado,
      pendientePorConfirmar: n(s.pendiente_confirmar),
    }
  })

  // --- equipo: participantes del proyecto + horas por servicio -------------
  const [participantes] = await pool.query<
    (RowDataPacket & { usuario_id: number; nombre: string; cargo: string | null; rol_proyecto: string })[]
  >(
    `SELECT pp.usuario_id, u.nombre, u.cargo, pp.rol_proyecto
       FROM proyecto_participantes pp
       JOIN usuarios u ON u.id = pp.usuario_id
      WHERE pp.proyecto_id = ?
      ORDER BY FIELD(pp.rol_proyecto,'LIDER','COORDINADOR','ESPECIALISTA','COLABORADOR'), u.nombre`,
    [proyectoId]
  )

  // Horas del equipo en el proyecto, contadas por la actividad real.
  const [registroEquipo] = await pool.query<
    (RowDataPacket & { usuario_id: number; registrado: number; aprobado: number; pendiente: number })[]
  >(
    `SELECT a.usuario_id,
            COALESCE(SUM(GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, a.fin)) -
              COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, a.fin)))
                          FROM pausas p WHERE p.actividad_id = a.id), 0)), 0) / 3600 AS registrado,
            COALESCE(SUM(CASE WHEN a.estado='APROBADA' THEN
                      GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, a.fin)) -
                      COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, a.fin)))
                                  FROM pausas p WHERE p.actividad_id = a.id), 0) ELSE 0 END), 0) / 3600 AS aprobado,
            COALESCE(SUM(CASE WHEN a.estado='PENDIENTE_APROBACION' THEN
                      GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, a.fin)) ELSE 0 END), 0) / 3600 AS pendiente
       FROM actividades a
      WHERE a.proyecto_id = ? AND a.fin IS NOT NULL
        AND a.estado IN ('PENDIENTE_APROBACION','APROBADA')
      GROUP BY a.usuario_id`,
    [proyectoId]
  )
  const registroPorUsuario = new Map<number, { registrado: number; aprobado: number; pendiente: number }>()
  for (const r of registroEquipo) {
    registroPorUsuario.set(r.usuario_id, { registrado: n(r.registrado), aprobado: n(r.aprobado), pendiente: n(r.pendiente) })
  }

  // Asignaciones confirmadas, agrupadas por persona y servicio.
  const [asignaciones] = idsPresupuesto.length
    ? await pool.query<
        (RowDataPacket & { usuario_id: number; servicio_id: number; servicio: string; horas: number })[]
      >(
        `SELECT a.usuario_id, s.id AS servicio_id, s.nombre AS servicio, a.horas
           FROM presupuesto_asignaciones a
           JOIN presupuesto_servicios s ON s.id = a.servicio_id
          WHERE a.estado = 'CONFIRMADA' AND a.usuario_id IS NOT NULL
            AND s.presupuesto_id IN (${idsPresupuesto.map(() => '?').join(',')})
            AND s.origen <> 'CONSOLIDADO'`,
        idsPresupuesto
      )
    : [[]]

  // Las asignaciones se cuentan solo sobre bolsas ACTIVAS. Mientras el
  // presupuesto este en revision las horas son una propuesta: mostrarlas como
  // "disponibles" haría creer que ya hay capacidad comprometida.
  const hayBolsasActivas = filasServicio.some((s) => s.activo && s.origen !== 'CONSOLIDADO')

  const equipo: FilaIntegrante[] = participantes.map((p) => {
    const mio = asignaciones.filter((a) => a.usuario_id === p.usuario_id)
    const asignado = hayBolsasActivas ? sumar(mio.map((a) => a.horas)) : 0
    const r = registroPorUsuario.get(p.usuario_id) ?? { registrado: 0, aprobado: 0, pendiente: 0 }
    const disponible = hayBolsasActivas ? n(asignado - r.registrado) : null
    const consumo = asignado > 0 ? Math.min(100, Math.round((r.registrado / asignado) * 100)) : 0
    return {
      usuarioId: p.usuario_id,
      nombre: p.nombre,
      cargo: p.cargo,
      rolProyecto: p.rol_proyecto,
      // Lo repartido aunque la bolsa siga inactiva, para que el Lider vea qué
      // falta por decidir sin que parezca contrato.
      asignado,
      propuesto: sumar(mio.map((a) => a.horas)),
      registrado: r.registrado,
      aprobado: r.aprobado,
      disponible,
      desviacion: hayBolsasActivas ? n(r.registrado - asignado) : 0,
      porcentaje: consumo,
      porServicio: mio.map((a) => ({ servicioId: a.servicio_id, servicio: a.servicio, horas: n(a.horas) })),
    }
  })

  // --- asignaciones que todavia no tienen persona -------------------------
  const sinResolver: AsignacionSinResolver[] = []
  if (idsPresupuesto.length) {
    const [pendientes] = await pool.query<
      (RowDataPacket & { id: number; servicio: string; etiqueta: string | null; categoria: string | null; horas: string; motivo: string | null })[]
    >(
      `SELECT a.id, s.nombre AS servicio, a.nombre_texto AS etiqueta, a.categoria, a.horas, a.motivo
         FROM presupuesto_asignaciones a
         JOIN presupuesto_servicios s ON s.id = a.servicio_id
        WHERE a.estado = 'PENDIENTE_REVISION'
          AND s.presupuesto_id IN (${idsPresupuesto.map(() => '?').join(',')})
          AND s.origen <> 'CONSOLIDADO'
        ORDER BY s.nombre, a.horas DESC`,
      idsPresupuesto
    )
    for (const p of pendientes) {
      sinResolver.push({
        id: p.id,
        servicio: p.servicio,
        etiqueta: p.etiqueta,
        categoria: p.categoria,
        horas: n(p.horas),
        motivo: p.motivo,
      })
    }
  }

  // --- desviaciones --------------------------------------------------------
  const desviaciones: Desviacion[] = []
  for (const i of equipo) {
    if (i.asignado === 0) continue
    if (i.registrado > i.asignado) {
      desviaciones.push({
        usuarioId: i.usuarioId,
        nombre: i.nombre,
        tipo: 'integrante',
        asignado: i.asignado,
        registrado: i.registrado,
        desviacion: i.desviacion,
        porcentaje: Math.round(((i.desviacion / i.asignado) * 100) * 10) / 10,
        detalle: `Tiene ${i.asignado} h asignadas y ha registrado ${i.registrado} h.`,
      })
    }
  }
  for (const s of filasServicio) {
    if (s.origen === 'CONSOLIDADO' || s.asignadoPorUsuario === 0) continue
    if (s.registrado > s.asignadoPorUsuario) {
      desviaciones.push({
        usuarioId: null,
        nombre: s.nombre,
        tipo: 'servicio',
        asignado: s.asignadoPorUsuario,
        registrado: s.registrado,
        desviacion: s.desviacion,
        porcentaje: Math.round(((s.desviacion / s.asignadoPorUsuario) * 100) * 10) / 10,
        detalle: `Servicio con ${s.asignadoPorUsuario} h repartidas y ${s.registrado} h registradas.`,
      })
    }
  }

  // --- planificación (Gantt) ----------------------------------------------
  const [plan] = await pool.query<
    (RowDataPacket & { subetapa: string; etapa: string | null; horas: string; semana_inicio: number | null; semana_fin: number | null; mes: string | null; presupuesto_servicio_id: number | null })[]
  >(
    `SELECT pp.subetapa, pp.etapa, pp.horas, pp.semana_inicio, pp.semana_fin, pp.mes,
            pp.presupuesto_servicio_id
       FROM presupuesto_planificacion pp
      WHERE pp.proyecto_id = ?
      ORDER BY COALESCE(pp.semana_inicio, 999), pp.id`,
    [proyectoId]
  )

  // Las sub-etapas se muestran tal como vienen del Excel. NO se vinculan a un
  // servicio adivinando por parecido de texto: una coincidencia inventada
  // moveria horas de un servicio a otro y contaminaria el consumo. Quedan
  // explicitamente "sin servicio identificado" hasta que exista una relacion
  // guardada en la base de datos.
  const planificacion = plan.map((p) => ({
    subetapa: p.subetapa,
    etapa: p.etapa,
    horas: n(p.horas),
    semanaInicio: p.semana_inicio,
    semanaFin: p.semana_fin,
    mes: p.mes,
    servicioId: p.presupuesto_servicio_id,
  }))

  // --- indicadores ---------------------------------------------------------
  const horasContratadas = n(
    filasServicio.filter((s) => s.activo && s.origen !== 'CONSOLIDADO').reduce((t, s) => t + s.horas, 0)
  )
  const horasPropuestas = n(
    filasServicio
      .filter((s) => !s.activo && s.origen !== 'CONSOLIDADO')
      .reduce((t, s) => t + s.horas, 0)
  )
  const horasRegistradas = n(equipo.reduce((t, i) => t + i.registrado, 0))
  const horasAprobadas = n(equipo.reduce((t, i) => t + i.aprobado, 0))
  const horasPendientes = n(equipo.reduce((t, i) => t + (registroPorUsuario.get(i.usuarioId)?.pendiente ?? 0), 0))
  const asignadasTotales = sumar(equipo.map((i) => i.asignado))
  // Un proyecto que aun no ha ejecutado nada no tiene desviacion: tiene horas
  // sin empezar. Reportar "0 - 238 = -238 h (-100%)" como desviation seria una
  // alarma falsa, asi que cuando no hay consumo la cifra se declara nula.
  const desviacionHoras = horasRegistradas > 0 ? n(horasRegistradas - asignadasTotales) : null
  const desviacionPorcentaje =
    desviacionHoras === null || asignadasTotales <= 0
      ? null
      : Math.round((desviacionHoras / asignadasTotales) * 1000) / 10

  return {
    proyecto: {
      id: proyecto.id,
      nombre: proyecto.nombre,
      cliente: proyecto.cliente ?? 'Sin cliente',
      clienteId: proyecto.cliente_id ?? 0,
      area: proyecto.area,
      lider: proyecto.lider ?? 'Sin líder',
      liderId: proyecto.lider_id ?? 0,
      estado: proyecto.estado,
      fechaInicio: fecha(proyecto.fecha_inicio),
      fechaFin: fecha(proyecto.fecha_fin),
    },
    presupuestos: listaPresupuestos,
    presupuestosDisponibles: disponibles.map((d) => ({ id: d.id, version: d.version, archivoNombre: d.archivo_nombre })),
    indicadores: {
      horasContratadas,
      horasPropuestas,
      horasRegistradas,
      horasAprobadas,
      horasPendientesAprobacion: horasPendientes,
      horasDisponibles: n(horasContratadas - horasRegistradas),
      desviacionHoras,
      desviacionPorcentaje,
      cronogramaConFechas: fecha(proyecto.fecha_inicio) !== null,
    },
    equipo,
    servicios: filasServicio,
    sinResolver,
    desviaciones,
    planificacion,
    permisos: {
      puedeGestionar: opciones.puedeGestionar,
      esAdmin: opciones.esAdmin,
      puedeVerImportes: opciones.puedeVerImportes,
      motivo: opciones.puedeGestionar
        ? 'Eres el Líder del proyecto.'
        : opciones.esAdmin
          ? 'Como administrador puedes actuar, pero quedará registrado como excepción.'
          : 'Solo el Líder del proyecto puede aprobar, activar y repartir horas.',
    },
  }
}
