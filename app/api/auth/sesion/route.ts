import { NextResponse } from 'next/server'
import {
  cookieAccesoVacia,
  cookieRefresh,
  cookieRefreshVacia,
  cerrarSesionDispositivo,
  cookiesSesion,
  getUserFromRequest,
  idSesionPorRefresh,
  leerCookieRefresh,
  listarSesiones,
  renovarSession,
} from '@/lib/auth'

// Gestión de la sesión del DISPOSITIVO actual.
//
// El cliente llama a esta ruta cuando su token de acceso caduca y recibe uno
// nuevo sin escribir usuario ni contraseña, de modo que el trabajador no ve la
// pantalla de inicio de sesión en mitad de la jornada.
//
// El token de renovación llega en la cookie HttpOnly (web) o en el cuerpo
// (móvil, que no tiene cookies). Los clientes actuales siguen mandando el token
// de acceso en la cabecera Authorization, así que la ruta es aditiva: no rompe
// a nadie que hoy funcione.
export async function POST(request: Request) {
  try {
    const cuerpo = (await request.json().catch(() => ({}))) as { refresh_token?: string }
    const refreshToken =
      leerCookieRefresh(request) || (typeof cuerpo.refresh_token === 'string' ? cuerpo.refresh_token : '')

    if (!refreshToken) {
      return NextResponse.json({ error: 'No hay sesión que renovar.' }, { status: 401 })
    }

    const emitida = await renovarSession(refreshToken)
    if (!emitida) {
      // La cookie solo se borra cuando el token no existe o ya vencio. Un fallo
      // de red cae en el catch y la deja intacta, para no cerrar la sesion del
      // usuario por un problema puntual del servidor.
      const cabeceras = new Headers()
      cabeceras.append('Set-Cookie', cookieRefreshVacia())
      cabeceras.append('Set-Cookie', cookieAccesoVacia())
      return NextResponse.json(
        { error: 'La sesion no se pudo renovar. Vuelve a iniciar sesion.' },
        { status: 401, headers: cabeceras }
      )
    }

    // Renovar NO salta el bloqueo de horario: solo se cambia el token. Quien
    // esta fuera de su horario sigue sin poder iniciar ni finalizar operaciones.
    const cabeceras = new Headers()
    for (const cookie of cookiesSesion(emitida.token, emitida.expiraAcceso, emitida.refreshToken, emitida.expiraRenovacion)) {
      cabeceras.append('Set-Cookie', cookie)
    }
    return NextResponse.json(
      { token: emitida.token, expira_en: emitida.expiraAcceso.toISOString() },
      { headers: cabeceras }
    )
  } catch (error) {
    console.error('Error al renovar la sesión:', error)
    return NextResponse.json({ error: 'No se pudo renovar la sesión.' }, { status: 500 })
  }
}

// Dispositivos con sesión abierta, para poder revocar uno sin cerrar el resto.
export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const refresh = leerCookieRefresh(request)
    const idActual = refresh ? await idSesionPorRefresh(refresh) : null
    return NextResponse.json({ sesiones: await listarSesiones(user.id, idActual) })
  } catch (error) {
    console.error('Error al listar las sesiones:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

// Cierra la sesión de ESTE dispositivo. Las de los demás siguen vivas: el
// usuario puede seguir trabajando en la laptop si se salió del celular.
export async function DELETE(request: Request) {
  try {
    const cuerpo = (await request.json().catch(() => ({}))) as { refresh_token?: string }
    const refresh =
      leerCookieRefresh(request) || (typeof cuerpo.refresh_token === 'string' ? cuerpo.refresh_token : '')

    if (refresh) await cerrarSesionDispositivo(refresh)

    const cabeceras = new Headers()
    cabeceras.append('Set-Cookie', cookieRefreshVacia())
    cabeceras.append('Set-Cookie', cookieAccesoVacia())
    return NextResponse.json({ ok: true }, { headers: cabeceras })
  } catch (error) {
    console.error('Error al cerrar sesión:', error)
    return NextResponse.json({ error: 'No se pudo cerrar la sesión.' }, { status: 500 })
  }
}
