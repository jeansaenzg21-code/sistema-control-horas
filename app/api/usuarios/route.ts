import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import bcrypt from 'bcryptjs'

const SELECT_USUARIOS = `
  SELECT u.id, u.nombre, u.correo, u.usuario, u.rol, u.area_id, u.especialidad,
         u.supervisor_id, u.activo, u.created_at,
         a.nombre AS area_nombre
  FROM usuarios u
  LEFT JOIN areas a ON a.id = u.area_id
`

export async function GET() {
  try {
    const [rows] = await pool.query(`${SELECT_USUARIOS} ORDER BY u.nombre`)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener usuarios:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { nombre, correo, usuario, password, rol, area_id, especialidad, supervisor_id } = body

    if (!nombre?.trim() || !usuario?.trim()) {
      return NextResponse.json({ error: 'Nombre y usuario son obligatorios.' }, { status: 400 })
    }
    if (!password) {
      return NextResponse.json({ error: 'La contraseña es obligatoria.' }, { status: 400 })
    }

    const [existe] = await pool.query('SELECT id FROM usuarios WHERE usuario = ?', [usuario])
    if ((existe as unknown[]).length > 0) {
      return NextResponse.json({ error: 'El nombre de usuario ya existe.' }, { status: 400 })
    }

    const hash = await bcrypt.hash(password, 10)
    const rolDb = rol === 'personal' ? 'PERSONAL' : rol === 'supervisor' ? 'SUPERVISOR' : 'ADMINISTRACION'

    const [result] = await pool.query(
      `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, especialidad, supervisor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre.trim(), correo?.trim() || '', usuario.trim(), hash, rolDb, area_id || null, especialidad || null, supervisor_id || null]
    )

    const id = (result as { insertId: number }).insertId
    const [rows] = await pool.query(`${SELECT_USUARIOS} WHERE u.id = ?`, [id])
    return NextResponse.json({ usuario: (rows as unknown[])[0] })
  } catch (error) {
    console.error('Error al crear usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
