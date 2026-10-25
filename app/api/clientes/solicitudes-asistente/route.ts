import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esJefeDeArea } from '@/lib/permisos'

export async function GET(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  if (!esJefeDeArea(user)) return NextResponse.json({ error: 'Solo el jefe de área consulta solicitudes.' }, { status: 403 })
  const empresa = await getEmpresaContext(user)
  if (!empresa.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id, s.cliente_id, c.nombre AS cliente, s.solicitante_id,
            u.nombre AS solicitante, s.cantidad, s.comentario, s.created_at
       FROM clientes_solicitudes_asistente s
       JOIN clientes c ON c.id = s.cliente_id AND c.es_outsourcing = TRUE
       JOIN areas a ON a.id = c.area_id AND a.empresa_id = ? AND a.id = ?
       JOIN usuarios u ON u.id = s.solicitante_id
      WHERE s.estado = 'PENDIENTE' ORDER BY s.created_at`,
    [empresa.activa.id, user.area_id]
  )
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const empresa = await getEmpresaContext(user)
  if (!empresa.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
  const body = await request.json().catch(() => ({})) as { cliente_id?: number; cantidad?: number; comentario?: string }
  const clienteId = Number(body.cliente_id)
  const cantidad = Math.min(10, Math.max(1, Number(body.cantidad) || 1))
  const [acceso] = await pool.query<RowDataPacket[]>(
    `SELECT c.id FROM clientes c JOIN areas a ON a.id = c.area_id
      JOIN clientes_asignaciones ca ON ca.cliente_id = c.id AND ca.usuario_id = ? AND ca.funcion = 'ENCARGADO' AND ca.activo = TRUE
     WHERE c.id = ? AND c.es_outsourcing = TRUE AND a.empresa_id = ?`,
    [user.id, clienteId, empresa.activa.id]
  )
  if (!acceso.length) return NextResponse.json({ error: 'Solo el encargado asignado puede solicitar asistentes para este cliente.' }, { status: 403 })
  const [pendiente] = await pool.query<RowDataPacket[]>(`SELECT id FROM clientes_solicitudes_asistente WHERE cliente_id = ? AND solicitante_id = ? AND estado = 'PENDIENTE' LIMIT 1`, [clienteId, user.id])
  if (pendiente.length) return NextResponse.json({ error: 'Ya tienes una solicitud pendiente para este cliente.' }, { status: 409 })
  await pool.query(`INSERT INTO clientes_solicitudes_asistente (cliente_id, solicitante_id, cantidad, comentario) VALUES (?, ?, ?, ?)`, [clienteId, user.id, cantidad, String(body.comentario ?? '').trim().slice(0, 1000) || null])
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function PATCH(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user || !esJefeDeArea(user)) return NextResponse.json({ error: 'Solo el jefe de área puede asignar asistentes.' }, { status: 403 })
  const empresa = await getEmpresaContext(user)
  if (!empresa.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
  const body = await request.json().catch(() => ({})) as { solicitud_id?: number; usuario_id?: number }
  const [solicitudes] = await pool.query<RowDataPacket[]>(
    `SELECT s.id, s.cliente_id, c.area_id FROM clientes_solicitudes_asistente s
      JOIN clientes c ON c.id = s.cliente_id JOIN areas a ON a.id = c.area_id
     WHERE s.id = ? AND s.estado = 'PENDIENTE' AND c.es_outsourcing = TRUE AND a.empresa_id = ? AND c.area_id = ?`,
    [Number(body.solicitud_id), empresa.activa.id, user.area_id]
  )
  const solicitud = solicitudes[0]
  if (!solicitud) return NextResponse.json({ error: 'Solicitud pendiente no encontrada en tu área.' }, { status: 404 })
  const [personal] = await pool.query<RowDataPacket[]>(
    `SELECT u.id FROM usuarios u JOIN areas a ON a.id = u.area_id
      JOIN areas area_cliente ON area_cliente.id = ? AND area_cliente.empresa_id = a.empresa_id
     WHERE u.id = ? AND u.activo = TRUE AND u.rol IN ('PERSONAL','SUPERVISOR','JEFE_AREA')`,
    [Number(solicitud.area_id), Number(body.usuario_id)]
  )
  if (!personal.length) return NextResponse.json({ error: 'Selecciona un integrante activo de un área de la empresa.' }, { status: 400 })
  const conexion = await pool.getConnection()
  try {
    await conexion.beginTransaction()
    await conexion.query(`INSERT INTO clientes_asignaciones (cliente_id, usuario_id, funcion, creado_por) VALUES (?, ?, 'ASISTENTE', ?) ON DUPLICATE KEY UPDATE activo = TRUE, creado_por = VALUES(creado_por)`, [solicitud.cliente_id, Number(body.usuario_id), user.id])
    await conexion.query(`UPDATE clientes_solicitudes_asistente SET estado = 'ATENDIDA', atendida_por = ?, atendida_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.id, solicitud.id])
    await conexion.commit()
    return NextResponse.json({ ok: true })
  } catch (error) {
    await conexion.rollback()
    console.error('Error al asignar asistente:', error)
    return NextResponse.json({ error: 'No se pudo asignar el asistente.' }, { status: 500 })
  } finally { conexion.release() }
}
