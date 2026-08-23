import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const [rows] = await pool.query(
      `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
        a.inicio, a.fin, a.estado, a.revisado_por, a.revisado_en, a.observacion_revision, a.created_at,
        u.nombre AS usuario_nombre, u.especialidad,
        ta.nombre AS tipo_actividad_nombre,
        ar.nombre AS area_nombre,
        c.nombre AS cliente_nombre,
        COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW()))) FROM pausas p WHERE p.actividad_id = a.id), 0) AS pausa_acumulada_segundos,
        CASE
          WHEN a.fin IS NOT NULL THEN TIMESTAMPDIFF(SECOND, a.inicio, a.fin)
          ELSE TIMESTAMPDIFF(SECOND, a.inicio, NOW())
        END AS duracion_segundos
       FROM actividades a
       INNER JOIN usuarios u ON u.id = a.usuario_id
       INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
       INNER JOIN areas ar ON ar.id = u.area_id
       LEFT JOIN clientes c ON c.id = a.cliente_id
       WHERE a.id = ?`,
      [id]
    )
    const actividades = rows as Array<Record<string, unknown>>
    if (actividades.length === 0) {
      return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
    }
    return NextResponse.json(actividades[0])
  } catch (error) {
    console.error('Error al obtener actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    if (body.estado) {
      const campos: string[] = ['estado = ?']
      const valores: (string | number | null)[] = [body.estado]

      if (body.estado === 'APROBADA' || body.estado === 'RECHAZADA') {
        if (!body.revisado_por) {
          return NextResponse.json({ error: 'revisado_por requerido.' }, { status: 400 })
        }
        campos.push('revisado_por = ?', 'revisado_en = NOW()')
        valores.push(body.revisado_por)
        if (body.observacion_revision) {
          campos.push('observacion_revision = ?')
          valores.push(body.observacion_revision)
        }
      }

      if (body.estado === 'APROBADA' && body.facturable !== undefined) {
        campos.push('facturable = ?')
        valores.push(body.facturable ? 1 : 0)
      }

      valores.push(id)
      await pool.query(`UPDATE actividades SET ${campos.join(', ')} WHERE id = ?`, valores)
    }

    if (body.facturable !== undefined && !body.estado) {
      await pool.query('UPDATE actividades SET facturable = ? WHERE id = ?', [body.facturable ? 1 : 0, id])
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al actualizar actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
