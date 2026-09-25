import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
        a.inicio, a.fin, a.estado, a.revisado_por, a.revisado_en, a.observacion_revision, a.created_at,
        u.nombre AS usuario_nombre, u.cargo, u.especialidad, u.supervisor_id,
        ta.nombre AS tipo_actividad_nombre,
        c.nombre AS cliente_nombre,
        COALESCE(
          (SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW())))
           FROM pausas p WHERE p.actividad_id = a.id), 0
        ) AS pausa_acumulada_segundos,
        CASE
          WHEN a.fin IS NOT NULL THEN TIMESTAMPDIFF(SECOND, a.inicio, a.fin)
          ELSE TIMESTAMPDIFF(SECOND, a.inicio, NOW())
        END AS duracion_segundos
       FROM actividades a
       INNER JOIN usuarios u ON u.id = a.usuario_id
       INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
       INNER JOIN areas ar ON ar.id = u.area_id
       LEFT JOIN clientes c ON c.id = a.cliente_id
       WHERE a.usuario_id = ? AND ar.empresa_id = ? AND a.estado IN ('EN_CURSO', 'PAUSADA')
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [user.id, context.activa.id]
    )

    const actividades = rows as Array<Record<string, unknown>>
    return NextResponse.json(actividades.length > 0 ? actividades[0] : null)
  } catch (error) {
    console.error('Error al obtener actividad actual:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
