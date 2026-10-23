import { NextResponse } from 'next/server'
import { RowDataPacket } from 'mysql2'
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
    const areaId = searchParams.get('area_id')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
      return NextResponse.json({ error: 'La fecha inicial no es válida.' }, { status: 400 })
    }
    if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      return NextResponse.json({ error: 'La fecha final no es válida.' }, { status: 400 })
    }

    // La consolidación solo necesita los TOTALES por persona. Antes esta ruta
    // devolvía una fila por actividad y sumaba en JavaScript; la pantalla, en
    // paralelo, se bajaba todas las filas del área para hacer lo mismo. Agrupar
    // en SQL deja la respuesta en una fila por colaborador.
    const where: string[] = ['ar.empresa_id = ?']
    const params: (string | number)[] = [context.activa.id]

    const areaJefe = esJefeDeArea(user) ? user.area_id : null
    if (areaJefe != null) {
      if (areaId && Number(areaId) !== areaJefe) {
        return NextResponse.json({ error: 'Sólo puedes consultar la consolidación de tu área.' }, { status: 403 })
      }
      where.push('u.area_id = ?')
      params.push(areaJefe)
    } else if (areaId) {
      const parsedAreaId = Number(areaId)
      if (!Number.isInteger(parsedAreaId) || parsedAreaId <= 0) {
        return NextResponse.json({ error: 'La división indicada no es válida.' }, { status: 400 })
      }
      where.push('u.area_id = ?')
      params.push(parsedAreaId)
    }
    if (desde) {
      where.push('a.inicio >= ?')
      params.push(`${desde} 00:00:00`)
    }
    if (hasta) {
      // Rango semiabierto: `DATE(a.inicio) <= ?` impide usar el índice de
      // `inicio`. Se compara contra el día siguiente a las 00:00.
      const dia = new Date(`${hasta}T00:00:00Z`)
      dia.setUTCDate(dia.getUTCDate() + 1)
      where.push('a.inicio < ?')
      params.push(`${dia.toISOString().slice(0, 10)} 00:00:00`)
    }

    const [filas] = await pool.query<RowDataPacket[]>(
      `SELECT x.usuario_id, u.nombre AS usuario_nombre, u.cargo,
              COUNT(*) AS registros,
              COALESCE(SUM(x.segundos), 0) AS total_segundos,
              COALESCE(SUM(CASE WHEN x.estado = 'APROBADA' AND x.facturable = 1 THEN x.segundos ELSE 0 END), 0) AS facturadas_segundos,
              COALESCE(SUM(CASE WHEN x.estado = 'RECHAZADA' OR (x.estado = 'APROBADA' AND x.facturable = 0) THEN x.segundos ELSE 0 END), 0) AS no_facturadas_segundos
         FROM (
           SELECT a.usuario_id, a.estado, a.facturable,
                  CASE
                    WHEN a.fin IS NOT NULL
                      THEN GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, a.fin) - COALESCE(pa.segundos, 0))
                    ELSE 0
                  END AS segundos
             FROM actividades a
             INNER JOIN usuarios u ON u.id = a.usuario_id
             INNER JOIN areas ar ON ar.id = u.area_id
             LEFT JOIN (
               SELECT p.actividad_id,
                      SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW()))) AS segundos
                 FROM pausas p
                GROUP BY p.actividad_id
             ) pa ON pa.actividad_id = a.id
            WHERE ${where.join(' AND ')}
         ) x
         INNER JOIN usuarios u ON u.id = x.usuario_id
        GROUP BY x.usuario_id, u.nombre, u.cargo
        ORDER BY total_segundos DESC, u.nombre ASC`,
      params
    )

    return NextResponse.json(filas.map((fila) => {
      const total = Number(fila.total_segundos)
      const facturadas = Number(fila.facturadas_segundos)
      const noFacturadas = Number(fila.no_facturadas_segundos)
      return {
        usuario_id: Number(fila.usuario_id),
        usuario_nombre: String(fila.usuario_nombre),
        cargo: fila.cargo == null ? null : String(fila.cargo),
        registros: Number(fila.registros),
        total_segundos: total,
        facturadas_segundos: facturadas,
        no_facturadas_segundos: noFacturadas,
        por_definir_segundos: Math.max(0, total - facturadas - noFacturadas),
      }
    }))
  } catch (error) {
    console.error('Error en consolidación:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
