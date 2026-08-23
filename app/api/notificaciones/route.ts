import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const usuarioId = searchParams.get('usuario_id')

    if (!usuarioId) {
      return NextResponse.json({ error: 'usuario_id requerido.' }, { status: 400 })
    }

    const [rows] = await pool.query(
      `SELECT id, tipo, titulo, mensaje, url, leida, created_at
       FROM notificaciones
       WHERE usuario_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [usuarioId]
    )
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener notificaciones:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { usuario_id, tipo, titulo, mensaje, url } = await request.json()

    if (!usuario_id || !titulo) {
      return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 })
    }

    await pool.query(
      `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, url) VALUES (?, ?, ?, ?, ?)`,
      [usuario_id, tipo || 'general', titulo, mensaje || null, url || null]
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al crear notificación:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const { usuario_id, notificacion_id, marcar_todas } = await request.json()

    if (!usuario_id) {
      return NextResponse.json({ error: 'usuario_id requerido.' }, { status: 400 })
    }

    if (marcar_todas) {
      await pool.query(
        'UPDATE notificaciones SET leida = TRUE WHERE usuario_id = ? AND leida = FALSE',
        [usuario_id]
      )
    } else if (notificacion_id) {
      await pool.query(
        'UPDATE notificaciones SET leida = TRUE WHERE id = ? AND usuario_id = ?',
        [notificacion_id, usuario_id]
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al actualizar notificación:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
