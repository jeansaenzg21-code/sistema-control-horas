import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'

import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import pool from '@/lib/db'
import { esAdministrador, esJefeDeArea, esSocio } from '@/lib/permisos'

export const runtime = 'nodejs'

type Contexto = { params: Promise<{ id: string }> }

/** Ficha mínima del cliente. No expone importes: eso vive en el presupuesto. */
export async function GET(request: Request, ctx: Contexto) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  if (!esAdministrador(user) && !esJefeDeArea(user) && !esSocio(user)) {
    return NextResponse.json({ error: 'El detalle de clientes solo está disponible para quienes administran el área.' }, { status: 403 })
  }

  const empresa = await getEmpresaContext(user)
  if (!empresa.activa) {
    return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
  }

  const { id } = await ctx.params
  const clienteId = Number(id)
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return NextResponse.json({ error: 'El cliente no es valido.' }, { status: 400 })
  }

  const [filas] = await pool.query<(RowDataPacket & { id: number; nombre: string; area_nombre: string; area_id: number; activo: number; es_outsourcing: number; encargado: string | null; asistente: string | null; encargado_usuario_id: number | null })[]>(
    // `clientes` no tiene columna `empresa_id`: el aislamiento multiempresa se
    // hace por el área, que es lo que hace el resto del módulo. Filtrar por
    // c.empresa_id devolvía un error de columna y la ficha nunca cargaba.
    `SELECT c.id, c.nombre, a.nombre AS area_nombre, c.area_id, c.activo, c.es_outsourcing, c.encargado, c.asistente, c.encargado_usuario_id
       FROM clientes c
       INNER JOIN areas a ON a.id = c.area_id
       WHERE c.id = ? AND a.empresa_id = ? AND c.activo = TRUE`,
    [clienteId, empresa.activa.id]
  )

  const cliente = filas[0]
  if (!cliente) return NextResponse.json({ error: 'El cliente no existe.' }, { status: 404 })

  if (esJefeDeArea(user) && Number(cliente.area_id) !== user.area_id) return NextResponse.json({ error: 'El cliente no existe.' }, { status: 404 })
  return NextResponse.json({ cliente })
}
