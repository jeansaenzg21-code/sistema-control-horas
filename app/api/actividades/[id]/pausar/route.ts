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
    if (actividades[0].estado !== 'EN_CURSO') {
      return NextResponse.json({ error: 'La actividad no está en curso.' }, { status: 400 })
    }

    await pool.query(
      `INSERT INTO pausas (actividad_id, inicio) VALUES (?, NOW())`,
      [id]
    )

    await pool.query(
      `UPDATE actividades SET estado = 'PAUSADA' WHERE id = ?`,
      [id]
    )

    notifyActivityChange(usuarioId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al pausar actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
