import { esAdministrador, esJefeDeArea, esPersonal, esSocio, esSupervisor } from '@/lib/permisos'
import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2/promise'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'

function idValido(valor: string | null): number | null | undefined {
  if (valor == null || valor === '') return null
  const id = Number(valor)
  if (!Number.isInteger(id) || id <= 0) return undefined
  return id
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { searchParams } = new URL(request.url)
    const supervisorId = idValido(searchParams.get('supervisor_id'))
    const usuarioId = idValido(searchParams.get('usuario_id'))
    if (supervisorId === undefined || usuarioId === undefined) {
      return NextResponse.json({ error: 'Los filtros de usuario no son válidos.' }, { status: 400 })
    }
    if (esPersonal(user)) {
      if (supervisorId != null || (usuarioId != null && usuarioId !== user.id)) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
      }
    } else if (esSupervisor(user)) {
      if (supervisorId != null && supervisorId !== user.id) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
      }
      if (usuarioId != null) {
        const [destinos] = await pool.query<RowDataPacket[]>(
          `SELECT u.id
           FROM usuarios u
           INNER JOIN areas ar ON ar.id = u.area_id
           WHERE u.id = ? AND u.supervisor_id = ? AND ar.empresa_id = ?
           LIMIT 1`,
          [usuarioId, user.id, context.activa.id],
        )
        if (destinos.length === 0) {
          return NextResponse.json({ error: 'El colaborador no está asignado a este supervisor.' }, { status: 403 })
        }
      }
    } else if (esJefeDeArea(user)) {
      // Antes devolvia 403 aqui y el jefe no podia ni LISTAR. Ahora revisa los
      // registros de su area: el recorte lo hace el propio SQL de abajo con
      // `u.area_id = ?`, no una comprobacion en el cliente. Si se aprobara el
      // filtro sin acotar la consulta, un jefe veria (y podria aprobar) toda la
      // empresa.
      if (supervisorId != null) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
      }
      // Sin area asignada no hay recorte posible: el `AND u.area_id = ?` de mas
      // abajo no se anadiria y la consulta saldria sin filtro de ambito.
      if (user.area_id == null) {
        return NextResponse.json({ error: 'No tienes una división asignada.' }, { status: 403 })
      }
    } else if (!esAdministrador(user) && !esSocio(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    let query = `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
      a.inicio, a.fin, a.estado, a.revisado_por, a.revisado_en, a.observacion_revision, a.created_at,
      u.nombre AS usuario_nombre, u.cargo, u.especialidad, u.supervisor_id,
      u.area_id, ar.nombre AS area_nombre,
      ta.nombre AS tipo_actividad_nombre,
      c.nombre AS cliente_nombre,
      COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW()))) FROM pausas p WHERE p.actividad_id = a.id), 0) AS pausa_acumulada_segundos,
      CASE
        WHEN a.fin IS NOT NULL THEN TIMESTAMPDIFF(SECOND, a.inicio, a.fin)
        ELSE TIMESTAMPDIFF(SECOND, a.inicio, NOW())
      END AS duracion_segundos
      FROM actividades a
      INNER JOIN usuarios u ON u.id = a.usuario_id
      INNER JOIN areas ar ON ar.id = u.area_id
      INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
      LEFT JOIN clientes c ON c.id = a.cliente_id
      WHERE ar.empresa_id = ? AND a.estado IN ('PENDIENTE_APROBACION', 'CORRECCION_SOLICITADA', 'APROBADA', 'RECHAZADA')`
    const params: Array<string | number> = [context.activa.id]

    const usuarioFiltro = esPersonal(user) ? user.id : usuarioId
    if (usuarioFiltro != null) {
      query += ' AND a.usuario_id = ?'
      params.push(usuarioFiltro)
    }

    if (supervisorId != null) {
      query += ' AND u.supervisor_id = ?'
      params.push(supervisorId)
    } else if (esSupervisor(user)) {
      query += ' AND u.supervisor_id = ?'
      params.push(user.id)
    } else if (esAdministrador(user)) {
      // El administrador solo revisa las actividades que envian los jefes de área.
      query += " AND u.rol = 'JEFE_AREA'"
    } else if (esJefeDeArea(user) && user.area_id != null) {
      query += ' AND u.area_id = ?'
      params.push(user.area_id)
    }

    query += ' ORDER BY a.created_at DESC'
    const [rows] = await pool.query<RowDataPacket[]>(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener aprobaciones:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
