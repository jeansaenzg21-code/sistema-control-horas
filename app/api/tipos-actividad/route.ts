import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esJefeDeArea } from '@/lib/permisos'
import { columnaExiste } from '@/lib/esquema'

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { searchParams } = new URL(request.url)
    const areaParam = searchParams.get('area_id')
    const areaJefe = esJefeDeArea(user) ? user.area_id : null
    let areaId = areaJefe
    if (areaId == null && user.rol === 'PERSONAL') areaId = user.area_id
    if (areaId == null && areaParam) {
      const parsedAreaId = Number(areaParam)
      if (!Number.isInteger(parsedAreaId) || parsedAreaId <= 0) {
        return NextResponse.json({ error: 'La división indicada no es válida.' }, { status: 400 })
      }
      areaId = parsedAreaId
    }

    const params: (string | number)[] = [context.activa.id]
    // `codigo` llegó después de crear el catálogo por área. Se consulta solo si
    // la columna existe, para que una instalación que no haya aplicado
    // sql/actividades_codigo.sql siga funcionando sin dar error.
    const hayCodigo = await columnaExiste('tipos_actividad', 'codigo')
    const columnas = hayCodigo
      ? 'ta.id, ta.area_id, ta.nombre, ta.codigo, ta.activo, ta.es_general'
      : 'ta.id, ta.area_id, ta.nombre, ta.activo, ta.es_general'
    let query = `SELECT ${columnas}
      FROM tipos_actividad ta
      LEFT JOIN areas ar ON ar.id = ta.area_id
      WHERE ta.activo = TRUE
        AND (ta.es_general = TRUE OR ar.empresa_id = ?)`
    if (areaId != null) {
      // Un área con catálogo propio ve SOLO ese catálogo. Las cinco generales
      // son el respaldo de las áreas que no tienen una lista propia, no un
      // añadido a las que sí: mezcladas con 30 actividades específicas solo
      // sirven para que alguien imputa sus horas a "Revisión, Informes y
      // Cierre" cuando en realidad estaba haciendo otra cosa.
      query += ` AND (
        ta.area_id = ?
        OR (ta.es_general = TRUE AND NOT EXISTS (
              SELECT 1 FROM tipos_actividad propio
               WHERE propio.area_id = ? AND propio.activo = TRUE AND propio.es_general = FALSE))
      )`
      params.push(areaId, areaId)
    }
    // Por código, que es como el personal nombra estas actividades en sus
    // papeles. Las generales no tienen código y quedan al final.
    query += ' ORDER BY ta.es_general DESC, ta.codigo IS NULL, ta.codigo, ta.nombre'

    const [rows] = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener tipos de actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
