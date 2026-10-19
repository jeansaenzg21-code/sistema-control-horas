import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import pool from '@/lib/db'
import { cookiesSesion, createSession, cleanExpiredSessions } from '@/lib/auth'
import { horarioDeHoy, enRangoHorario } from '@/lib/horarios'
import { bloqueadoPorIntentos, registrarIntentoFallido, limpiarIntentos, obtenerIp } from '@/lib/intentos-login'

/**
 * Hash falso con el que se compara la contraseña cuando el usuario NO existe.
 *
 * Sirve para que el tiempo de respuesta sea el mismo en los tres casos y para
 * no revelar si una cuenta existe. Sin él, "usuario inexistente" respondería
 * al instante y "contraseña incorrecta" tras el costo de bcrypt: con esa
 * diferencia ya se puede adivinar qué usuarios hay en el sistema.
 *
 * Es un hash bcrypt valido, asi que la comparacion no revienta: simplemente
 * devuelve false.
 */
const HASH_FIJO = '$2b$12$8d96Hq2EyX0bczSxuajJ.OHxujhAzrpcEaLJmRKdsO6lgS.fO6uTC'

const ERROR_CREDENCIALES = 'Usuario o contraseña incorrectos.'

export async function POST(request: Request) {
  try {
    const cuerpo = await request.json().catch(() => ({})) as {
      usuario?: unknown
      password?: unknown
    }
    const usuario = typeof cuerpo.usuario === 'string' ? cuerpo.usuario : ''
    const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''

    if (!usuario.trim() || !password) {
      return NextResponse.json({ error: 'Usuario y contraseña son requeridos.' }, { status: 400 })
    }

    // Una clave estable para el bloqueo: sin espacios y en minusculas, igual que
    // el `usuario` de la tabla.
    const usuarioClave = usuario.trim().toLowerCase()
    const ip = obtenerIp(request)

    // Limite de intentos ANTES de tocar la base: si ya se alcanzo, no se gasta
    // ni una consulta en averiguar si el usuario existe.
    const limite = await bloqueadoPorIntentos(usuarioClave, ip)
    if (limite.bloqueado) {
      return NextResponse.json(
        {
          error: `Demasiados intentos fallidos. Inténtalo de nuevo en ${limite.reintentaEnSegundos} segundos.`,
          code: 'INTENTOS_AGOTADOS',
        },
        { status: 429 }
      )
    }

    const [rows] = await pool.query(
      `SELECT id, nombre, correo, usuario, password_hash, rol, area_id, cargo, especialidad, activo
       FROM usuarios WHERE usuario = ?`,
      [usuarioClave]
    )
    const usuarios = rows as Array<Record<string, unknown>>
    const u = usuarios[0]

    // Se compara SIEMPRE: contra el hash del usuario si existe, y contra un
    // hash falso si no. Asi el tiempo y la respuesta no delatan si la cuenta
    // existe. Solo cuando la contraseña es correcta se mira si la cuenta esta
    // desactivada.
    const hash = u?.password_hash as string | undefined
    const passwordValido = await bcrypt.compare(password, hash || HASH_FIJO)

    if (!u || !passwordValido) {
      await registrarIntentoFallido(usuarioClave, ip)
      return NextResponse.json({ error: ERROR_CREDENCIALES }, { status: 401 })
    }

    // Ahora, y solo ahora, se puede decir que la cuenta esta desactivada: ya se
    // ha probado la contraseña, de modo que no se esta revelando nada nuevo.
    if (!u.activo) {
      await registrarIntentoFallido(usuarioClave, ip)
      return NextResponse.json(
        { error: 'Tu cuenta está desactivada. Contacta al administrador.' },
        { status: 403 }
      )
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

    // El cuerpo lleva el token de acceso, como hasta ahora, para no romper a la
    // app móvil ni a los clientes web ya desplegados. Además se emite un token
    // de renovación que viaja en una cookie HttpOnly: es lo que permitirá
    // renovar la sesión más adelante sin volver a pedir la contraseña.
    const sesion = await createSession(u.id as number, resumirDispositivo(request.headers.get('user-agent')))
    await cleanExpiredSessions()
    // Inicio correcto: el usuario vuelve a tener sus intentos disponibles.
    await limpiarIntentos(usuarioClave, ip)

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

// Una etiqueta corta para que el usuario reconozca en qué equipos está
// conectado. No se guardan datos del dispositivo más allá del user-agent.
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
  return `${sistema} · ${navegador}`
}
