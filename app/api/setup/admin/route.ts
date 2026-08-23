import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import pool from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { nombre, correo, usuario, password } = await request.json()

    if (!nombre?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 })
    }
    if (!usuario?.trim()) {
      return NextResponse.json({ error: 'El usuario es obligatorio.' }, { status: 400 })
    }
    if (!password) {
      return NextResponse.json({ error: 'La contraseña es obligatoria.' }, { status: 400 })
    }
    if (password.length < 4) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 4 caracteres.' }, { status: 400 })
    }

    const [existe] = await pool.query('SELECT id FROM usuarios LIMIT 1')
    if ((existe as unknown[]).length > 0) {
      return NextResponse.json({ error: 'Ya existe un usuario administrador.' }, { status: 400 })
    }

    const [existeUsuario] = await pool.query('SELECT id FROM usuarios WHERE usuario = ?', [usuario.trim()])
    if ((existeUsuario as unknown[]).length > 0) {
      return NextResponse.json({ error: 'El nombre de usuario ya existe.' }, { status: 400 })
    }

    const hash = await bcrypt.hash(password, 10)

    const [result] = await pool.query(
      `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, activo)
       VALUES (?, ?, ?, ?, 'ADMINISTRACION', 1, TRUE)`,
      [nombre.trim(), correo?.trim() || '', usuario.trim(), hash]
    )

    return NextResponse.json({ ok: true, id: (result as { insertId: number }).insertId })
  } catch (error) {
    console.error('Error al crear administrador:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
