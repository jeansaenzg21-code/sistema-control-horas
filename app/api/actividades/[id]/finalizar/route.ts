import { NextResponse } from 'next/server'
import { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { registrarAuditoria } from '@/lib/auditoria'
import { notifyActivityChange } from '@/lib/events'
import { notificarBolsaHorasPorId } from '@/lib/bolsa-alertas'
import { notificarRevisoresActividad } from '@/lib/notificaciones'
import { validarMarcaTiempoCliente } from '@/lib/operaciones-moviles'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { id } = await params

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const marcaFin = validarMarcaTiempoCliente(body.fin, 'hora de finalización')
    if (marcaFin !== null && !marcaFin.ok) {
      return NextResponse.json({ error: marcaFin.error }, { status: 400 })
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.usuario_id, a.estado, a.inicio
       FROM actividades a
       INNER JOIN usuarios u ON u.id = a.usuario_id
       INNER JOIN areas ar ON ar.id = u.area_id
       WHERE a.id = ? AND ar.empresa_id = ?`,
      [id, context.activa.id]
    )
    const actividades = rows as Array<Record<string, unknown>>
    if (actividades.length === 0) return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
    if (Number(actividades[0].usuario_id) !== user.id) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

    const estado = actividades[0].estado as string
    if (estado !== 'EN_CURSO' && estado !== 'PAUSADA') {
      // Ya está cerrada. Es el caso normal de un reintento: la primera
      // petición sí se guardó pero la respuesta se perdió. Se devuelve el
      // registro tal como quedó, con su hora real, en vez de un error. Así el
      // móvil puede adoptar la hora del servidor en lugar de inventar la suya.
      // Antes devolvía 400 y el cliente terminaba conservando su `fin` local,
      // que podía no coincidir con el registrado.
      const [yaCerrada] = await pool.query<RowDataPacket[]>(
        `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
                a.inicio, a.fin, a.estado, a.created_at,
                u.nombre AS usuario_nombre, u.cargo,
                ta.nombre AS tipo_actividad_nombre,
                c.nombre AS cliente_nombre
         FROM actividades a
         INNER JOIN usuarios u ON u.id = a.usuario_id
         INNER JOIN areas ar ON ar.id = u.area_id
         INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
         LEFT JOIN clientes c ON c.id = a.cliente_id
         WHERE a.id = ? AND ar.empresa_id = ?`,
        [Number(id), context.activa.id]
      )
      return NextResponse.json({ ok: true, actividad: yaCerrada[0], duplicada: true })
    }

    const inicio = new Date(actividades[0].inicio as string)
    if (marcaFin !== null && marcaFin.ok && !Number.isNaN(inicio.getTime()) && marcaFin.fecha < inicio) {
      return NextResponse.json(
        { error: 'La hora de finalización no puede ser anterior al inicio de la actividad.' },
        { status: 400 }
      )
    }

    if (estado === 'PAUSADA') {
      await pool.query('UPDATE pausas SET fin = NOW() WHERE actividad_id = ? AND fin IS NULL', [id])
    }

    // El cierre se hace con la condición de estado dentro del propio UPDATE y se
    // mira `affectedRows`. Antes el UPDATE era incondicional: dos cierres
    // simultáneos pasaban ambos la validación de arriba y el segundo escribía su
    // `fin` encima del primero, cambiando la hora realmente registrada.
    //
    // Con la condición, el segundo cierre hace 0 filas afectadas y se devuelve la
    // actividad tal como quedó guardada, sin volver a tocarla.
    const idActividad = Number(id)
    const conexion = await pool.getConnection()
    let finalizada = false
    try {
      await conexion.beginTransaction()
      const [resultado] = await conexion.query(
        marcaFin !== null && marcaFin.ok
          ? `UPDATE actividades
             SET fin = ?, estado = 'PENDIENTE_APROBACION'
             WHERE id = ? AND estado IN ('EN_CURSO', 'PAUSADA')`
          : `UPDATE actividades
             SET fin = NOW(), estado = 'PENDIENTE_APROBACION'
             WHERE id = ? AND estado IN ('EN_CURSO', 'PAUSADA')`,
        marcaFin !== null && marcaFin.ok ? [marcaFin.fecha, idActividad] : [idActividad]
      )
      finalizada = (resultado as { affectedRows: number }).affectedRows > 0
      await conexion.commit()
    } catch (error) {
      try {
        await conexion.rollback()
      } catch {}
      throw error
    } finally {
      conexion.release()
    }

    const [actualizada] = await pool.query(
      `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
        a.inicio, a.fin, a.estado, a.created_at,
         u.nombre AS usuario_nombre, u.cargo,
        ta.nombre AS tipo_actividad_nombre,
        c.nombre AS cliente_nombre
       FROM actividades a
       INNER JOIN usuarios u ON u.id = a.usuario_id
       INNER JOIN areas ar ON ar.id = u.area_id
       INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
       LEFT JOIN clientes c ON c.id = a.cliente_id
       WHERE a.id = ? AND ar.empresa_id = ?`,
      [id, context.activa.id]
    )

    const actividadDevuelta = (actualizada as Array<Record<string, unknown>>)[0]

    // Si otra petición ganó la carrera, la actividad ya estaba cerrada. Se
    // devuelve tal como quedó guardada y NO se vuelven a disparar las
    // notificaciones, para no avisar dos veces al supervisor del mismo registro.
    if (!finalizada) {
      return NextResponse.json({ ok: true, actividad: actividadDevuelta, duplicada: true })
    }

    const actividadActualizada = (actualizada as Array<{ cliente_id: number | null }>)[0]
    if (actividadActualizada?.cliente_id != null) {
      await notificarBolsaHorasPorId(actividadActualizada.cliente_id, context.activa.id)
    }

    await notificarRevisoresActividad(
      context.activa.id,
      Number(actividades[0].usuario_id),
      'aprobacion',
      'Registro pendiente de aprobación',
      'Un registro fue enviado para tu revisión.',
      `/aprobaciones?actividad=${Number(actividades[0].id)}&estado=PENDIENTE_APROBACION`,
      `pendiente-aprobacion:${Number(actividades[0].id)}`,
    )

    notifyActivityChange(user.id)
    await registrarAuditoria({
      empresaId: context.activa?.id ?? null,
      usuarioId: user.id,
      accion: 'FINALIZAR_ACTIVIDAD',
      entidad: 'actividad',
      entidadId: Number(actividades[0].id),
      ip: request.headers.get('x-forwarded-for') || null,
    })
    return NextResponse.json({ ok: true, actividad: actividadDevuelta })
  } catch (error) {
    console.error('Error al finalizar actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
