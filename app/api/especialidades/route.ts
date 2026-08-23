import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const areaId = searchParams.get('area_id')

    let query = `SELECT e.id, e.area_id, e.nombre, e.activo
      FROM especialidades e WHERE e.activo = TRUE`
    const params: (string | number)[] = []

    if (areaId) {
      query += ' AND e.area_id = ?'
      params.push(areaId)
    }
    query += ' ORDER BY e.nombre'

    const [rows] = await pool.query(query, params)
    const especialidades = rows as Array<Record<string, unknown>>

    const resultado = await Promise.all(
      especialidades.map(async (e) => {
        const [tipos] = await pool.query(
          'SELECT nombre FROM tipos_actividad WHERE especialidad_id = ? AND activo = TRUE ORDER BY nombre',
          [e.id]
        )
        return {
          ...e,
          tipos_actividad: (tipos as Array<{ nombre: string }>).map((t) => t.nombre),
        }
      })
    )

    return NextResponse.json(resultado)
  } catch (error) {
    console.error('Error al obtener especialidades:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { area_id, nombre } = body

    if (!area_id || !nombre?.trim()) {
      return NextResponse.json({ error: 'area_id y nombre son obligatorios.' }, { status: 400 })
    }

    const [existe] = await pool.query(
      'SELECT id FROM especialidades WHERE area_id = ? AND nombre = ?',
      [area_id, nombre.trim()]
    )
    if ((existe as unknown[]).length > 0) {
      return NextResponse.json({ error: 'La especialidad ya existe en esta área.' }, { status: 400 })
    }

    const [result] = await pool.query(
      'INSERT INTO especialidades (area_id, nombre) VALUES (?, ?)',
      [area_id, nombre.trim()]
    )

    const id = (result as { insertId: number }).insertId
    return NextResponse.json({ id, area_id, nombre: nombre.trim(), activo: true })
  } catch (error) {
    console.error('Error al crear especialidad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'id es obligatorio.' }, { status: 400 })
    }

    await pool.query('DELETE FROM especialidades WHERE id = ?', [id])
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar especialidad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
