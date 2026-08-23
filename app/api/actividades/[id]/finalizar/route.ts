import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth'
import { notifyActivityChange } from '@/lib/events'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getUserFromRequest(request)

    let usuarioId: number
    if (user) {
      usuarioId = user.id
    } else {
      const body = await request.json().catch(() => ({}))
      usuarioId = body.usuario_id
      if (!usuarioId) {
        return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 })
      }
    }

    const [rows] = await pool.query(
      `SELECT id, usuario_id, estado FROM actividades WHERE id = ?`,
      [id]
    )
    const actividades = rows as Array<Record<string, unknown>>
    if (actividades.length === 0) {
      return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
    }
    if (actividades[0].usuario_id !== usuarioId) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    const estado = actividades[0].estado as string
    if (estado !== 'EN_CURSO' && estado !== 'PAUSADA') {
      return NextResponse.json({ error: 'La actividad no se puede finalizar.' }, { status: 400 })
    }

    if (estado === 'PAUSADA') {
      await pool.query(
        `UPDATE pausas SET fin = NOW() WHERE actividad_id = ? AND fin IS NULL`,
        [id]
      )
    }

    await pool.query(
      `UPDATE actividades
       SET fin = NOW(),
           estado = 'PENDIENTE_APROBACION'
       WHERE id = ?`,
      [id]
    )

    const [actualizada] = await pool.query(
       `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
         a.inicio, a.fin, a.estado, a.created_at,
         u.nombre AS usuario_nombre,
         ta.nombre AS tipo_actividad_nombre,
         c.nombre AS cliente_nombre
        FROM actividades a
        INNER JOIN usuarios u ON u.id = a.usuario_id
        INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
        LEFT JOIN clientes c ON c.id = a.cliente_id
       WHERE a.id = ?`,
      [id]
    )

    const admins = await pool.query(
      `SELECT id, nombre FROM usuarios WHERE rol = 'ADMINISTRACION' AND activo = TRUE`
    )
    const listaAdmins = admins[0] as Array<{ id: number; nombre: string }>
    for (const admin of listaAdmins) {
      await pool.query(
        `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, url)
         VALUES (?, 'aprobacion', 'Registro pendiente de aprobación', ?, '/aprobaciones')`,
        [admin.id, `Un registro fue enviado para tu revisión.`]
      )
    }

    notifyActivityChange(usuarioId)

    return NextResponse.json({ ok: true, actividad: (actualizada as Array<Record<string, unknown>>)[0] })
  } catch (error) {
    console.error('Error al finalizar actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
