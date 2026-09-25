import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { notifyActivityChange } from '@/lib/events'

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
    if (actividades[0].estado !== 'PAUSADA') return NextResponse.json({ error: 'La actividad no está pausada.' }, { status: 400 })

    await pool.query('UPDATE pausas SET fin = NOW() WHERE actividad_id = ? AND fin IS NULL', [id])
    await pool.query("UPDATE actividades SET estado = 'EN_CURSO' WHERE id = ?", [id])
    notifyActivityChange(user.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al continuar actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
