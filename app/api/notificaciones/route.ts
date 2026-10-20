import { esAdministrador } from '@/lib/permisos'
import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { crearNotificacion } from '@/lib/notificaciones'

function validarTexto(valor: unknown, nombre: string, maximo: number): string | null {
  if (typeof valor !== 'string') return `${nombre} no es válido.`
  const texto = valor.trim()
  if (!texto) return `${nombre} es obligatorio.`
  if (texto.length > maximo) return `${nombre} es demasiado largo.`
  return texto
}

function validarUrl(valor: unknown): { ok: true; url: string | null } | { ok: false; error: string } {
  if (valor == null || valor === '') return { ok: true, url: null }
  if (typeof valor !== 'string') return { ok: false, error: 'La URL no es válida.' }
  const url = valor.trim()
  if (!url.startsWith('/') || url.startsWith('//') || url.length > 1000) {
    return { ok: false, error: 'La URL debe ser interna.' }
  }
  return { ok: true, url }
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }
    const usuarioId = Number(new URL(request.url).searchParams.get('usuario_id'))
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return NextResponse.json({ error: 'usuario_id requerido.' }, { status: 400 })
    }
    if (usuarioId !== user.id) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, tipo, titulo, mensaje, url, leida, created_at
       FROM notificaciones
       WHERE usuario_id = ?
         AND empresa_id = ?
         AND tipo NOT IN ('nota_interna', 'NOTA_INTERNA')
       ORDER BY created_at DESC
       LIMIT 50`,
      [user.id, context.activa.id]
    )
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener notificaciones:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const targetId = Number(body.usuario_id)
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return NextResponse.json({ error: 'usuario_id requerido.' }, { status: 400 })
    }
    if (targetId !== user.id && !esAdministrador(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    if (typeof body.titulo !== 'string' || !body.titulo.trim()) {
      return NextResponse.json({ error: 'El título es obligatorio.' }, { status: 400 })
    }
    const titulo = body.titulo.trim()
    if (titulo.length > 255) {
      return NextResponse.json({ error: 'El título es demasiado largo.' }, { status: 400 })
    }
    if (body.tipo != null && typeof body.tipo !== 'string') {
      return NextResponse.json({ error: 'El tipo no es válido.' }, { status: 400 })
    }
    const tipo = body.tipo == null ? 'general' : body.tipo.trim()
    if (!tipo || tipo.length > 50) {
      return NextResponse.json({ error: 'El tipo no es válido.' }, { status: 400 })
    }
    if (tipo.toLowerCase() === 'nota_interna') {
      return NextResponse.json({ error: 'Ese tipo de notificación no está permitido.' }, { status: 400 })
    }
    let mensaje: string | null = null
    if (body.mensaje != null && body.mensaje !== '') {
      const mensajeValidado = validarTexto(body.mensaje, 'El mensaje', 2000)
      if (mensajeValidado) {
        return NextResponse.json({ error: mensajeValidado }, { status: 400 })
      }
      mensaje = String(body.mensaje).trim()
    }
    const urlValidada = validarUrl(body.url)
    if (!urlValidada.ok) {
      return NextResponse.json({ error: urlValidada.error }, { status: 400 })
    }

    const [destinos] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.rol, ar.empresa_id
       FROM usuarios u
       LEFT JOIN areas ar ON ar.id = u.area_id
       WHERE u.id = ? AND u.activo = TRUE
       LIMIT 1`,
      [targetId]
    )
    const destino = destinos[0]
    if (!destino) {
      return NextResponse.json({ error: 'El destinatario no existe o está inactivo.' }, { status: 400 })
    }
    if (Number(destino.empresa_id) !== context.activa.id) {
      return NextResponse.json(
        { error: 'El destinatario no pertenece a la empresa activa.' },
        { status: 400 },
      )
    }

    await crearNotificacion({
      usuario_id: targetId,
      empresa_id: context.activa.id,
      tipo,
      titulo,
      mensaje,
      url: urlValidada.url,
      clave_deduplicacion: `manual:${randomUUID()}`,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al crear notificación:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const targetId = Number(body.usuario_id)
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return NextResponse.json({ error: 'usuario_id requerido.' }, { status: 400 })
    }
    if (targetId !== user.id) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    if (body.marcar_todas === true) {
      await pool.query(
        `UPDATE notificaciones
         SET leida = TRUE
         WHERE usuario_id = ? AND empresa_id = ? AND leida = FALSE`,
        [user.id, context.activa.id]
      )
    } else if (body.notificacion_id != null) {
      const notificacionId = Number(body.notificacion_id)
      if (!Number.isInteger(notificacionId) || notificacionId <= 0) {
        return NextResponse.json({ error: 'La notificación no es válida.' }, { status: 400 })
      }
      await pool.query(
        `UPDATE notificaciones
         SET leida = TRUE
         WHERE id = ? AND usuario_id = ? AND empresa_id = ?`,
        [notificacionId, user.id, context.activa.id]
      )
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al actualizar notificación:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
