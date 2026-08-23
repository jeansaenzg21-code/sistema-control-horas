import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const especialidadId = searchParams.get('especialidad_id')

    let query = `SELECT ta.id, ta.especialidad_id, ta.nombre, ta.activo
      FROM tipos_actividad ta WHERE ta.activo = TRUE`
    const params: (string | number)[] = []

    if (especialidadId) {
      query += ' AND ta.especialidad_id = ?'
      params.push(especialidadId)
    }
    query += ' ORDER BY ta.nombre'

    const [rows] = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener tipos de actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
