import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esJefeDeArea } from '@/lib/permisos'

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
    let query = `SELECT ta.id, ta.area_id, ta.nombre, ta.activo, ta.es_general
      FROM tipos_actividad ta
      LEFT JOIN areas ar ON ar.id = ta.area_id
      WHERE ta.activo = TRUE
        AND (ta.es_general = TRUE OR ar.empresa_id = ?)`
    if (areaId != null) {
      query += ' AND (ta.es_general = TRUE OR ta.area_id = ?)'
      params.push(areaId)
    }
    query += ' ORDER BY ta.nombre'

    const [rows] = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener tipos de actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
