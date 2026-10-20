import { esJefeDeArea, esPersonal } from '@/lib/permisos'
import { NextResponse } from 'next/server'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import {
  crearObservacion,
  obtenerActividadObservacion,
  obtenerObservacionCreada,
  obtenerParentObservacion,
  obtenerTimelineObservaciones,
  puedeRevisarActividad,
  puedeVerActividad,
  notificarObservacionVisible,
  type EstadoAtencion,
  type TipoObservacion,
  type VisibilidadObservacion,
} from '@/lib/observaciones'
import { crearNotificacion } from '@/lib/notificaciones'

const CONTENIDO_MAX = 2000

type ResultadoValidacion<T> =
  | { ok: true; valor: T }
  | { ok: false; error: string }

function validarId(valor: unknown, nombre: string): ResultadoValidacion<number> {
  const id = Number(valor)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: `${nombre} no es válido.` }
  return { ok: true, valor: id }
}

function validarContenido(body: Record<string, unknown>): ResultadoValidacion<string> {
  const valor = body.contenido ?? body.texto
  if (typeof valor !== 'string') return { ok: false, error: 'El contenido es obligatorio.' }
  const contenido = valor.trim()
  if (!contenido) return { ok: false, error: 'El contenido es obligatorio.' }
  if (contenido.length > CONTENIDO_MAX) {
    return { ok: false, error: `El contenido no puede superar ${CONTENIDO_MAX} caracteres.` }
  }
  return { ok: true, valor: contenido }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const idValidado = validarId((await params).id, 'La actividad')
    if (!idValidado.ok) {
      return NextResponse.json({ error: idValidado.error }, { status: 400 })
    }
    const actividad = await obtenerActividadObservacion(pool, idValidado.valor, context.activa.id)
    if (!actividad) {
      return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
    }

    const esRevisor = puedeRevisarActividad(user, actividad)
    if (!esRevisor && !puedeVerActividad(user, actividad)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    const timeline = await obtenerTimelineObservaciones(
      context.activa.id,
      actividad.id,
      esRevisor ? null : user.id,
      !esRevisor,
    )
    return NextResponse.json(timeline)
  } catch (error) {
    console.error('Error al obtener observaciones de actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const idValidado = validarId((await params).id, 'La actividad')
    if (!idValidado.ok) {
      return NextResponse.json({ error: idValidado.error }, { status: 400 })
    }
    const actividad = await obtenerActividadObservacion(pool, idValidado.valor, context.activa.id)
    if (!actividad) {
      return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const contenidoValidado = validarContenido(body)
    if (!contenidoValidado.ok) {
      return NextResponse.json({ error: contenidoValidado.error }, { status: 400 })
    }
    const contenido = contenidoValidado.valor

    let tipo: TipoObservacion
    let visibilidad: VisibilidadObservacion
    let estado: EstadoAtencion = 'ABIERTA'
    let parentId: number | null = null

    const esRevisor = puedeRevisarActividad(user, actividad)
    if (esRevisor) {
      const tipoSolicitado = body.tipo == null ? 'OBSERVACION' : String(body.tipo)
      if (tipoSolicitado !== 'OBSERVACION' && tipoSolicitado !== 'NOTA_INTERNA') {
        return NextResponse.json(
          { error: 'El revisor sólo puede crear OBSERVACION o NOTA_INTERNA.' },
          { status: 400 },
        )
      }
      tipo = tipoSolicitado
      visibilidad = tipo === 'NOTA_INTERNA' ? 'INTERNA' : 'TRABAJADOR'
      if (
        body.visibilidad != null
        && String(body.visibilidad) !== visibilidad
      ) {
        return NextResponse.json(
          { error: 'La visibilidad no corresponde al tipo de observación.' },
          { status: 400 },
        )
      }
      if (body.usuario_destino_id != null) {
        const destino = validarId(body.usuario_destino_id, 'El usuario destino')
        if (!destino.ok) {
          return NextResponse.json({ error: destino.error }, { status: 400 })
        }
        if (destino.valor !== actividad.usuario_id) {
          return NextResponse.json(
            { error: 'La observación debe dirigirse al propietario de la actividad.' },
            { status: 400 },
          )
        }
      }
    } else {
      if ((!esPersonal(user) && !esJefeDeArea(user)) || actividad.usuario_id !== user.id) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
      }
      if (body.tipo != null && String(body.tipo) !== 'RESPUESTA') {
        return NextResponse.json(
          { error: 'El trabajador sólo puede crear RESPUESTA.' },
          { status: 400 },
        )
      }
      if (body.visibilidad != null && String(body.visibilidad) !== 'TRABAJADOR') {
        return NextResponse.json(
          { error: 'Una respuesta debe ser visible para el trabajador.' },
          { status: 400 },
        )
      }
      if (body.parent_id == null) {
        return NextResponse.json(
          { error: 'La respuesta debe indicar la observación que atiende.' },
          { status: 400 },
        )
      }
      const parentValidado = validarId(body.parent_id, 'La observación padre')
      if (!parentValidado.ok) {
        return NextResponse.json({ error: parentValidado.error }, { status: 400 })
      }
      const parent = await obtenerParentObservacion(
        pool,
        parentValidado.valor,
        context.activa.id,
        actividad.id,
        user.id,
      )
      if (!parent || parent.visibilidad !== 'TRABAJADOR') {
        return NextResponse.json(
          { error: 'La observación padre no existe o no es visible para el trabajador.' },
          { status: 400 },
        )
      }
      if (parent.tipo !== 'OBSERVACION' && parent.tipo !== 'SOLICITUD_CORRECCION') {
        return NextResponse.json(
          { error: 'La observación indicada no admite respuestas.' },
          { status: 400 },
        )
      }
      if (parent.estado_atencion !== 'ABIERTA') {
        return NextResponse.json(
          { error: 'La observación ya fue atendida.' },
          { status: 409 },
        )
      }
      tipo = 'RESPUESTA'
      visibilidad = 'TRABAJADOR'
      parentId = parent.id
    }

    if (body.parent_id != null && esRevisor) {
      const parentValidado = validarId(body.parent_id, 'La observación padre')
      if (!parentValidado.ok) {
        return NextResponse.json({ error: parentValidado.error }, { status: 400 })
      }
      const parent = await obtenerParentObservacion(
        pool,
        parentValidado.valor,
        context.activa.id,
        actividad.id,
        actividad.usuario_id,
      )
      if (!parent) {
        return NextResponse.json(
          { error: 'La observación padre no pertenece a la actividad.' },
          { status: 400 },
        )
      }
      if (visibilidad === 'TRABAJADOR' && parent.visibilidad !== 'TRABAJADOR') {
        return NextResponse.json(
          { error: 'No se puede vincular una observación visible a una nota interna.' },
          { status: 400 },
        )
      }
      parentId = parent.id
    }

    const observacionId = await crearObservacion(pool, {
      modulo: 'APROBACIONES',
      actividad_id: actividad.id,
      usuario_destino_id: actividad.usuario_id,
      periodo_anio: actividad.periodo_anio,
      periodo_mes: actividad.periodo_mes,
      autor_id: user.id,
      empresa_id: context.activa.id,
      visibilidad,
      tipo,
      contenido,
      estado_atencion: estado,
      parent_id: parentId,
    })
    const observacion = await obtenerObservacionCreada(observacionId, context.activa.id)
    if (!observacion) {
      return NextResponse.json({ error: 'No se pudo recuperar la observación.' }, { status: 500 })
    }
    if (tipo === 'RESPUESTA' && parentId !== null) {
      await pool.query<ResultSetHeader>(
        `UPDATE observaciones
         SET estado_atencion = 'ATENDIDA', updated_at = NOW()
         WHERE id = ? AND empresa_id = ? AND estado_atencion = 'ABIERTA'`,
        [parentId, context.activa.id],
      )
    }

    if (esRevisor && visibilidad === 'TRABAJADOR') {
      await notificarObservacionVisible(observacion)
    } else if (tipo === 'RESPUESTA' && parentId !== null) {
      const [parents] = await pool.query<Array<{ autor_id: number | null } & RowDataPacket>>(
        `SELECT autor_id FROM observaciones WHERE id = ? AND empresa_id = ? LIMIT 1`,
        [parentId, context.activa.id],
      )
      const autorId = parents[0]?.autor_id
      if (autorId != null) {
        await crearNotificacion({
          usuario_id: Number(autorId),
          empresa_id: context.activa.id,
          tipo: 'respuesta_observacion',
          titulo: 'El trabajador respondió una observación',
          mensaje: contenido,
          url: `/aprobaciones?actividad=${actividad.id}&observacion=${observacion.id}`,
          clave_deduplicacion: `respuesta:${observacion.id}`,
        })
      }
    }

    return NextResponse.json(observacion, { status: 201 })
  } catch (error) {
    console.error('Error al crear observación de actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
