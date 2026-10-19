import { NextResponse } from 'next/server'
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import {
  crearObservacion,
  obtenerActividadObservacion,
  obtenerObservacionCreada,
  puedeRevisarActividad,
  puedeVerActividad,
} from '@/lib/observaciones'
import { crearNotificacion } from '@/lib/notificaciones'

const OBSERVACION_MAX = 2000

async function getContextoActivo(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return { error: 'No autorizado.', status: 401 } as const
  const context = await getEmpresaContext(user)
  if (!context.activa) return { error: 'No hay una empresa activa.', status: 409 } as const
  return { user, empresaId: context.activa.id } as const
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getContextoActivo(request)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const actividadId = Number((await params).id)
    if (!Number.isInteger(actividadId) || actividadId <= 0) {
      return NextResponse.json({ error: 'La actividad no es válida.' }, { status: 400 })
    }
    const actividad = await obtenerActividadObservacion(
      pool,
      actividadId,
      context.empresaId,
    )
    if (!actividad) {
      return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
    }
    if (!puedeVerActividad(context.user, actividad)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
        a.inicio, a.fin, a.estado, a.revisado_por, a.revisado_en, a.observacion_revision, a.created_at,
         u.nombre AS usuario_nombre, u.cargo, u.especialidad,
        ta.nombre AS tipo_actividad_nombre,
        ar.nombre AS area_nombre,
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
       WHERE a.id = ? AND ar.empresa_id = ?`,
      [actividadId, context.empresaId]
    )
    const actividades = rows as Array<Record<string, unknown>>
    if (actividades.length === 0) {
      return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
    }
    return NextResponse.json(actividades[0])
  } catch (error) {
    console.error('Error al obtener actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let conexion: PoolConnection | null = null
  try {
    const context = await getContextoActivo(request)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    // El jefe de área entra: puede revisar los registros de los miembros de SU
    // área. El recorte por área no se decide aquí sino en
    // `puedeRevisarActividad`, que compara el `area_id` de la actividad con el
    // suyo. Quitar este filtro sin añadir aquel abriría la revisión a toda la
    // empresa.
    if (
      context.user.rol !== 'ADMINISTRACION'
      && context.user.rol !== 'SUPERVISOR'
      && context.user.rol !== 'JEFE_AREA'
    ) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const actividadId = Number((await params).id)
    if (!Number.isInteger(actividadId) || actividadId <= 0) {
      return NextResponse.json({ error: 'La actividad no es válida.' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const estado = String(body.estado ?? '')
    if (estado !== 'APROBADA' && estado !== 'RECHAZADA') {
      return NextResponse.json(
        { error: 'La revisión sólo permite APROBADA o RECHAZADA.' },
        { status: 400 },
      )
    }
    if (body.revisado_por != null && Number(body.revisado_por) !== context.user.id) {
      return NextResponse.json(
        { error: 'revisado_por debe coincidir con el usuario autenticado.' },
        { status: 400 },
      )
    }
    if (
      body.facturable !== undefined
      && body.facturable !== null
      && typeof body.facturable !== 'boolean'
    ) {
      return NextResponse.json({ error: 'El valor facturable no es válido.' }, { status: 400 })
    }

    const valorObservacion = estado === 'RECHAZADA'
      ? body.observacion_revision ?? body.observacion ?? body.contenido ?? body.motivo
      : body.observacion_revision ?? body.observacion ?? body.contenido
    let observacionTexto = ''
    if (valorObservacion != null) {
      if (typeof valorObservacion !== 'string' || !valorObservacion.trim()) {
        return NextResponse.json(
          { error: estado === 'RECHAZADA' ? 'El motivo de rechazo es obligatorio.' : 'La observación no es válida.' },
          { status: 400 },
        )
      }
      observacionTexto = valorObservacion.trim()
      if (observacionTexto.length > OBSERVACION_MAX) {
        return NextResponse.json(
          { error: `La observación no puede superar ${OBSERVACION_MAX} caracteres.` },
          { status: 400 },
        )
      }
    }
    if (estado === 'RECHAZADA' && !observacionTexto) {
      return NextResponse.json({ error: 'El motivo de rechazo es obligatorio.' }, { status: 400 })
    }

    conexion = await pool.getConnection()
    await conexion.beginTransaction()
    const actividad = await obtenerActividadObservacion(
      conexion,
      actividadId,
      context.empresaId,
      true,
    )
    if (!actividad) {
      await conexion.rollback()
      return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
    }
    if (!puedeRevisarActividad(context.user, actividad)) {
      await conexion.rollback()
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    if (actividad.estado === 'CORRECCION_SOLICITADA') {
      await conexion.rollback()
      return NextResponse.json(
        { error: 'La actividad debe ser corregida y reenviada antes de revisarse.' },
        { status: 409 },
      )
    }
    if (actividad.estado !== 'PENDIENTE_APROBACION') {
      await conexion.rollback()
      return NextResponse.json(
        { error: 'Sólo una actividad PENDIENTE_APROBACION puede revisarse.' },
        { status: 409 },
      )
    }

    const campos = ['estado = ?', 'revisado_por = ?', 'revisado_en = NOW()']
    const valores: Array<string | number | null> = [estado, context.user.id]
    if (estado === 'APROBADA' && body.facturable !== undefined) {
      campos.push('facturable = ?')
      valores.push(typeof body.facturable === 'boolean' ? (body.facturable ? 1 : 0) : null)
    }
    if (estado === 'APROBADA') {
      campos.push('observacion_revision = NULL')
    } else {
      campos.push('observacion_revision = ?')
      valores.push(observacionTexto)
    }

    const [actualizacion] = await conexion.query<ResultSetHeader>(
      `UPDATE actividades
       SET ${campos.join(', ')}
       WHERE id = ? AND estado = 'PENDIENTE_APROBACION'`,
      [...valores, actividad.id],
    )
    if (actualizacion.affectedRows !== 1) {
      throw new Error('La actividad cambió de estado durante la revisión.')
    }

    const [parents] = await conexion.query<RowDataPacket[]>(
      `SELECT id
       FROM observaciones
       WHERE empresa_id = ?
         AND actividad_id = ?
         AND usuario_destino_id = ?
         AND modulo = 'APROBACIONES'
         AND visibilidad = 'TRABAJADOR'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [context.empresaId, actividad.id, actividad.usuario_id],
    )
    const parentId = parents.length === 0 ? null : Number(parents[0].id)
    const observacionId = await crearObservacion(conexion, {
      modulo: 'APROBACIONES',
      actividad_id: actividad.id,
      usuario_destino_id: actividad.usuario_id,
      periodo_anio: actividad.periodo_anio,
      periodo_mes: actividad.periodo_mes,
      autor_id: context.user.id,
      empresa_id: context.empresaId,
      visibilidad: 'TRABAJADOR',
      tipo: estado === 'APROBADA' ? 'APROBACION' : 'RECHAZO',
      contenido: observacionTexto || 'La actividad fue aprobada.',
      estado_atencion: 'RESUELTA',
      parent_id: parentId,
    })
    await conexion.query(
      `UPDATE observaciones
       SET estado_atencion = 'RESUELTA', updated_at = NOW()
       WHERE empresa_id = ?
         AND actividad_id = ?
         AND usuario_destino_id = ?
         AND estado_atencion = 'ABIERTA'`,
      [context.empresaId, actividad.id, actividad.usuario_id],
    )
    await conexion.commit()
    conexion.release()
    conexion = null

    const observacion = await obtenerObservacionCreada(observacionId, context.empresaId)
    if (!observacion) {
      return NextResponse.json({ error: 'No se pudo recuperar el evento de revisión.' }, { status: 500 })
    }
    await crearNotificacion({
      usuario_id: actividad.usuario_id,
      empresa_id: context.empresaId,
      tipo: 'aprobacion',
      titulo: estado === 'APROBADA' ? 'Actividad aprobada' : 'Actividad rechazada',
      mensaje: observacion.contenido,
      url: `/actividades?actividad=${actividad.id}&estado=${estado}&observacion=${observacion.id}`,
      clave_deduplicacion: `revision:${observacion.id}`,
    })
    return NextResponse.json({ ok: true, actividad_id: actividad.id, estado, observacion })
  } catch (error) {
    if (conexion) {
      await conexion.rollback().catch(() => undefined)
    }
    console.error('Error al actualizar actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  } finally {
    if (conexion) {
      conexion.release()
      conexion = null
    }
  }
}
