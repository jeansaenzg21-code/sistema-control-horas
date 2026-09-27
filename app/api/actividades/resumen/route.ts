import { NextResponse } from 'next/server'
import { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esJefeDeArea } from '@/lib/permisos'
import { columnaExiste } from '@/lib/esquema'

/**
 * Resumenes agregados de un periodo.
 *
 * Por que existe: los paneles (resumen de horas, distribucion por cargo, grafico
 * por division) y la consolidacion NO necesitan las filas de actividad, solo
 * numeros. Antes descargaban el historial entero al navegador y sumaban alli.
 * Medido: un administrador abria el panel y el navegador se bajaba 20 000 filas,
 * 11,9 MB y 40 peticiones, en 28,6 segundos. Con este endpoint la misma
 * informacion cabe en unos pocos KB.
 *
 * Todos los filtros de fecha, rol y autorizacion se aplican en SQL, con los
 * mismos criterios que usa GET /api/actividades: si aqui se permitiera ver mas,
 * seria una via para saltarse los permisos.
 */

// Horas de una actividad, ya descontadas las pausas. Coincide con el calculo que
// hacia el cliente: (fin - inicio) - pausas, nunca negativo.
const HORAS = `GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, COALESCE(a.fin, NOW())) - COALESCE(pa.segundos, 0)) / 3600`

const PAUSAS = `LEFT JOIN (
  SELECT p.actividad_id, SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW()))) AS segundos
    FROM pausas p GROUP BY p.actividad_id
) pa ON pa.actividad_id = a.id`

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const areaId = searchParams.get('area_id')
    const usuarioParam = searchParams.get('usuario_id')

    if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
      return NextResponse.json({ error: 'La fecha inicial no es válida.' }, { status: 400 })
    }
    if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      return NextResponse.json({ error: 'La fecha final no es válida.' }, { status: 400 })
    }
    if (areaId && !/^\d+$/.test(areaId)) {
      return NextResponse.json({ error: 'El área no es válida.' }, { status: 400 })
    }

    // Mismas reglas de alcance que en GET /api/actividades.
    let usuarioId: number | null = null
    if (usuarioParam != null && usuarioParam !== '') {
      usuarioId = Number(usuarioParam)
      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return NextResponse.json({ error: 'El usuario indicado no es válido.' }, { status: 400 })
      }
    }
    if (user.rol === 'PERSONAL') {
      if (usuarioId != null && usuarioId !== user.id) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
      }
      usuarioId = user.id
    } else if (usuarioId == null) {
      if (user.rol === 'SUPERVISOR') usuarioId = null
      else if (!esJefeDeArea(user) && user.rol !== 'ADMINISTRACION') {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
      }
    }

    const where: string[] = ['ar.empresa_id = ?']
    const params: Array<string | number> = [context.activa.id]

    if (usuarioId != null) {
      where.push('a.usuario_id = ?')
      params.push(usuarioId)
    } else if (user.rol === 'SUPERVISOR') {
      where.push('u.supervisor_id = ?')
      params.push(user.id)
    } else if (esJefeDeArea(user)) {
      where.push('u.area_id = ?')
      params.push(user.area_id!)
    }
    if (areaId) {
      where.push('u.area_id = ?')
      params.push(Number(areaId))
    }
    // Rango semiabierto, igual que en la lista: es lo que deja usar el indice.
    if (desde) {
      where.push('a.inicio >= ?')
      params.push(`${desde} 00:00:00`)
    }
    if (hasta) {
      const dia = new Date(`${hasta}T00:00:00Z`)
      dia.setUTCDate(dia.getUTCDate() + 1)
      where.push('a.inicio < ?')
      params.push(`${dia.toISOString().slice(0, 10)} 00:00:00`)
    }

    const base = `FROM actividades a
      INNER JOIN usuarios u ON u.id = a.usuario_id
      INNER JOIN areas ar ON ar.id = u.area_id
      ${PAUSAS}
      WHERE ${where.join(' AND ')}`
    // Sin interrogantes a proposito: si esta expresion llevara un `?`, recorreria
    // una posicion de `params` y desplazaria los filtros de fecha y de usuario.
    const cargo = "COALESCE(NULLIF(u.cargo, ''), 'Sin cargo')"

    // Una sola pasada de consultas agrupadas, no una por grafico.
    const [totales] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS registros,
              COALESCE(SUM(${HORAS}), 0) AS horas,
              COALESCE(SUM(CASE WHEN a.estado = 'APROBADA' AND a.facturable = 1 THEN ${HORAS} ELSE 0 END), 0) AS horas_facturadas,
              COALESCE(SUM(CASE WHEN a.estado = 'RECHAZADA' OR (a.estado = 'APROBADA' AND a.facturable = 0) THEN ${HORAS} ELSE 0 END), 0) AS horas_no_facturadas
       ${base}`,
      params
    )

    const [porCargo] = await pool.query<RowDataPacket[]>(
      `SELECT ${cargo} AS cargo,
              COUNT(*) AS registros,
              COALESCE(SUM(${HORAS}), 0) AS horas
       ${base}
       GROUP BY cargo
       ORDER BY horas DESC`,
      params
    )

    // El grafico por division solo cuenta lo APROBADO y facturable.
    const [porCargoFacturable] = await pool.query<RowDataPacket[]>(
      `SELECT ${cargo} AS cargo,
              COALESCE(SUM(${HORAS}), 0) AS horas
       ${base}
        AND a.estado = 'APROBADA' AND a.facturable = 1
       GROUP BY cargo
       ORDER BY horas DESC`,
      params
    )

    const [porUsuario] = await pool.query<RowDataPacket[]>(
      `SELECT u.id AS usuario_id, u.nombre, u.cargo, ar.nombre AS area_nombre,
              COUNT(*) AS registros,
              COALESCE(SUM(${HORAS}), 0) AS horas
       ${base}
       GROUP BY u.id, u.nombre, u.cargo, ar.nombre
       ORDER BY horas DESC`,
      params
    )

    const [porDia] = await pool.query<RowDataPacket[]>(
      `SELECT DATE(a.inicio) AS dia,
              COUNT(*) AS registros,
              COALESCE(SUM(${HORAS}), 0) AS horas
       ${base}
       GROUP BY dia
       ORDER BY dia ASC`,
      params
    )

    const proyecto = await columnaExiste('actividades', 'proyecto_id')

    return NextResponse.json({
      totales: {
        registros: Number(totales[0]?.registros ?? 0),
        horas: Number(totales[0]?.horas ?? 0),
        horas_facturadas: Number(totales[0]?.horas_facturadas ?? 0),
        horas_no_facturadas: Number(totales[0]?.horas_no_facturadas ?? 0),
      },
      por_cargo: porCargo.map((r) => ({
        cargo: String(r.cargo),
        registros: Number(r.registros),
        horas: Number(r.horas),
      })),
      por_cargo_facturable: porCargoFacturable.map((r) => ({
        cargo: String(r.cargo),
        horas: Number(r.horas),
      })),
      por_usuario: porUsuario.map((r) => ({
        usuario_id: Number(r.usuario_id),
        nombre: String(r.nombre),
        cargo: r.cargo == null ? null : String(r.cargo),
        area_nombre: String(r.area_nombre),
        registros: Number(r.registros),
        horas: Number(r.horas),
      })),
      por_dia: porDia.map((r) => ({
        dia: r.dia instanceof Date ? r.dia.toISOString().slice(0, 10) : String(r.dia),
        registros: Number(r.registros),
        horas: Number(r.horas),
      })),
      proyecto_disponible: proyecto,
    })
  } catch (error) {
    console.error('Error al obtener el resumen de actividades:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
