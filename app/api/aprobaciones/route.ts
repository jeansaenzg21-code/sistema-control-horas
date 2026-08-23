import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supervisorId = searchParams.get('supervisor_id')
    const usuarioId = searchParams.get('usuario_id')

    let query = `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
      a.inicio, a.fin, a.estado, a.revisado_por, a.revisado_en, a.observacion_revision, a.created_at,
      u.nombre AS usuario_nombre, u.especialidad, u.supervisor_id,
      ta.nombre AS tipo_actividad_nombre,
      c.nombre AS cliente_nombre,
      COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW()))) FROM pausas p WHERE p.actividad_id = a.id), 0) AS pausa_acumulada_segundos,
      CASE
        WHEN a.fin IS NOT NULL THEN TIMESTAMPDIFF(SECOND, a.inicio, a.fin)
        ELSE TIMESTAMPDIFF(SECOND, a.inicio, NOW())
      END AS duracion_segundos
      FROM actividades a
      INNER JOIN usuarios u ON u.id = a.usuario_id
      INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
      LEFT JOIN clientes c ON c.id = a.cliente_id
      WHERE a.estado IN ('PENDIENTE_APROBACION', 'APROBADA', 'RECHAZADA')`
    const params: (string | number)[] = []

    if (supervisorId && !usuarioId) {
      query += ' AND u.rol != ?'
      params.push('ADMINISTRACION')
    }
    if (usuarioId) {
      query += ' AND a.usuario_id = ?'
      params.push(usuarioId)
    }

    query += ' ORDER BY a.created_at DESC'

    const [rows] = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener aprobaciones:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
