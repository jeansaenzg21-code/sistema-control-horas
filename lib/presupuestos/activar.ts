// Vinculación, aprobación y activación de las bolsas de un presupuesto.
//
// Las reglas que este archivo respeta:
//
// 1. Un presupuesto con observaciones BLOQUEANTES o con asignaciones sin
//    confirmar NO se aprueba. Se queda en OBSERVADO.
//
// 2. Activar bolsas NO significa "dar por contratadas todas las horas del
//    documento". Solo se activan las que están confirmadas. Las 2 horas
//    complementarias de Santa Rosa no cuentan hasta que el Líder las confirme,
//    y ese es justo el motivo por el que existe la observación bloqueante.
//
// 3. `clientes.horas_contratadas` es UN solo número para todo el cliente, así que
//    no se escribe al aprobar un presupuesto: se RECALCULA sumando las bolsas
//    activadas de todos sus proyectos. Si no, al aprobar el segundo proyecto se
//    pisaría el saldo del primero.
//
// 4. La suma de asignaciones de un servicio no puede pasar de las horas de la
//    bolsa. Si se pasa, hace falta una ampliación aprobada.

import type { RowDataPacket } from 'mysql2'

import pool from '@/lib/db'
import type { UsuarioConPermisos } from '@/lib/permisos'
import { resolverPermiso, type AccionPresupuesto } from '@/lib/presupuestos/permisos'

export type ResultadoAccion = { ok: true; mensaje: string } | { ok: false; error: string }

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

type Ejecutor = Pick<typeof pool, 'query' | 'execute'>

async function presupuestoCliente(
  presupuestoId: number,
  db: Ejecutor = pool
): Promise<{ id: number; cliente_id: number; estado: string; analisis: string | null } | null> {
  const [rows] = await db.query<
    (RowDataPacket & { id: number; cliente_id: number; estado: string; analisis: string | null })[]
  >('SELECT id, cliente_id, estado, analisis FROM presupuestos WHERE id = ?', [presupuestoId])
  return rows[0] ?? null
}

/** Observaciones bloqueantes y asignaciones sin confirmar de un presupuesto. */
export async function pendientesDe(presupuestoId: number): Promise<{
  bloqueantes: number
  sinConfirmar: number
  horasSinConfirmar: number
}> {
  const [obs] = await pool.query<(RowDataPacket & { n: number })[]>(
    'SELECT COUNT(*) AS n FROM presupuesto_cambios WHERE presupuesto_id = ? AND tipo = ?',
    [presupuestoId, 'OBSERVACION']
  )
  // Las observaciones viven en `presupuestos.analisis`.
  const p = await presupuestoCliente(presupuestoId)
  let bloqueantes = 0
  if (p?.analisis) {
    try {
      const a = JSON.parse(p.analisis) as {
        observaciones?: { severidad: string; mensaje: string }[]
      }
      bloqueantes = (a.observaciones ?? []).filter((o) => o.severidad === 'BLOQUEANTE').length
    } catch {
      bloqueantes = 0
    }
  }
  void obs

  const [asig] = await pool.query<(RowDataPacket & { n: number; horas: number })[]>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(a.horas), 0) AS horas
       FROM presupuesto_asignaciones a
       JOIN presupuesto_servicios s ON s.id = a.servicio_id
      WHERE s.presupuesto_id = ?
        AND a.estado = 'PENDIENTE_REVISION'
        AND s.origen <> 'CONSOLIDADO'`,
    [presupuestoId]
  )
  // Se excluyen los CONSOLIDADOS a proposito: sus asignaciones son un reflejo
  // de los bloques detallados, no horas que alguien vaya a ejecutar, y no se
  // reparten. Contarlas haria que el presupuesto no se pudiera aprobar nunca.

  return {
    bloqueantes,
    sinConfirmar: Number(asig[0]?.n ?? 0),
    horasSinConfirmar: redondear(Number(asig[0]?.horas ?? 0)),
  }
}

async function registrarCambio(params: {
  db: Ejecutor
  presupuestoId: number
  servicioId?: number | null
  tipo: 'VINCULO_PROYECTO' | 'APROBACION' | 'OBSERVACION' | 'REDISTRIBUCION' | 'AMPLIACION'
  detalle: unknown
  justificacion: string
  usuarioId: number
}): Promise<void> {
  // IMPORTANTE: usa la MISMA conexión que la transacción abierta. Con el pool
  // por dentro, el INSERT de otra conexión se queda esperando la FK sobre una
  // fila que la transacción tiene bloqueada y se produce un "Lock wait timeout".
  await params.db.query(
    `INSERT INTO presupuesto_cambios (presupuesto_id, servicio_id, tipo, detalle, justificacion, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.presupuestoId,
      params.servicioId ?? null,
      params.tipo,
      JSON.stringify(params.detalle),
      params.justificacion,
      params.usuarioId,
    ]
  )
}

async function comprobarPermiso(
  presupuestoId: number,
  usuario: UsuarioConPermisos & { id: number },
  accion: AccionPresupuesto,
  justificacion: string | undefined
): Promise<{ permitido: boolean; error: string }> {
  const permiso = await resolverPermiso({ presupuestoId, usuario, accion })
  if (!permiso.permitido) return { permitido: false, error: permiso.motivo }
  if (permiso.esExcepcion) {
    if (!justificacion || justificacion.trim().length < 10) {
      return {
        permitido: false,
        error:
          'Actúas como administrador y no eres el Líder del proyecto. Necesitas escribir una justificación de al menos 10 caracteres para que quede registrada.',
      }
    }
  }
  return { permitido: true, error: '' }
}

/** Vincula el presupuesto a un proyecto y designa a su Líder. Solo ADMIN. */
export async function vincularProyecto(params: {
  presupuestoId: number
  proyectoId: number
  liderId: number
  usuario: UsuarioConPermisos & { id: number }
  justificacion: string
}): Promise<ResultadoAccion> {
  const { presupuestoId, proyectoId, liderId, usuario, justificacion } = params

  const permiso = await comprobarPermiso(presupuestoId, usuario, 'VINCULAR', justificacion)
  if (!permiso.permitido) return { ok: false, error: permiso.error }

  const db = await pool.getConnection()
  try {
    await db.beginTransaction()

    // El proyecto tiene que pertenecer al mismo cliente que el presupuesto.
    const [filas] = await db.query<
      (RowDataPacket & { cliente_id: number | null; nombre: string })[]
    >('SELECT cliente_id, nombre FROM proyectos WHERE id = ? AND activo = TRUE', [proyectoId])
    const proyecto = filas[0]
    if (!proyecto) {
      await db.rollback()
      return { ok: false, error: 'El proyecto no existe.' }
    }
    const p = await presupuestoCliente(presupuestoId, db)
    if (!p) {
      await db.rollback()
      return { ok: false, error: 'El presupuesto no existe.' }
    }
    if (proyecto.cliente_id !== p.cliente_id) {
      await db.rollback()
      return {
        ok: false,
        error: `El proyecto "${proyecto.nombre}" pertenece a otro cliente que el presupuesto.`,
      }
    }

    // El Líder queda como LIDER del proyecto. Si ya había uno, se cambia y queda
    // en el historial.
    const [liderActual] = await db.query<(RowDataPacket & { usuario_id: number })[]>(
      `SELECT usuario_id FROM proyecto_participantes
        WHERE proyecto_id = ? AND rol_proyecto = 'LIDER'`,
      [proyectoId]
    )

    await db.query(
      `UPDATE proyecto_participantes SET rol_proyecto = 'COORDINADOR'
        WHERE proyecto_id = ? AND rol_proyecto = 'LIDER' AND usuario_id <> ?`,
      [proyectoId, liderId]
    )
    await db.query(
      `INSERT INTO proyecto_participantes (proyecto_id, usuario_id, rol_proyecto)
       VALUES (?, ?, 'LIDER')
       ON DUPLICATE KEY UPDATE rol_proyecto = 'LIDER'`,
      [proyectoId, liderId]
    )

    // Los servicios quedan apuntando al proyecto, pero INACTIVOS: nada se activa
    // hasta que el Líder lo apruebe.
    await db.query(
      `UPDATE presupuesto_servicios SET proyecto_id = ?, activo = 0 WHERE presupuesto_id = ?`,
      [proyectoId, presupuestoId]
    )
    await db.query(
      `UPDATE presupuesto_planificacion SET proyecto_id = ? WHERE presupuesto_id = ?`,
      [proyectoId, presupuestoId]
    )

    await db.query(
      `UPDATE presupuestos SET estado = 'EN_REVISION' WHERE id = ? AND estado = 'BORRADOR'`,
      [presupuestoId]
    )

    await registrarCambio({
      db,
      presupuestoId,
      tipo: 'VINCULO_PROYECTO',
      detalle: { proyectoId, liderId, liderAnterior: liderActual.map((l) => l.usuario_id) },
      justificacion: justificacion || 'Vinculación inicial y designación del Líder.',
      usuarioId: usuario.id,
    })

    await db.commit()
    return {
      ok: true,
      mensaje: `Presupuesto vinculado a "${proyecto.nombre}". Sigue en revisión: el Líder debe confirmar las asignaciones y aprobarlo.`,
    }
  } catch (error) {
    await db.rollback()
    return { ok: false, error: error instanceof Error ? error.message : 'Error al vincular.' }
  } finally {
    db.release()
  }
}

/** El Líder confirma una asignación concreta, choosing quién la ejecuta. */
export async function confirmarAsignacion(params: {
  asignacionId: number
  usuarioId: number
  motivo: string
}): Promise<ResultadoAccion> {
  const { asignacionId, usuarioId, motivo } = params
  if (!usuarioId) return { ok: false, error: 'Indica a quién se le asignan las horas.' }

  const [filas] = await pool.query<
    (RowDataPacket & { presupuesto_id: number; nombre: string; horas: number })[]
  >(
    `SELECT s.presupuesto_id, s.nombre, a.horas
       FROM presupuesto_asignaciones a
       JOIN presupuesto_servicios s ON s.id = a.servicio_id
      WHERE a.id = ?`,
    [asignacionId]
  )
  const a = filas[0]
  if (!a) return { ok: false, error: 'La asignación no existe.' }

  // No se puede superar la bolsa del servicio.
  // La asignación que se está confirmando se EXCLUYE de la suma: si no, sus
  // propias horas se contarían dos veces y la comprobación siempre fallaría
  // (186 h repartidas + 129 h = 315 h sobre una bolsa de 186 h).
  const [otros] = await pool.query<(RowDataPacket & { total: number })[]>(
    `SELECT COALESCE(SUM(horas), 0) AS total
       FROM presupuesto_asignaciones
      WHERE servicio_id = (SELECT servicio_id FROM presupuesto_asignaciones WHERE id = ?)
        AND id <> ?`,
    [asignacionId, asignacionId]
  )
  const [bolsa] = await pool.query<(RowDataPacket & { horas: number })[]>(
    `SELECT horas FROM presupuesto_servicios
      WHERE id = (SELECT servicio_id FROM presupuesto_asignaciones WHERE id = ?)`,
    [asignacionId]
  )
  // MySQL devuelve los DECIMAL como TEXTO. Si no se convierten con Number, el
  // `+` de abajo concatena ("57" + "129" = "57129") y la comprobación siempre
  // dice que se pasa de la bolsa.
  const horasAsignacion = Number(a.horas)
  const yaRepartidas = Number(otros[0]?.total ?? 0)
  const horasBolsa = Number(bolsa[0]?.horas ?? 0)
  if (redondear(yaRepartidas + horasAsignacion) > horasBolsa) {
    return {
      ok: false,
      error: `La bolsa de "${a.nombre}" tiene ${horasBolsa} h y ya tiene ${yaRepartidas} h repartidas. Repartir ${horasAsignacion} h más la dejaría por encima. Necesita una ampliación aprobada.`,
    }
  }

  await pool.query(
    `UPDATE presupuesto_asignaciones
        SET usuario_id = ?, estado = 'CONFIRMADA', motivo = ?
      WHERE id = ?`,
    [usuarioId, motivo || null, asignacionId]
  )
  await registrarCambio({
    db: pool,
    presupuestoId: a.presupuesto_id,
    tipo: 'REDISTRIBUCION',
    detalle: { asignacionId, usuarioId, horas: a.horas },
    justificacion: motivo || 'Confirmación de la asignación.',
    usuarioId: usuarioId,
  })
  return { ok: true, mensaje: `${horasAsignacion} h asignadas.` }
}

/** El Líder aprueba el presupuesto. Solo si no queda nada bloqueante. */
export async function aprobarPresupuesto(params: {
  presupuestoId: number
  usuario: UsuarioConPermisos & { id: number }
  justificacion: string
}): Promise<ResultadoAccion> {
  const { presupuestoId, usuario, justificacion } = params

  const permiso = await comprobarPermiso(presupuestoId, usuario, 'APROBAR', justificacion)
  if (!permiso.permitido) return { ok: false, error: permiso.error }

  const p = await presupuestoCliente(presupuestoId)
  if (!p) return { ok: false, error: 'El presupuesto no existe.' }

  const pend = await pendientesDe(presupuestoId)
  if (pend.bloqueantes > 0) {
    return {
      ok: false,
      error: `Quedan ${pend.bloqueantes} observaciones bloqueantes sin resolver. Resuélvelas antes de aprobar.`,
    }
  }
  if (pend.sinConfirmar > 0) {
    return {
      ok: false,
      error: `Quedan ${pend.sinConfirmar} asignaciones sin confirmar (${pend.horasSinConfirmar} h). Confírmalas o déjalas sin asignar antes de aprobar.`,
    }
  }

  const [vínculo] = await pool.query<(RowDataPacket & { proyecto_id: number | null })[]>(
    'SELECT proyecto_id FROM presupuesto_servicios WHERE presupuesto_id = ? AND proyecto_id IS NOT NULL LIMIT 1',
    [presupuestoId]
  )
  if (!vínculo[0]?.proyecto_id) {
    return {
      ok: false,
      error: 'El presupuesto todavía no está vinculado a un proyecto ni tiene Líder designado.',
    }
  }

  await pool.query(
    `UPDATE presupuestos SET estado = 'APROBADO', revisado_por = ?, revisado_en = NOW() WHERE id = ?`,
    [usuario.id, presupuestoId]
  )
  await registrarCambio({
    db: pool,
    presupuestoId,
    tipo: 'APROBACION',
    detalle: { pendientes: pend },
    justificacion: justificacion || 'Aprobación del alcance contratado.',
    usuarioId: usuario.id,
  })
  return { ok: true, mensaje: 'Presupuesto aprobado.' }
}

/**
 * Activa las bolsas de los servicios DETALLADOS ya confirmados.
 *
 * Los COMPLEMENTARIOS y los CONSOLIDADOS no se activan: los complementarios
 * esperan confirmación y los consolidados son referencia. Por eso las 2 horas
 * pendientes no entran en el saldo.
 */
export async function activarBolsas(params: {
  presupuestoId: number
  usuario: UsuarioConPermisos & { id: number }
  justificacion: string
}): Promise<ResultadoAccion> {
  const { presupuestoId, usuario, justificacion } = params

  const permiso = await comprobarPermiso(presupuestoId, usuario, 'ACTIVAR_BOLSAS', justificacion)
  if (!permiso.permitido) return { ok: false, error: permiso.error }

  const p = await presupuestoCliente(presupuestoId)
  if (!p) return { ok: false, error: 'El presupuesto no existe.' }
  if (p.estado !== 'APROBADO') {
    return { ok: false, error: 'Primero hay que aprobar el presupuesto.' }
  }

  const db = await pool.getConnection()
  try {
    await db.beginTransaction()

    const [servicios] = await db.query<
      (RowDataPacket & { id: number; nombre: string; horas: number })[]
    >(
      `SELECT id, nombre, horas FROM presupuesto_servicios
        WHERE presupuesto_id = ? AND origen = 'DETALLADO' AND activo = 0`,
      [presupuestoId]
    )

    let total = 0
    for (const s of servicios) {
      await db.query('UPDATE presupuesto_servicios SET activo = 1 WHERE id = ?', [s.id])
      total += Number(s.horas)
    }

    // El saldo del cliente se RECALCULA sobre todos sus proyectos, no se
    // sobrescribe con el total de este presupuesto.
    await recalcularHorasContratadas(db, p.cliente_id)

    await db.query(
      `UPDATE presupuestos SET estado = 'APROBADO' WHERE id = ?`,
      [presupuestoId]
    )
    await db.query(
      `INSERT INTO presupuesto_cambios (presupuesto_id, tipo, detalle, justificacion, usuario_id)
       VALUES (?, 'APROBACION', ?, ?, ?)`,
      [
        presupuestoId,
        JSON.stringify({ servicios: servicios.length, horas: redondear(total) }),
        justificacion || 'Activación de las bolsas de horas.',
        usuario.id,
      ]
    )

    await db.commit()
    return {
      ok: true,
      mensaje: `${servicios.length} bolsas activadas con ${redondear(total)} h. El saldo del cliente se recalculó con todos sus proyectos.`,
    }
  } catch (error) {
    await db.rollback()
    return { ok: false, error: error instanceof Error ? error.message : 'Error al activar.' }
  } finally {
    db.release()
  }
}

/**
 * Recalcula `clientes.horas_contratadas` como la suma de las bolsas ACTIVAS de
 * TODOS los proyectos del cliente.
 *
 * Se recalcula, no se suma a ciegas ni se sobrescribe con un presupuesto: si el
 * cliente tiene dos proyectos, aprobar el segundo no puede pisar el saldo del
 * primero.
 *
 * Cuentan los DETALLADOS y los COMPLEMENTARIOS ya confirmados. Los CONSOLIDADOS
 * quedan fuera siempre: son un resumen de los anteriores y sumarlos duplicaría
 * el alcance (270 h reales convertidas en 542 h).
 */
export async function recalcularHorasContratadas(
  db: Pick<typeof pool, 'query'>,
  clienteId: number
): Promise<number> {
  const [filas] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COALESCE(SUM(s.horas), 0) AS total
       FROM presupuesto_servicios s
       JOIN presupuestos p ON p.id = s.presupuesto_id
      WHERE p.cliente_id = ?
        AND s.activo = 1
        AND s.origen IN ('DETALLADO', 'COMPLEMENTARIO')`,
    [clienteId]
  )
  const total = redondear(Number(filas[0]?.total ?? 0))
  await db.query('UPDATE clientes SET horas_contratadas = ? WHERE id = ?', [total, clienteId])
  return total
}
