import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { nombre, descripcion, pais, ciudad } = await request.json()

    if (!nombre?.trim()) {
      return NextResponse.json({ error: 'El nombre de la empresa es obligatorio.' }, { status: 400 })
    }
    if (!pais?.trim()) {
      return NextResponse.json({ error: 'El país es obligatorio.' }, { status: 400 })
    }

    const [existe] = await pool.query('SELECT id FROM empresa LIMIT 1')
    if ((existe as unknown[]).length > 0) {
      return NextResponse.json({ error: 'La empresa ya está configurada.' }, { status: 400 })
    }

    const [result] = await pool.query(
      'INSERT INTO empresa (nombre, descripcion, pais, ciudad) VALUES (?, ?, ?, ?)',
      [nombre.trim(), descripcion?.trim() || null, pais.trim(), ciudad?.trim() || null]
    )

    return NextResponse.json({ ok: true, id: (result as { insertId: number }).insertId })
  } catch (error) {
    console.error('Error al crear empresa:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
