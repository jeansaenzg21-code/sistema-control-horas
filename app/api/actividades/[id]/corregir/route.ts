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
const CAMPOS_PROHIBIDOS = [
  'inicio',
  'fin',
  'pausas',
  'pausa_inicio',
  'pausa_fin',
  'estado',
  'usuario_id',
]

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
    for (const campo of CAMPOS_PROHIBIDOS) {
      if (Object.prototype.hasOwnProperty.call(body, campo)) {
        return NextResponse.json(
          { error: `El campo ${campo} no puede modificarse durante una corrección.` },
          { status: 400 },
        )
      }
    }

    const campos: string[] = []
    const valores: Array<string | number | null> = []
    if (Object.prototype.hasOwnProperty.call(body, 'cliente_id')) {
      if (body.cliente_id === null) {
        campos.push('cliente_id = ?')
        valores.push(null)
      } else {
        const clienteId = Number(body.cliente_id)
        if (!Number.isInteger(clienteId) || clienteId <= 0) {
          return NextResponse.json({ error: 'El cliente no es válido.' }, { status: 400 })
        }
        const [clientes] = await pool.query<RowDataPacket[]>(
          `SELECT c.id
           FROM clientes c
           INNER JOIN areas ar ON ar.id = c.area_id
           WHERE c.id = ? AND c.activo = TRUE AND ar.empresa_id = ?
           LIMIT 1`,
          [clienteId, context.activa.id],
        )
        if (clientes.length === 0) {
          return NextResponse.json(
            { error: 'El cliente no pertenece a la empresa activa.' },
            { status: 400 },
          )
        }
        campos.push('cliente_id = ?')
        valores.push(clienteId)
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'descripcion')) {
      if (body.descripcion !== null && typeof body.descripcion !== 'string') {
        return NextResponse.json({ error: 'La descripción no es válida.' }, { status: 400 })
      }
      const descripcion = body.descripcion == null
        ? null
        : String(body.descripcion).trim()
      if (descripcion && descripcion.length > CONTENIDO_MAX) {
        return NextResponse.json(
          { error: `La descripción no puede superar ${CONTENIDO_MAX} caracteres.` },
          { status: 400 },
        )
      }
      campos.push('descripcion = ?')
      valores.push(descripcion || null)
    }

    if (Object.prototype.hasOwnProperty.call(body, 'facturable')) {
      if (body.facturable !== null && typeof body.facturable !== 'boolean') {
        return NextResponse.json({ error: 'El valor facturable no es válido.' }, { status: 400 })
      }
      campos.push('facturable = ?')
      valores.push(typeof body.facturable === 'boolean' ? (body.facturable ? 1 : 0) : null)
    }

    if (campos.length === 0) {
      return NextResponse.json(
        { error: 'Debes corregir al menos cliente_id, descripcion o facturable.' },
        { status: 400 },
      )
    }

    const valorRespuesta = body.respuesta ?? body.contenido
    let respuesta = 'El propietario corrigió los datos de la actividad.'
    if (valorRespuesta != null) {
      if (typeof valorRespuesta !== 'string' || !valorRespuesta.trim()) {
        return NextResponse.json({ error: 'La respuesta no es válida.' }, { status: 400 })
      }
      respuesta = valorRespuesta.trim()
      if (respuesta.length > CONTENIDO_MAX) {
        return NextResponse.json(
          { error: `La respuesta no puede superar ${CONTENIDO_MAX} caracteres.` },
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
      return NextResponse.json({ error: 'Sólo el propietario puede corregir la actividad.' }, { status: 403 })
    }
    if (actividad.estado !== 'CORRECCION_SOLICITADA') {
      await conexion.rollback()
      return NextResponse.json(
        { error: 'La actividad no tiene una corrección solicitada.' },
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

    valores.push(actividad.id)
    const [actualizacion] = await conexion.query<ResultSetHeader>(
      `UPDATE actividades SET ${campos.join(', ')} WHERE id = ? AND estado = 'CORRECCION_SOLICITADA'`,
      valores,
    )
    if (actualizacion.affectedRows !== 1) {
      throw new Error('La actividad cambió de estado durante la corrección.')
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
      tipo: 'RESPUESTA',
      contenido: respuesta,
      estado_atencion: 'ATENDIDA',
      parent_id: solicitud.id,
    })
    await conexion.query<ResultSetHeader>(
      `UPDATE observaciones
       SET estado_atencion = 'ATENDIDA', updated_at = NOW()
       WHERE id = ? AND empresa_id = ? AND estado_atencion = 'ABIERTA'`,
      [solicitud.id, context.activa.id],
    )
    await conexion.commit()
    conexion.release()
    conexion = null

    const observacion = await obtenerObservacionCreada(observacionId, context.activa.id)
    if (!observacion) {
      return NextResponse.json({ error: 'No se pudo recuperar la respuesta.' }, { status: 500 })
    }
    await notificarRevisoresActividad(
      context.activa.id,
      actividad.usuario_id,
      'respuesta_correccion',
      'Actividad corregida',
      respuesta,
      `/aprobaciones?actividad=${actividad.id}&observacion=${observacion.id}`,
      `respuesta-correccion:${observacion.id}`,
    )
    return NextResponse.json({
      ok: true,
      actividad_id: actividad.id,
      estado: 'CORRECCION_SOLICITADA',
      observacion,
    })
  } catch (error) {
    if (conexion) {
      await conexion.rollback().catch(() => undefined)
    }
    console.error('Error al corregir actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  } finally {
    if (conexion) {
      conexion.release()
      conexion = null
    }
  }
}
