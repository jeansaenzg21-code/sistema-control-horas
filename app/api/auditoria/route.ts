import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdministrador, esSocio } from '@/lib/permisos'

export async function GET(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user || (!esAdministrador(user) && !esSocio(user))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }
  const context = await getEmpresaContext(user)
  if (!context.activa) {
    return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
  }

  const { searchParams } = new URL(request.url)
  const limite = Math.min(100, Math.max(1, Number(searchParams.get('limite') || 20)))
  const offset = Math.max(0, Number(searchParams.get('offset') || 0))

  const [filas] = await pool.query(
    `SELECT id, empresa_id, usuario_id, accion, entidad, entidad_id, antes, despues, ip, created_at
     FROM auditoria
     WHERE empresa_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [context.activa.id, limite, offset]
  )
  const [totales] = await pool.query(
    `SELECT COUNT(*) AS total FROM auditoria WHERE empresa_id = ?`,
    [context.activa.id]
  )
  const total = Number((totales as Array<{ total: number }>)[0]?.total ?? 0)

  return NextResponse.json(filas, {
    headers: {
      'X-Total': String(total),
      'X-Offset': String(offset),
      'X-Limite': String(limite),
    },
  })
}