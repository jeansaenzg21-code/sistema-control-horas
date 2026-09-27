import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import pool from '@/lib/db'
import { cookiesSesion, createSession, cleanExpiredSessions } from '@/lib/auth'
import { horarioDeHoy, enRangoHorario } from '@/lib/horarios'

export async function POST(request: Request) {
  try {
    const { usuario, password } = await request.json()

    if (!usuario || !password) {
      return NextResponse.json({ error: 'Usuario y contraseÃ±a son requeridos.' }, { status: 400 })
    }

    const [rows] = await pool.query(
      `SELECT id, nombre, correo, usuario, password_hash, rol, area_id, cargo, especialidad, activo
       FROM usuarios WHERE usuario = ?`,
      [usuario.trim().toLowerCase()]
    )

    const usuarios = rows as Array<Record<string, unknown>>
    if (usuarios.length === 0) {
      return NextResponse.json({ error: 'Usuario o contraseÃ±a incorrectos.' }, { status: 401 })
    }

    const u = usuarios[0]
    if (!u.activo) {
      return NextResponse.json({ error: 'Tu cuenta estÃ¡ desactivada. Contacta al administrador.' }, { status: 403 })
    }

    const passwordValido = await bcrypt.compare(password, u.password_hash as string)
    if (!passwordValido) {
      return NextResponse.json({ error: 'Usuario o contraseÃ±a incorrectos.' }, { status: 401 })
    }

    // Control de horario: si el colaborador tiene un horario configurado para
    // el dÃ­a de hoy, no se le permite ingresar fuera de su franja laboral.
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

    // El cuerpo lleva el token de acceso, como hasta ahora, para no romper a la
    // app mÃ³vil ni a los clientes web ya desplegados. AdemÃ¡s se emite un token
    // de renovaciÃ³n que viaja en una cookie HttpOnly: es lo que permitirÃ¡
    // renovar la sesiÃ³n mÃ¡s adelante sin volver a pedir la contraseÃ±a.
    const sesion = await createSession(u.id as number, resumirDispositivo(request.headers.get('user-agent')))
    await cleanExpiredSessions()

    const { password_hash: _, ...usuarioSinPassword } = u
    // El navegador recibe las dos credenciales SOLO en cookies HttpOnly: su
    // JavaScript no puede leerlas. La app móvil no puede aprovechar cookies
    // (no comparte el almacén con el navegador), así que pide el token de
    // renovación en el cuerpo mediante esta cabecera. Es la única razón por la
    // que el token sale alguna vez de la respuesta del servidor.
    const esMovil = request.headers.get('x-cliente') === 'movil'

    const cabeceras = new Headers()
    for (const cookie of cookiesSesion(sesion.token, sesion.expiraAcceso, sesion.refreshToken, sesion.expiraRenovacion)) {
      cabeceras.append('Set-Cookie', cookie)
    }

    return NextResponse.json(
      {
        ok: true,
        usuario: usuarioSinPassword,
        token: sesion.token,
        expira_en: sesion.expiraAcceso.toISOString(),
        ...(esMovil ? { refresh_token: sesion.refreshToken } : {}),
      },
      { headers: cabeceras }
    )
  } catch (error) {
    console.error('Error en login:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

// Una etiqueta corta para que el usuario reconozca en quÃ© equipos estÃ¡
// conectado. No se guardan datos del dispositivo mÃ¡s allÃ¡ del user-agent.
function resumirDispositivo(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  const sistema = /Android/i.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? 'iPhone'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Mac OS/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : null
  if (!sistema) return null
  const navegador = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /Chrome\//i.test(userAgent)
      ? 'Chrome'
      : /Safari\//i.test(userAgent)
        ? 'Safari'
        : /Firefox\//i.test(userAgent)
          ? 'Firefox'
          : 'navegador'
  return `${sistema} Â· ${navegador}`
}
