import { NextResponse } from 'next/server'
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import {
  crearObservacion,
  obtenerActividadObservacion,
  obtenerObservacionCreada,
  obtenerUltimaSolicitudCorreccion,
} from '@/lib/observaciones'
import { notificarRevisoresActividad } from '@/lib/notificaciones'

const CONTENIDO_MAX = 2000

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let conexion: PoolConnection | null = null
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const actividadId = Number((await params).id)
    if (!Number.isInteger(actividadId) || actividadId <= 0) {
      return NextResponse.json({ error: 'La actividad no es válida.' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const valorComentario = body.contenido ?? body.respuesta ?? body.comentario
    let contenido = 'El propietario corrigió y reenvió la actividad para revisión.'
    if (valorComentario != null) {
      if (typeof valorComentario !== 'string' || !valorComentario.trim()) {
        return NextResponse.json({ error: 'El comentario no es válido.' }, { status: 400 })
      }
      contenido = valorComentario.trim()
      if (contenido.length > CONTENIDO_MAX) {
        return NextResponse.json(
          { error: `El comentario no puede superar ${CONTENIDO_MAX} caracteres.` },
          { status: 400 },
        )
      }
    }

    conexion = await pool.getConnection()
    await conexion.beginTransaction()
    const actividad = await obtenerActividadObservacion(
      conexion,
      actividadId,
      context.activa.id,
      true,
    )
    if (!actividad) {
      await conexion.rollback()
      return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
    }
    if (actividad.usuario_id !== user.id) {
      await conexion.rollback()
      return NextResponse.json({ error: 'Sólo el propietario puede reenviar la actividad.' }, { status: 403 })
    }
    if (actividad.estado !== 'CORRECCION_SOLICITADA') {
      await conexion.rollback()
      return NextResponse.json(
        { error: 'La actividad no está en CORRECCION_SOLICITADA.' },
        { status: 409 },
      )
    }

    const solicitud = await obtenerUltimaSolicitudCorreccion(
      conexion,
      context.activa.id,
      actividad.id,
      user.id,
    )
    if (!solicitud || solicitud.visibilidad !== 'TRABAJADOR') {
      await conexion.rollback()
      return NextResponse.json(
        { error: 'No existe una solicitud de corrección visible para esta actividad.' },
        { status: 409 },
      )
    }
    const [respuestas] = await conexion.query<RowDataPacket[]>(
      `SELECT id
       FROM observaciones
       WHERE empresa_id = ?
         AND actividad_id = ?
         AND parent_id = ?
         AND tipo = 'RESPUESTA'
         AND visibilidad = 'TRABAJADOR'
       LIMIT 1`,
      [context.activa.id, actividad.id, solicitud.id],
    )
    if (respuestas.length === 0) {
      await conexion.rollback()
      return NextResponse.json(
        { error: 'Debes registrar la corrección antes de reenviar la actividad.' },
        { status: 409 },
      )
    }

    const [actualizacion] = await conexion.query<ResultSetHeader>(
      `UPDATE actividades
       SET estado = 'PENDIENTE_APROBACION',
           revisado_por = NULL,
           revisado_en = NULL,
           observacion_revision = NULL
       WHERE id = ? AND estado = 'CORRECCION_SOLICITADA'`,
      [actividad.id],
    )
    if (actualizacion.affectedRows !== 1) {
      throw new Error('La actividad cambió de estado durante el reenvío.')
    }

    const observacionId = await crearObservacion(conexion, {
      modulo: 'APROBACIONES',
      actividad_id: actividad.id,
      usuario_destino_id: actividad.usuario_id,
      periodo_anio: actividad.periodo_anio,
      periodo_mes: actividad.periodo_mes,
      autor_id: user.id,
      empresa_id: context.activa.id,
      visibilidad: 'TRABAJADOR',
      tipo: 'REENVIO',
      contenido,
      estado_atencion: 'RESUELTA',
      parent_id: solicitud.id,
    })
    await conexion.commit()
    conexion.release()
    conexion = null

    const observacion = await obtenerObservacionCreada(observacionId, context.activa.id)
    if (!observacion) {
      return NextResponse.json({ error: 'No se pudo recuperar el reenvío.' }, { status: 500 })
    }
    await notificarRevisoresActividad(
      context.activa.id,
      actividad.usuario_id,
      'aprobacion',
      'Actividad lista para aprobar',
      contenido,
      `/aprobaciones?actividad=${actividad.id}&observacion=${observacion.id}`,
      `reenvio-aprobacion:${observacion.id}`,
    )
    return NextResponse.json({
      ok: true,
      actividad_id: actividad.id,
      estado: 'PENDIENTE_APROBACION',
      observacion,
    })
  } catch (error) {
    if (conexion) {
      await conexion.rollback().catch(() => undefined)
    }
    console.error('Error al reenviar actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  } finally {
    if (conexion) {
      conexion.release()
      conexion = null
    }
  }
}
