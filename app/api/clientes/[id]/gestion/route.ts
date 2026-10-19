import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'

import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdministrador, puedeAdministrarArea } from '@/lib/permisos'
import { obtenerGestionCliente, type FilaCliente } from '@/lib/presupuestos/gestion-cliente'
import pool from '@/lib/db'

export const runtime = 'nodejs'

type Contexto = { params: Promise<{ id: string }> }

/**
 * Gestión integral de un cliente, sin pasar por un proyecto.
 *
 * Permiso: quien administra el área del cliente, o un administrador. Antes esto
 * era "el Líder del proyecto", pero el cliente es el ancla y no siempre hay
 * proyecto; el jefe de su área es quien responde por su presupuesto.
 */
export async function GET(request: Request, ctx: Contexto) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const empresa = await getEmpresaContext(user)
    if (!empresa.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const { id } = await ctx.params
    const clienteId = Number(id)
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return NextResponse.json({ error: 'El cliente no es valido.' }, { status: 400 })
    }

    // El cliente tiene que ser de esta empresa. `clientes` no tiene columna
    // `empresa_id`: el aislamiento va por su área.
    //
    // Se pide la fila COMPLETA, no solo el área. La gestión necesita los mismos
    // datos (nombre, contacto, área), y volver a leerlos allí sería un viaje más
    // a la base de datos por una fila que ya tenemos aquí.
    const [propio] = await pool.query<RowDataPacket[]>(
      `SELECT c.id, c.nombre, c.area_id, a.nombre AS area, c.ruc, c.correo, c.telefono
         FROM clientes c
         INNER JOIN areas a ON a.id = c.area_id
        WHERE c.id = ? AND a.empresa_id = ? AND c.activo = TRUE`,
      [clienteId, empresa.activa.id]
    )
    if (propio.length === 0) {
      return NextResponse.json({ error: 'El cliente no existe.' }, { status: 404 })
    }
    const areaId = Number(propio[0].area_id)

    const puedeGestionar = puedeAdministrarArea(user, areaId)
    const motivo = puedeGestionar
      ? esAdministrador(user)
        ? 'Actúas como administrador de la empresa.'
        : 'Administras el área de este cliente.'
      : 'Solo quien administra el área de este cliente puede repartir o aprobar sus horas.'

    const gestion = await obtenerGestionCliente(propio[0] as FilaCliente, puedeGestionar, motivo)
    return NextResponse.json(gestion)
  } catch (error) {
    console.error('Error al cargar la gestion del cliente:', error)
    return NextResponse.json({ error: 'No se pudo cargar la gestión del cliente.' }, { status: 500 })
  }
}
