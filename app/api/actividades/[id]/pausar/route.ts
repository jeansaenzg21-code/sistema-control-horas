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
    const body = await request.json().catch(() => ({}))
    const porRefrigerio = body?.refrigerio === true
    const conexion = await pool.getConnection()
    try {
      await conexion.beginTransaction()
      const [rows] = await conexion.query(
        `SELECT a.id, a.usuario_id, a.estado
         FROM actividades a
         INNER JOIN usuarios u ON u.id = a.usuario_id
         INNER JOIN areas ar ON ar.id = u.area_id
         WHERE a.id = ? AND ar.empresa_id = ? FOR UPDATE`,
        [id, context.activa.id]
      )
      const actividades = rows as Array<Record<string, unknown>>
      if (actividades.length === 0 || Number(actividades[0].usuario_id) !== user.id || actividades[0].estado !== 'EN_CURSO') {
        await conexion.rollback()
        if (actividades.length === 0) return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
        if (Number(actividades[0].usuario_id) !== user.id) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
        return NextResponse.json({ error: 'La actividad no está en curso.' }, { status: 400 })
      }

      // El límite de las 13:00 no se pierde si el equipo se despierta unos minutos tarde.
      await conexion.query(
        `INSERT INTO pausas (actividad_id, inicio)
         SELECT id, ${porRefrigerio ? "IF(CURTIME() >= '13:00:00' AND CURTIME() < '14:00:00', GREATEST(inicio, TIMESTAMP(CURDATE(), '13:00:00')), NOW())" : 'NOW()'}
         FROM actividades WHERE id = ?`,
        [id]
      )
      await conexion.query("UPDATE actividades SET estado = 'PAUSADA' WHERE id = ?", [id])
      await conexion.commit()
    } catch (error) {
      await conexion.rollback()
      throw error
    } finally {
      conexion.release()
    }
    notifyActivityChange(user.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al pausar actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
