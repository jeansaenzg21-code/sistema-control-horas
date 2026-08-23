import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    const [rows] = await pool.query('SELECT id, nombre, descripcion, pais, ciudad FROM empresa LIMIT 1')
    const empresas = rows as Array<Record<string, unknown>>
    if (empresas.length === 0) {
      return NextResponse.json({ error: 'No hay empresa configurada.' }, { status: 404 })
    }
    return NextResponse.json(empresas[0])
  } catch (error) {
    console.error('Error al obtener empresa:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const { nombre, descripcion, pais, ciudad } = await request.json()
    await pool.query(
      'UPDATE empresa SET nombre = ?, descripcion = ?, pais = ?, ciudad = ? WHERE id = 1',
      [nombre, descripcion, pais, ciudad]
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al actualizar empresa:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
