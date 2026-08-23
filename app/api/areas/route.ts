import { NextResponse } from 'next/server'
import pool from '@/lib/db'

function parseJson(val: unknown): unknown[] {
  if (!val) return []
  const str = Buffer.isBuffer(val) ? val.toString('utf-8') : String(val)
  try {
    return JSON.parse(str)
  } catch {
    return []
  }
}

export async function GET() {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.empresa_id, a.nombre, a.descripcion, a.activo,
        (SELECT COUNT(*) FROM usuarios u WHERE u.area_id = a.id) AS total_usuarios
       FROM areas a
       WHERE a.activo = TRUE
       ORDER BY a.nombre`
    )
    const areasRaw = rows as Array<Record<string, unknown>>

    const areas = await Promise.all(
      areasRaw.map(async (a) => {
        const [espRows] = await pool.query(
          'SELECT nombre FROM especialidades WHERE area_id = ? AND activo = TRUE ORDER BY nombre',
          [a.id]
        )
        const especialidades = (espRows as Array<{ nombre: string }>).map((e) => e.nombre)
        return { ...a, especialidades }
      })
    )

    return NextResponse.json(areas)
  } catch (error) {
    console.error('Error al obtener áreas:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { nombre, descripcion } = await request.json()
    if (!nombre?.trim()) {
      return NextResponse.json({ error: 'El nombre del área es obligatorio.' }, { status: 400 })
    }
    const [result] = await pool.query(
      'INSERT INTO areas (empresa_id, nombre, descripcion) VALUES (1, ?, ?)',
      [nombre.trim(), descripcion?.trim() || null]
    )
    const insertId = (result as { insertId: number }).insertId
    return NextResponse.json({ ok: true, id: insertId })
  } catch (error) {
    console.error('Error al crear área:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const { id, nombre, descripcion } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    }
    await pool.query(
      'UPDATE areas SET nombre = COALESCE(?, nombre), descripcion = COALESCE(?, descripcion) WHERE id = ?',
      [nombre?.trim() || null, descripcion?.trim() ?? null, id]
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al actualizar área:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    }
    await pool.query('UPDATE areas SET activo = FALSE WHERE id = ?', [id])
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar área:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
