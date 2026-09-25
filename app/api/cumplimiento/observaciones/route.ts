import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import type { SessionUser } from '@/lib/auth'
import {
  crearObservacion,
  notificarObservacionVisible,
  obtenerObservacionCreada,
  type EstadoAtencion,
  type TipoObservacion,
  type VisibilidadObservacion,
} from '@/lib/observaciones'
import { crearNotificacion } from '@/lib/notificaciones'
import { esJefeDeArea } from '@/lib/permisos'

const CONTENIDO_MAX = 2000
type Conexion = Pool | PoolConnection

type ResultadoValidacion<T> =
  | { ok: true; valor: T }
  | { ok: false; error: string; status: number }

interface DatosObservacionCumplimiento {
  usuario_id: number
  anio: number
  mes: number
  contenido: string
  visibilidad: VisibilidadObservacion
}

interface DestinoCumplimiento extends RowDataPacket {
  id: number
  nombre: string
  supervisor_id: number | null
  area_id: number
  empresa_id: number
}

interface FilaObservacionCumplimiento extends RowDataPacket {
  id: number
  usuario_id: number
  contenido: string
  visibilidad: VisibilidadObservacion
  tipo: TipoObservacion
  estado_atencion: EstadoAtencion
  parent_id: number | null
  periodo_anio: number | null
  periodo_mes: number | null
  created_at: Date | string
  autor_id: number | null
  autor_nombre: string | null
  usuario_nombre: string
}

interface ObservacionCumplimiento {
  id: number
  usuario_id: number
  contenido: string
  visibilidad: VisibilidadObservacion
  tipo: TipoObservacion
  estado_atencion: EstadoAtencion
  parent_id: number | null
  created_at: string
  autor_id: number | null
  autor_nombre: string | null
  usuario_nombre: string
}

function validarId(valor: unknown, nombre: string): ResultadoValidacion<number> {
  const id = Number(valor)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: `${nombre} no es válido.`, status: 400 }
  return { ok: true, valor: id }
}

function validarPeriodo(anio: number, mes: number): string | null {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return 'El parámetro anio no es válido.'
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return 'El parámetro mes no es válido.'
  }
  return null
}

function validarContenido(valor: unknown): ResultadoValidacion<string> {
  if (typeof valor !== 'string') {
    return { ok: false, error: 'El contenido es obligatorio.', status: 400 }
  }
  const contenido = valor.trim()
  if (!contenido) {
    return { ok: false, error: 'El contenido es obligatorio.', status: 400 }
  }
  if (contenido.length > CONTENIDO_MAX) {
    return { ok: false, error: `El contenido no puede superar ${CONTENIDO_MAX} caracteres.`, status: 400 }
  }
  return { ok: true, valor: contenido }
}

function validarDatos(body: Record<string, unknown>): ResultadoValidacion<DatosObservacionCumplimiento> {
  const anio = Number(body.anio)
  const mes = Number(body.mes)
  const usuarioId = Number(body.usuario_id)
  const errorPeriodo = validarPeriodo(anio, mes)
  if (errorPeriodo) return { ok: false, error: errorPeriodo, status: 400 }

  const usuarioValidado = validarId(usuarioId, 'El colaborador indicado')
  if (!usuarioValidado.ok) return usuarioValidado
  const contenidoValidado = validarContenido(body.contenido ?? body.texto)
  if (!contenidoValidado.ok) return contenidoValidado

  const visibilidad = body.visibilidad == null
    ? 'TRABAJADOR'
    : String(body.visibilidad)
  if (visibilidad !== 'TRABAJADOR' && visibilidad !== 'INTERNA') {
    return { ok: false, error: 'La visibilidad no es válida.', status: 400 }
  }

  return {
    ok: true,
    valor: {
      usuario_id: usuarioValidado.valor,
      anio,
      mes,
      contenido: contenidoValidado.valor,
      visibilidad,
    },
  }
}

function fechaIso(valor: Date | string | null): string {
  if (valor == null) return ''
  return valor instanceof Date ? valor.toISOString() : String(valor)
}

function serializarObservacion(fila: FilaObservacionCumplimiento): ObservacionCumplimiento {
  return {
    id: Number(fila.id),
    usuario_id: Number(fila.usuario_id),
    contenido: String(fila.contenido),
    visibilidad: fila.visibilidad,
    tipo: fila.tipo,
    estado_atencion: fila.estado_atencion,
    parent_id: fila.parent_id == null ? null : Number(fila.parent_id),
    created_at: fechaIso(fila.created_at),
    autor_id: fila.autor_id == null ? null : Number(fila.autor_id),
    autor_nombre: fila.autor_nombre == null ? null : String(fila.autor_nombre),
    usuario_nombre: String(fila.usuario_nombre),
  }
}

async function obtenerDestino(
  conexion: Conexion,
  usuarioId: number,
  empresaId: number,
): Promise<DestinoCumplimiento | null> {
  const [rows] = await conexion.query<DestinoCumplimiento[]>(
    `SELECT u.id, u.nombre, u.supervisor_id, ar.id AS area_id, ar.empresa_id
     FROM usuarios u
     INNER JOIN areas ar ON ar.id = u.area_id
     WHERE u.id = ?
       AND u.rol = 'PERSONAL'
       AND u.activo = TRUE
       AND ar.empresa_id = ?
     LIMIT 1`,
    [usuarioId, empresaId],
  )
  return rows[0] ?? null
}

function destinoPermitido(user: SessionUser, destino: DestinoCumplimiento): boolean {
  if (user.rol === 'ADMINISTRACION') return true
  if (user.rol === 'SUPERVISOR') return Number(destino.supervisor_id) === user.id
  if (user.rol === 'JEFE_AREA') return user.area_id != null && Number(destino.area_id) === user.area_id
  return user.rol === 'PERSONAL' && Number(destino.id) === user.id
}

async function obtenerObservacionCumplimiento(
  conexion: Conexion,
  observacionId: number,
  empresaId: number,
  bloquear = false,
): Promise<FilaObservacionCumplimiento | null> {
  const [rows] = await conexion.query<FilaObservacionCumplimiento[]>(
    `SELECT
       o.id,
       o.usuario_destino_id AS usuario_id,
       o.contenido,
       o.visibilidad,
       o.tipo,
       o.estado_atencion,
       o.parent_id,
       o.periodo_anio,
       o.periodo_mes,
       o.created_at,
       o.autor_id,
       destino.nombre AS usuario_nombre,
       autor.nombre AS autor_nombre
     FROM observaciones o
     INNER JOIN usuarios destino ON destino.id = o.usuario_destino_id
     LEFT JOIN usuarios autor ON autor.id = o.autor_id
     WHERE o.id = ?
       AND o.empresa_id = ?
       AND o.modulo = 'CUMPLIMIENTO'
     LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`,
    [observacionId, empresaId],
  )
  return rows[0] ?? null
}

async function validarDestinoParaCumplimiento(
  conexion: Conexion,
  user: SessionUser,
  usuarioId: number,
  empresaId: number,
): Promise<DestinoCumplimiento | null> {
  if (user.rol === 'PERSONAL' && usuarioId !== user.id) return null
  const destino = await obtenerDestino(conexion, usuarioId, empresaId)
  return destino && destinoPermitido(user, destino) ? destino : null
}

function parsearRespuesta(
  body: Record<string, unknown>,
): ResultadoValidacion<{ parentId: number; contenido: string }> {
  const parentValidado = validarId(body.parent_id ?? body.observacion_id, 'La observación')
  if (!parentValidado.ok) return parentValidado
  const contenidoValidado = validarContenido(body.contenido ?? body.respuesta)
  if (!contenidoValidado.ok) return contenidoValidado
  return {
    ok: true,
    valor: { parentId: parentValidado.valor, contenido: contenidoValidado.valor },
  }
}

async function responderObservacionCumplimiento(
  user: SessionUser,
  empresaId: number,
  body: Record<string, unknown>,
): Promise<NextResponse> {
  if (user.rol !== 'PERSONAL') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }
  const validado = parsearRespuesta(body)
  if (!validado.ok) {
    return NextResponse.json({ error: validado.error }, { status: validado.status })
  }

  let conexion: PoolConnection | null = null
  try {
    conexion = await pool.getConnection()
    await conexion.beginTransaction()
    const parent = await obtenerObservacionCumplimiento(
      conexion,
      validado.valor.parentId,
      empresaId,
      true,
    )
    if (!parent) {
      await conexion.rollback()
      return NextResponse.json({ error: 'La observación no existe.' }, { status: 404 })
    }
    if (Number(parent.usuario_id) !== user.id || parent.visibilidad !== 'TRABAJADOR') {
      await conexion.rollback()
      return NextResponse.json({ error: 'La observación no está disponible para este trabajador.' }, { status: 403 })
    }
    if (parent.tipo !== 'OBSERVACION' && parent.tipo !== 'SOLICITUD_CORRECCION') {
      await conexion.rollback()
      return NextResponse.json({ error: 'La observación indicada no admite respuestas.' }, { status: 409 })
    }
    if (parent.estado_atencion !== 'ABIERTA') {
      await conexion.rollback()
      return NextResponse.json({ error: 'La observación ya fue atendida.' }, { status: 409 })
    }

    const observacionId = await crearObservacion(conexion, {
      modulo: 'CUMPLIMIENTO',
      actividad_id: null,
      usuario_destino_id: user.id,
      periodo_anio: parent.periodo_anio,
      periodo_mes: parent.periodo_mes,
      autor_id: user.id,
      empresa_id: empresaId,
      visibilidad: 'TRABAJADOR',
      tipo: 'RESPUESTA',
      contenido: validado.valor.contenido,
      estado_atencion: 'ATENDIDA',
      parent_id: parent.id,
    })
    const [actualizacion] = await conexion.query<ResultSetHeader>(
      `UPDATE observaciones
       SET estado_atencion = 'ATENDIDA', updated_at = NOW()
       WHERE id = ? AND empresa_id = ? AND estado_atencion = 'ABIERTA'`,
      [parent.id, empresaId],
    )
    if (actualizacion.affectedRows !== 1) {
      throw new Error('La observación cambió de estado durante la respuesta.')
    }
    await conexion.commit()
    conexion.release()
    conexion = null

    const observacion = await obtenerObservacionCumplimiento(pool, observacionId, empresaId)
    if (!observacion) {
      return NextResponse.json({ error: 'No se pudo recuperar la respuesta.' }, { status: 500 })
    }
    if (parent.autor_id != null && Number(parent.autor_id) !== user.id) {
      await crearNotificacion({
        usuario_id: Number(parent.autor_id),
        empresa_id: empresaId,
        tipo: 'respuesta_observacion',
        titulo: 'El trabajador respondió una observación',
        mensaje: validado.valor.contenido,
        url: `/cumplimiento?anio=${parent.periodo_anio ?? ''}&mes=${parent.periodo_mes ?? ''}&observacion=${observacion.id}`,
        clave_deduplicacion: `respuesta-cumplimiento:${observacion.id}`,
      })
    }
    return NextResponse.json(
      { ok: true, parent_id: parent.id, observacion: serializarObservacion(observacion) },
      { status: 201 },
    )
  } catch (error) {
    if (conexion) await conexion.rollback().catch(() => undefined)
    console.error('Error al responder observación de cumplimiento:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  } finally {
    if (conexion) conexion.release()
  }
}

async function marcarObservacionCumplimiento(
  user: SessionUser,
  empresaId: number,
  body: Record<string, unknown>,
): Promise<NextResponse> {
  if (user.rol !== 'PERSONAL') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }
  const observacionValidada = validarId(body.observacion_id ?? body.parent_id ?? body.id, 'La observación')
  if (!observacionValidada.ok) {
    return NextResponse.json({ error: observacionValidada.error }, { status: observacionValidada.status })
  }

  let conexion: PoolConnection | null = null
  try {
    conexion = await pool.getConnection()
    await conexion.beginTransaction()
    const observacion = await obtenerObservacionCumplimiento(
      conexion,
      observacionValidada.valor,
      empresaId,
      true,
    )
    if (!observacion) {
      await conexion.rollback()
      return NextResponse.json({ error: 'La observación no existe.' }, { status: 404 })
    }
    if (Number(observacion.usuario_id) !== user.id || observacion.visibilidad !== 'TRABAJADOR') {
      await conexion.rollback()
      return NextResponse.json({ error: 'La observación no está disponible para este trabajador.' }, { status: 403 })
    }
    if (observacion.tipo !== 'OBSERVACION' && observacion.tipo !== 'SOLICITUD_CORRECCION') {
      await conexion.rollback()
      return NextResponse.json({ error: 'La observación indicada no se puede marcar como atendida.' }, { status: 409 })
    }
    if (observacion.estado_atencion === 'ABIERTA') {
      const [actualizacion] = await conexion.query<ResultSetHeader>(
        `UPDATE observaciones
         SET estado_atencion = 'ATENDIDA', updated_at = NOW()
         WHERE id = ? AND empresa_id = ? AND estado_atencion = 'ABIERTA'`,
        [observacion.id, empresaId],
      )
      if (actualizacion.affectedRows !== 1) {
        throw new Error('La observación cambió de estado durante la atención.')
      }
    }
    await conexion.commit()
    conexion.release()
    conexion = null

    const actualizada = await obtenerObservacionCumplimiento(pool, observacionValidada.valor, empresaId)
    if (!actualizada) {
      return NextResponse.json({ error: 'No se pudo recuperar la observación.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, observacion: serializarObservacion(actualizada) })
  } catch (error) {
    if (conexion) await conexion.rollback().catch(() => undefined)
    console.error('Error al marcar observación de cumplimiento:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  } finally {
    if (conexion) conexion.release()
  }
}

async function crearObservacionCumplimiento(
  request: Request,
  metodo: 'POST' | 'PUT',
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const accion = String(body.accion ?? '').trim().toUpperCase()
    if (accion === 'RESPONDER') {
      return responderObservacionCumplimiento(user, context.activa.id, body)
    }
    if (accion === 'ATENDER') {
      return marcarObservacionCumplimiento(user, context.activa.id, body)
    }
    if (user.rol !== 'ADMINISTRACION' && user.rol !== 'SUPERVISOR' && user.rol !== 'JEFE_AREA') {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const validado = validarDatos(body)
    if (!validado.ok) {
      return NextResponse.json({ error: validado.error }, { status: validado.status })
    }
    const destino = await validarDestinoParaCumplimiento(
      pool,
      user,
      validado.valor.usuario_id,
      context.activa.id,
    )
    if (!destino) {
      return NextResponse.json(
        { error: 'El colaborador no existe, no pertenece a la empresa activa o no está dentro de tu alcance.' },
        { status: 403 },
      )
    }

    const observacionId = await crearObservacion(pool, {
      modulo: 'CUMPLIMIENTO',
      actividad_id: null,
      usuario_destino_id: destino.id,
      periodo_anio: validado.valor.anio,
      periodo_mes: validado.valor.mes,
      autor_id: user.id,
      empresa_id: context.activa.id,
      visibilidad: validado.valor.visibilidad,
      tipo: 'OBSERVACION',
      contenido: validado.valor.contenido,
      estado_atencion: 'ABIERTA',
      parent_id: null,
    })
    const timeline = await obtenerObservacionCreada(observacionId, context.activa.id)
    if (!timeline) {
      return NextResponse.json({ error: 'No se pudo recuperar la observación.' }, { status: 500 })
    }
    if (validado.valor.visibilidad === 'TRABAJADOR') {
      await notificarObservacionVisible(timeline)
    }
    const fila = await obtenerObservacionCumplimiento(pool, observacionId, context.activa.id)
    if (!fila) {
      return NextResponse.json({ error: 'No se pudo recuperar la observación.' }, { status: 500 })
    }
    return NextResponse.json(
      { ok: true, observacion: serializarObservacion(fila), id: observacionId, metodo },
      { status: metodo === 'POST' ? 201 : 200 },
    )
  } catch (error) {
    console.error('Error al guardar observación de cumplimiento:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const { searchParams } = new URL(request.url)
    const anio = Number(searchParams.get('anio'))
    const mes = Number(searchParams.get('mes'))
    const errorPeriodo = validarPeriodo(anio, mes)
    if (errorPeriodo) {
      return NextResponse.json({ error: errorPeriodo }, { status: 400 })
    }

    const usuarioParam = searchParams.get('usuario_id')
    let usuarioId: number | null = null
    if (usuarioParam != null && usuarioParam !== '') {
      const usuarioValidado = validarId(usuarioParam, 'El colaborador indicado')
      if (!usuarioValidado.ok) {
        return NextResponse.json({ error: usuarioValidado.error }, { status: usuarioValidado.status })
      }
      usuarioId = usuarioValidado.valor
    }
    if (user.rol === 'PERSONAL') {
      if (usuarioId != null && usuarioId !== user.id) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
      }
      usuarioId = user.id
    } else if (user.rol !== 'ADMINISTRACION' && user.rol !== 'SUPERVISOR' && user.rol !== 'JEFE_AREA') {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    if (usuarioId != null) {
      const destino = await validarDestinoParaCumplimiento(pool, user, usuarioId, context.activa.id)
      if (!destino) {
        return NextResponse.json({ error: 'El colaborador no está disponible en esta empresa.' }, { status: 403 })
      }
    }

    const condiciones = [
      'o.empresa_id = ?',
      "o.modulo = 'CUMPLIMIENTO'",
      'o.periodo_anio = ?',
      'o.periodo_mes = ?',
    ]
    const parametros: Array<string | number> = [context.activa.id, anio, mes]
    if (usuarioId != null) {
      condiciones.push('o.usuario_destino_id = ?')
      parametros.push(usuarioId)
    }
    if (user.rol === 'PERSONAL') {
      condiciones.push("o.visibilidad = 'TRABAJADOR'")
    }
    if (user.rol === 'SUPERVISOR') {
      condiciones.push('destino.supervisor_id = ?')
      parametros.push(user.id)
    }
    if (esJefeDeArea(user) && user.area_id != null) {
      condiciones.push('destino.area_id = ?')
      parametros.push(user.area_id)
    }

    const [rows] = await pool.query<FilaObservacionCumplimiento[]>(
      `SELECT
         o.id,
         o.usuario_destino_id AS usuario_id,
         o.contenido,
         o.visibilidad,
         o.tipo,
         o.estado_atencion,
         o.parent_id,
         o.periodo_anio,
         o.periodo_mes,
         o.created_at,
         o.autor_id,
         destino.nombre AS usuario_nombre,
         autor.nombre AS autor_nombre
       FROM observaciones o
       INNER JOIN usuarios destino ON destino.id = o.usuario_destino_id
       LEFT JOIN usuarios autor ON autor.id = o.autor_id
       WHERE ${condiciones.join(' AND ')}
       ORDER BY o.created_at DESC, o.id DESC`,
      parametros,
    )
    return NextResponse.json(rows.map(serializarObservacion))
  } catch (error) {
    console.error('Error al obtener observaciones de cumplimiento:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return crearObservacionCumplimiento(request, 'POST')
}

export async function PUT(request: Request) {
  return crearObservacionCumplimiento(request, 'PUT')
}
