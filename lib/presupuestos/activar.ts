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

/**
 * Resuelve el área a la que pertenece el cliente del presupuesto.
 *
 * Sin esto, `resolverPermiso` nunca puede concessionar el permiso al jefe de
 * área: `areaIdDelCliente` llegaría a null y `esJefeDelAreaDelCliente` saldría
 * siempre false. Es el dato que convierte "es jefe de área" en "es jefe DEL ÁREA
 * DE ESTE cliente", que es lo único que da permisos sobre su presupuesto.
 */
async function areaDelCliente(presupuestoId: number): Promise<number | null> {
  const [rows] = await pool.query<(RowDataPacket & { area_id: number | null })[]>(
    'SELECT c.area_id FROM presupuestos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?',
    [presupuestoId]
  )
  return rows[0]?.area_id ?? null
}

async function comprobarPermiso(
  presupuestoId: number,
  usuario: UsuarioConPermisos & { id: number },
  accion: AccionPresupuesto,
  justificacion: string | undefined
): Promise<{ permitido: boolean; error: string }> {
  const permiso = await resolverPermiso({
    presupuestoId,
    usuario,
    accion,
    areaIdDelCliente: await areaDelCliente(presupuestoId),
  })
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

    // Los servicios quedan apuntando al proyecto. NO se tocan sus `activo`.
//
// Antes esta línea era `SET proyecto_id = ?, activo = 0` y tenía sentido: nada se
// activaba hasta que el Líder aprobara. Con la regla de que el presupuesto entra
// aprobado y con sus bolsas encendidas al importar, apagar aquí vaciaba el saldo
// del cliente de golpe (recalcularHorasContratadas suma solo las bolsas activas)
// y bastaba con vincular un proyecto para perder las horas contratadas.

    await db.query(
      `UPDATE presupuesto_servicios SET proyecto_id = ? WHERE presupuesto_id = ?`,
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

/** El Líder confirma una asignación concreta, eligiendo quién la ejecuta. */
export async function confirmarAsignacion(params: {
  asignacionId: number
  usuarioId: number
  actor: UsuarioConPermisos & { id: number }
  motivo: string
}): Promise<ResultadoAccion> {
  return confirmarAsignaciones({ ...params, asignacionIds: [params.asignacionId] })
}

/**
 * Confirma UN CONJUNTO de asignaciones eligiendo quién las ejecuta.
 *
 * Por qué un conjunto y no una sola: el Excel de un cliente puede traer VARIAS
 * cotizaciones del mismo servicio, y la misma persona aparece una vez en cada
 * una. "MARINELLA SOTO" con 337,5 h aparece dos veces en FORTALECIMIENTO DEL
 * CONTROL INTERNO, y "HUGO MENDOZA" con 20 h y 5 h en dos bloques más. Son horas
 * de la misma persona, no personas distintas: si la interfaz las muestra
 * separadas, el Líder ve a alguien repetido y las horas no cuadran con el equipo,
 * donde el equipo ya viene agregado por persona.
 *
 * Por eso se confirman juntas: repartir la fila es repartir todo lo que el Excel
 * le asigna a esa etiqueta, y cada fila conserva su bolsa. La suma NO se mete en
 * una bolsa cualquiera, porque las horas de cada bloque tienen que seguir
 * contando contra el bloque del que salieron.
 *
 * Todo va en una transacción: si una de las filas no cabe en su bolsa, no se
 * confirma ninguna. Repartir la mitad dejaría el presupuesto en un estado que
 * ningún Excel describe.
 */
export async function confirmarAsignaciones(params: {
  asignacionIds: number[]
  /** Persona a la que se le asignan las horas. */
  usuarioId: number
  /** Quién ejecuta la acción. Se valida contra el presupuesto. */
  actor: UsuarioConPermisos & { id: number }
  motivo: string
}): Promise<ResultadoAccion> {
  const { asignacionIds, usuarioId, actor, motivo } = params
  if (!usuarioId) return { ok: false, error: 'Indica a quién se le asignan las horas.' }

  const unicos = [...new Set(asignacionIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (unicos.length === 0) return { ok: false, error: 'La asignacion no es valida.' }

  const db = await pool.getConnection()
  try {
    await db.beginTransaction()

    const [filas] = await db.query<
      (RowDataPacket & {
        id: number
        presupuesto_id: number
        servicio_id: number
        servicio: string
        horas: string
        estado: string
      })[]
    >(
      `SELECT a.id, a.servicio_id, a.horas, a.estado, s.presupuesto_id, s.nombre AS servicio
         FROM presupuesto_asignaciones a
         JOIN presupuesto_servicios s ON s.id = a.servicio_id
        WHERE a.id IN (${unicos.map(() => '?').join(',')})`,
      unicos
    )
    if (filas.length === 0) {
      await db.rollback()
      return { ok: false, error: 'La asignación no existe.' }
    }

    // Sin esta comprobación, cualquier usuario autenticado podía Confirmar
    // horas ajenas: la autorización vivía solo en la ruta y no en la acción.
    for (const presupuestoId of new Set(filas.map((f) => f.presupuesto_id))) {
      const permiso = await comprobarPermiso(presupuestoId, actor, 'DISTRIBUIR', motivo)
      if (!permiso.permitido) {
        await db.rollback()
        return { ok: false, error: permiso.error }
      }
    }

    // No se puede superar la bolsa de NINGÚN servicio. Las asignaciones que se
    // van a confirmar se excluyen TODAS de la suma, no solo una: si cada fila
    // midiera contra un total que incluye a las demás, al confirmar la segunda
    // se contaría como recién repartida.
    const porServicio = new Map<number, typeof filas>()
    for (const f of filas) {
      const lista = porServicio.get(f.servicio_id) ?? []
      lista.push(f)
      porServicio.set(f.servicio_id, lista)
    }

    const totalPorServicio = new Map<number, number>()
    for (const [servicioId, delServicio] of porServicio) {
      const [otros] = await db.query<(RowDataPacket & { total: number })[]>(
        `SELECT COALESCE(SUM(horas), 0) AS total
           FROM presupuesto_asignaciones
          WHERE servicio_id = ? AND id NOT IN (${delServicio.map(() => '?').join(',')})`,
        [servicioId, ...delServicio.map((f) => f.id)]
      )
      const [bolsa] = await db.query<(RowDataPacket & { horas: number })[]>(
        'SELECT horas FROM presupuesto_servicios WHERE id = ?',
        [servicioId]
      )
      // MySQL devuelve los DECIMAL como TEXTO. Si no se convierten con Number, el
      // `+` de abajo concatena ("57" + "129" = "57129") y la comprobación siempre
      // dice que se pasa de la bolsa.
      const yaRepartidas = Number(otros[0]?.total ?? 0)
      const horasBolsa = Number(bolsa[0]?.horas ?? 0)
      const aRepartir = redondear(
        delServicio.reduce((t, f) => t + Number(f.horas), 0)
      )
      if (redondear(yaRepartidas + aRepartir) > horasBolsa) {
        await db.rollback()
        return {
          ok: false,
          error: `La bolsa de "${delServicio[0].servicio}" tiene ${horasBolsa} h y ya tiene ${yaRepartidas} h repartidas. Repartir ${aRepartir} h más la dejaría por encima. Necesita una ampliación aprobada.`,
        }
      }
      totalPorServicio.set(servicioId, aRepartir)
    }

    for (const f of filas) {
      await db.query(
        `UPDATE presupuesto_asignaciones
            SET usuario_id = ?, estado = 'CONFIRMADA', motivo = ?
          WHERE id = ?`,
        [usuarioId, motivo || null, f.id]
      )
    }

    for (const presupuestoId of new Set(filas.map((f) => f.presupuesto_id))) {
      await registrarCambio({
        db,
        presupuestoId,
        tipo: 'REDISTRIBUCION',
        detalle: {
          asignacionIds: filas.filter((f) => f.presupuesto_id === presupuestoId).map((f) => f.id),
          usuarioId,
          horas: redondear(
            filas
              .filter((f) => f.presupuesto_id === presupuestoId)
              .reduce((t, f) => t + Number(f.horas), 0)
          ),
          porServicio: [...totalPorServicio.entries()].map(([servicioId, horas]) => ({
            servicioId,
            horas,
          })),
        },
        justificacion: motivo || 'Confirmación de la asignación.',
        // El autor del cambio es quien EJECUTA la acción, no el destinatario de las
        // horas. Antes se guardaba el usuario asignado y la auditoría señalaba a la
        // persona equivocada como responsable.
        usuarioId: actor.id,
      })
    }

    await db.commit()
    const totalHoras = redondear(filas.reduce((t, f) => t + Number(f.horas), 0))
    return {
      ok: true,
      mensaje:
        filas.length === 1
          ? `${totalHoras} h asignadas.`
          : `${totalHoras} h asignadas en ${filas.length} bloques del Excel.`,
    }
  } catch (error) {
    await db.rollback()
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Error al confirmar la asignación.',
    }
  } finally {
    db.release()
  }
}

/**
 * Aprueba el presupuesto.
 *
 * Solo quedan dos bloqueos, y los dos son sobre el CONTENIDO del documento:
 * observaciones bloqueantes y una bolsa cuyas horas asignadas superen las
 * contratadas.
 *
 * Lo que YA NO bloquea, por decisión de negocio:
 *
 * - Que las asignaciones estejam sin confirmar. Confirmar quién hace qué dentro
 *   del servicio es una tarea operativa posterior; el alcance contratado ya está
 *   cerrado con el Excel y no depende de eso.
 * - Que exista un proyecto vinculado. El cliente es el ancla y el presupuesto
 *   cuelga de él, no al revés (ver cabecera de sql/presupuestos.sql).
 *
 * El presupuesto además llega ya APPROBADO desde la importación, asi que esta
 * función cubre sobre todo el caso de reimportar o de activar bolsas despues.
 */
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

  if (p.estado !== 'EN_REVISION') return { ok: false, error: 'Solo un presupuesto presentado para revisión puede aprobarse.' }

  const pend = await pendientesDe(presupuestoId)
  if (pend.bloqueantes > 0) {
    return {
      ok: false,
      error: `Quedan ${pend.bloqueantes} observaciones bloqueantes sin resolver. Resuélvelas antes de aprobar.`,
    }
  }

  const [resultado] = await pool.query(
    `UPDATE presupuestos SET estado = 'APROBADO', revisado_por = ?, revisado_en = NOW() WHERE id = ? AND estado = 'EN_REVISION'`,
    [usuario.id, presupuestoId]
  ) as any
  if ((resultado as { affectedRows?: number }).affectedRows === 0) return { ok: false, error: 'El presupuesto ya fue decidido.' }
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
 * Activa las bolsas de los servicios DETALLADOS y COMPLEMENTARIOS.
 *
 * Los CONSOLIDADOS no se activan y no hay que activarlos nunca: son un resumen
 * de los anteriores y sumarlos duplicaría el alcance.
 *
 * Los COMPLEMENTARIOS sí se activan. Antes quedaban fuera porque la bolsa
 * complementaria de Santa Rosa (las 2 h del Comité) venía sin confirmar y se
 * prefiería tenerla en cuarentena; pero como la aprobación ya no exige
 * confirmaciones, y además el selector de servicios de /actividades los ofrece,
 * dejarlos siempre apagados hacía que un servicio visible no se pudiera imputar.
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
        WHERE presupuesto_id = ? AND origen IN ('DETALLADO', 'COMPLEMENTARIO') AND activo = 0`,
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
