import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import pool from '@/lib/db'
import { createSession, cleanExpiredSessions } from '@/lib/auth'
import { horarioDeHoy, enRangoHorario } from '@/lib/horarios'

export async function POST(request: Request) {
  try {
    const { usuario, password } = await request.json()

    if (!usuario || !password) {
      return NextResponse.json({ error: 'Usuario y contraseña son requeridos.' }, { status: 400 })
    }

    const [rows] = await pool.query(
      `SELECT id, nombre, correo, usuario, password_hash, rol, area_id, cargo, especialidad, activo
       FROM usuarios WHERE usuario = ?`,
      [usuario.trim().toLowerCase()]
    )

    const usuarios = rows as Array<Record<string, unknown>>
    if (usuarios.length === 0) {
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401 })
    }

    const u = usuarios[0]
    if (!u.activo) {
      return NextResponse.json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' }, { status: 403 })
    }

    const passwordValido = await bcrypt.compare(password, u.password_hash as string)
    if (!passwordValido) {
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401 })
    }

    // Control de horario: si el colaborador tiene un horario configurado para
    // el día de hoy, no se le permite ingresar fuera de su franja laboral.
    const horario = await horarioDeHoy(u.id as number)
    if (horario) {
      const ahora = new Date()
      if (!enRangoHorario(horario.hora_inicio, horario.hora_fin, ahora)) {
        const inicio = horario.hora_inicio.slice(0, 5)
        const fin = horario.hora_fin.slice(0, 5)
        return NextResponse.json(
          {
            error: `Usted se encuentra fuera de servicio. Su horario de trabajo de hoy es de ${inicio} a ${fin}.`,
            code: 'FUERA_DE_SERVICIO',
          },
          { status: 403 }
        )
      }
    }

    const token = await createSession(u.id as number)
    await cleanExpiredSessions()

    const { password_hash: _, ...usuarioSinPassword } = u
    return NextResponse.json({ ok: true, usuario: usuarioSinPassword, token })
  } catch (error) {
    console.error('Error en login:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
