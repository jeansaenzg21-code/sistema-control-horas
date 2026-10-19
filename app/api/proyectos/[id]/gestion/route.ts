import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'

import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdministrador } from '@/lib/permisos'
import { esLiderDeProyecto } from '@/lib/presupuestos/permisos'
import { obtenerGestionProyecto } from '@/lib/presupuestos/gestion'

export const runtime = 'nodejs'

type Contexto = { params: Promise<{ id: string }> }

/**
 * Datos de la vista integral de gestión de un proyecto.
 *
 * Todo se calcula en el backend: la pantalla no descarga actividades para
 * contar en el navegador. Solo se devuelven totales por servicio y por
 * integrante, que son unos pocos cientos de filas.
 */
export async function GET(request: Request, ctx: Contexto) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const context = await getEmpresaContext(user)
  if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

  const { id } = await ctx.params
  const proyectoId = Number(id)
  if (!Number.isInteger(proyectoId) || proyectoId <= 0) {
    return NextResponse.json({ error: 'El proyecto no es valido.' }, { status: 400 })
  }

  // El proyecto tiene que ser de esta empresa. Sin esto se podrian leer
  // datos de otra consultora por id.
  const [propio] = await pool.query<RowDataPacket[]>(
    `SELECT p.id FROM proyectos p WHERE p.id = ? AND p.empresa_id = ? AND p.activo = TRUE`,
    [proyectoId, context.activa.id]
  )
  if (propio.length === 0) {
    return NextResponse.json({ error: 'El proyecto no existe.' }, { status: 404 })
  }

  const quien = { id: user.id, rol: user.rol, area_id: user.area_id ?? null }
  const esLider = await esLiderDeProyecto(proyectoId, user.id)
  const esAdmin = esAdministrador(quien)

  // El detalle economico solo lo ve quien puede: un trabajador ve sus horas,
  // no los importes del contrato.
  const puedeVerImportes = esLider || esAdmin

  const gestion = await obtenerGestionProyecto(proyectoId, user.id, {
    puedeVerImportes,
    puedeGestionar: esLider,
    esAdmin,
  })

  return NextResponse.json(gestion)
}
