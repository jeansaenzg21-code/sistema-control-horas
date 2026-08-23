import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { nombre, correo, usuario, password, rol, area_id, especialidad, activo } = body

    const campos: string[] = []
    const valores: unknown[] = []

    if (nombre != null) { campos.push('nombre = ?'); valores.push(nombre) }
    if (correo != null) { campos.push('correo = ?'); valores.push(correo) }
    if (usuario != null) { campos.push('usuario = ?'); valores.push(usuario) }
    if (rol != null) {
      const rolDb = rol === 'personal' ? 'PERSONAL' : rol === 'supervisor' ? 'SUPERVISOR' : 'ADMINISTRACION'
      campos.push('rol = ?'); valores.push(rolDb)
    }
    if (area_id != null) { campos.push('area_id = ?'); valores.push(area_id) }
    if (especialidad != null) { campos.push('especialidad = ?'); valores.push(especialidad) }
    if (activo != null) { campos.push('activo = ?'); valores.push(activo) }
    if (password) {
      const hash = await bcrypt.hash(password, 10)
      campos.push('password_hash = ?'); valores.push(hash)
    }

    if (campos.length === 0) {
      return NextResponse.json({ error: 'Sin cambios para guardar.' }, { status: 400 })
    }

    valores.push(id)
    await pool.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, valores)

    const [rows] = await pool.query(
      `SELECT u.id, u.nombre, COALESCE(u.correo, '') AS correo, u.usuario, u.rol, u.area_id, u.especialidad,
              u.supervisor_id, u.activo, u.created_at,
              a.nombre AS area_nombre
       FROM usuarios u
       LEFT JOIN areas a ON a.id = u.area_id
       WHERE u.id = ?`,
      [id]
    )
    return NextResponse.json({ usuario: (rows as unknown[])[0] })
  } catch (error) {
    console.error('Error al actualizar usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await pool.query('DELETE FROM usuarios WHERE id = ?', [id])
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
