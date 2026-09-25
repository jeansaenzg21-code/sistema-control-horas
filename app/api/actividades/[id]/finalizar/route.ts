import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { notifyActivityChange } from '@/lib/events'
import { notificarBolsaHorasPorId } from '@/lib/bolsa-alertas'
import { notificarRevisoresActividad } from '@/lib/notificaciones'

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
    const [rows] = await pool.query(
      `SELECT a.id, a.usuario_id, a.estado
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
      return NextResponse.json({ error: 'La actividad no se puede finalizar.' }, { status: 400 })
    }

    if (estado === 'PAUSADA') {
      await pool.query('UPDATE pausas SET fin = NOW() WHERE actividad_id = ? AND fin IS NULL', [id])
    }

    await pool.query(
      `UPDATE actividades
       SET fin = NOW(), estado = 'PENDIENTE_APROBACION'
       WHERE id = ?`,
      [id]
    )

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
    return NextResponse.json({ ok: true, actividad: (actualizada as Array<Record<string, unknown>>)[0] })
  } catch (error) {
    console.error('Error al finalizar actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
