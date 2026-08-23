import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { RowDataPacket } from 'mysql2'
import { notifyActivityChange } from '@/lib/events'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const usuarioId = searchParams.get('usuario_id')
    const estado = searchParams.get('estado')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    let query = `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
      a.inicio, a.fin, a.estado, a.revisado_por, a.revisado_en, a.observacion_revision, a.created_at,
      u.nombre AS usuario_nombre, u.especialidad, u.area_id,
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
      WHERE 1=1`
    const params: (string | number)[] = []

    if (usuarioId) {
      query += ' AND a.usuario_id = ?'
      params.push(usuarioId)
    }
    if (estado) {
      query += ' AND a.estado = ?'
      params.push(estado)
    }
    if (desde) {
      query += ' AND DATE(a.inicio) >= ?'
      params.push(desde)
    }
    if (hasta) {
      query += ' AND DATE(a.inicio) <= ?'
      params.push(hasta)
    }

    query += ' ORDER BY a.inicio DESC'

    const [rows] = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener actividades:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { usuario_id, tipo_actividad_id, cliente_id, descripcion, facturable } = await request.json()

    if (!usuario_id || !tipo_actividad_id) {
      return NextResponse.json({ error: 'Faltan campos obligatorios.' }, { status: 400 })
    }

    if (cliente_id) {
      const [cliente] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM clientes WHERE id = ? AND activo = TRUE`, [cliente_id]
      )
      if (cliente.length === 0) {
        return NextResponse.json({ error: 'El cliente seleccionado no existe o está inactivo.' }, { status: 400 })
      }
    }

    const [existe] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM actividades WHERE usuario_id = ? AND estado IN ('EN_CURSO', 'PAUSADA')`,
      [usuario_id]
    )
    if (existe.length > 0) {
      return NextResponse.json({ error: 'Ya tienes una actividad activa. Finaliza o pausa la actual antes de crear una nueva.' }, { status: 409 })
    }

    const [result] = await pool.query(
      `INSERT INTO actividades (usuario_id, cliente_id, tipo_actividad_id, descripcion, facturable, inicio, estado)
       VALUES (?, ?, ?, ?, ?, NOW(), 'EN_CURSO')`,
      [usuario_id, cliente_id || null, tipo_actividad_id, descripcion?.trim() || null, facturable ?? null]
    )

    const insertId = (result as { insertId: number }).insertId
    const [nueva] = await pool.query<RowDataPacket[]>(
      `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
        a.inicio, a.fin, a.estado, a.created_at,
        u.nombre AS usuario_nombre, u.especialidad, u.area_id,
        ta.nombre AS tipo_actividad_nombre,
        ar.nombre AS area_nombre,
        c.nombre AS cliente_nombre
       FROM actividades a
       INNER JOIN usuarios u ON u.id = a.usuario_id
       INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
       INNER JOIN areas ar ON ar.id = u.area_id
       LEFT JOIN clientes c ON c.id = a.cliente_id
       WHERE a.id = ?`,
      [insertId]
    )

    notifyActivityChange(usuario_id)

    return NextResponse.json({ ok: true, actividad: nueva[0] })
  } catch (error) {
    console.error('Error al crear actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
