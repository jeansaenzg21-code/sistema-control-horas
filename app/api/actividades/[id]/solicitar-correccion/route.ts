import { NextResponse } from 'next/server'
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import {
  crearObservacion,
  obtenerActividadObservacion,
  obtenerObservacionCreada,
  notificarObservacionVisible,
  puedeRevisarActividad,
} from '@/lib/observaciones'

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
    const valorContenido = body.contenido ?? body.observacion ?? body.motivo
    if (typeof valorContenido !== 'string' || !valorContenido.trim()) {
      return NextResponse.json({ error: 'La observación de corrección es obligatoria.' }, { status: 400 })
    }
    const contenido = valorContenido.trim()
    if (contenido.length > CONTENIDO_MAX) {
      return NextResponse.json(
        { error: `La observación no puede superar ${CONTENIDO_MAX} caracteres.` },
        { status: 400 },
      )
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
    if (!puedeRevisarActividad(user, actividad)) {
      await conexion.rollback()
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    if (actividad.estado !== 'PENDIENTE_APROBACION') {
      await conexion.rollback()
      return NextResponse.json(
        { error: 'Sólo se puede solicitar corrección desde PENDIENTE_APROBACION.' },
        { status: 409 },
      )
    }

    const [actualizacion] = await conexion.query<ResultSetHeader>(
      `UPDATE actividades
       SET estado = 'CORRECCION_SOLICITADA'
       WHERE id = ? AND estado = 'PENDIENTE_APROBACION'`,
      [actividad.id],
    )
    if (actualizacion.affectedRows !== 1) {
      throw new Error('La actividad cambió de estado durante la solicitud de corrección.')
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
      tipo: 'SOLICITUD_CORRECCION',
      contenido,
      estado_atencion: 'ABIERTA',
      parent_id: null,
    })
    await conexion.commit()
    conexion.release()
    conexion = null

    const observacion = await obtenerObservacionCreada(observacionId, context.activa.id)
    if (!observacion) {
      return NextResponse.json({ error: 'No se pudo recuperar la observación.' }, { status: 500 })
    }
    await notificarObservacionVisible(observacion, 'corregir')
    return NextResponse.json(
      { ok: true, actividad_id: actividad.id, estado: 'CORRECCION_SOLICITADA', observacion },
      { status: 201 },
    )
  } catch (error) {
    if (conexion) {
      await conexion.rollback().catch(() => undefined)
    }
    console.error('Error al solicitar corrección:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  } finally {
    if (conexion) {
      conexion.release()
      conexion = null
    }
  }
}
