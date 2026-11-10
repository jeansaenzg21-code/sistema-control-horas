import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'

import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdministrador, esJefeDeArea, esSocio, puedeAdministrarArea } from '@/lib/permisos'
import pool from '@/lib/db'
import type { FilaCliente } from './gestion-cliente'

/**
 * Acceso a la ficha de un cliente.
 *
 * Vive aquí porque la ficha y su cronograma comparten exactamente la misma
 * regla: el cliente tiene que pertenecer a la empresa activa y solo lo
 * administran el admin o el jefe de su área. El SOCIO puede consultar, pero no
 * escribir.
 */
export type AccesoCliente =
  | {
      ok: true
      usuario: NonNullable<Awaited<ReturnType<typeof getUserFromRequest>>>
      empresaId: number
      cliente: FilaCliente
      areaId: number
      puedeGestionar: boolean
      motivo: string
    }
  | { ok: false; response: NextResponse }

export async function resolverAccesoCliente(
  request: Request,
  clienteId: number
): Promise<AccesoCliente> {
  const usuario = await getUserFromRequest(request)
  if (!usuario) {
    return { ok: false, response: NextResponse.json({ error: 'No autorizado.' }, { status: 401 }) }
  }
  if (!esAdministrador(usuario) && !esJefeDeArea(usuario) && !esSocio(usuario)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'La gestión de clientes solo está disponible para quienes administran el área.' },
        { status: 403 }
      ),
    }
  }

  const empresa = await getEmpresaContext(usuario)
  if (!empresa.activa) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 }),
    }
  }

  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'El cliente no es valido.' }, { status: 400 }),
    }
  }

  // `clientes` no tiene columna `empresa_id`: el aislamiento va por su área.
  const [propio] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.nombre, c.area_id, a.nombre AS area, c.ruc, c.correo, c.telefono,
            c.es_outsourcing, c.encargado_usuario_id, c.encargado, c.asistente
       FROM clientes c
       INNER JOIN areas a ON a.id = c.area_id
      WHERE c.id = ? AND a.empresa_id = ? AND c.activo = TRUE`,
    [clienteId, empresa.activa.id]
  )
  if (propio.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'El cliente no existe.' }, { status: 404 }),
    }
  }

  const areaId = Number(propio[0].area_id)
  if (esJefeDeArea(usuario) && usuario.area_id !== areaId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'El cliente no existe.' }, { status: 404 }),
    }
  }

  const puedeGestionar = puedeAdministrarArea(usuario, areaId)
  const motivo = puedeGestionar
    ? esAdministrador(usuario)
      ? 'Actúas como administrador de la empresa.'
      : 'Administras el área de este cliente.'
    : 'Solo quien administra el área de este cliente puede repartir o aprobar sus horas.'

  return {
    ok: true,
    usuario,
    empresaId: empresa.activa.id,
    cliente: propio[0] as FilaCliente,
    areaId,
    puedeGestionar,
    motivo,
  }
}
