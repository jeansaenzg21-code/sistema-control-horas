import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const areaId = searchParams.get('area_id')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    let query = `SELECT
      u.id AS usuario_id, u.nombre AS usuario_nombre, u.especialidad,
      a.estado,
      a.facturable,
      COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW()))) FROM pausas p WHERE p.actividad_id = a.id), 0) AS pausa_segundos,
      CASE
        WHEN a.fin IS NOT NULL THEN TIMESTAMPDIFF(SECOND, a.inicio, a.fin)
        ELSE 0
      END AS duracion_bruta_segundos
      FROM actividades a
      INNER JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.estado IN ('APROBADA', 'PENDIENTE_APROBACION', 'RECHAZADA')`
    const params: (string | number)[] = []

    if (areaId) {
      query += ' AND u.area_id = ?'
      params.push(areaId)
    }
    if (desde) {
      query += ' AND DATE(a.inicio) >= ?'
      params.push(desde)
    }
    if (hasta) {
      query += ' AND DATE(a.inicio) <= ?'
      params.push(hasta)
    }

    const [rows] = await pool.query(query, params)
    const registros = rows as Array<Record<string, unknown>>

    const mapa = new Map<string, {
      usuario_id: number
      usuario_nombre: string
      especialidad: string
      total_segundos: number
      facturables_segundos: number
      no_facturables_segundos: number
      pendientes: number
      aprobadas: number
      rechazadas: number
    }>()

    for (const r of registros) {
      const key = `${r.usuario_id}`
      if (!mapa.has(key)) {
        mapa.set(key, {
          usuario_id: r.usuario_id as number,
          usuario_nombre: r.usuario_nombre as string,
          especialidad: r.especialidad as string,
          total_segundos: 0,
          facturables_segundos: 0,
          no_facturables_segundos: 0,
          pendientes: 0,
          aprobadas: 0,
          rechazadas: 0,
        })
      }
      const g = mapa.get(key)!
      const duracionSeg = ((r.duracion_bruta_segundos as number) || 0) - ((r.pausa_segundos as number) || 0)
      g.total_segundos += duracionSeg
      if (r.facturable === true || r.facturable === 1) {
        g.facturables_segundos += duracionSeg
      } else {
        g.no_facturables_segundos += duracionSeg
      }
      if (r.estado === 'PENDIENTE_APROBACION') g.pendientes++
      else if (r.estado === 'APROBADA') g.aprobadas++
      else if (r.estado === 'RECHAZADA') g.rechazadas++
    }

    return NextResponse.json(Array.from(mapa.values()))
  } catch (error) {
    console.error('Error en consolidación:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
