import { NextResponse } from 'next/server'

/**
 * Codigo de instalacion de los endpoints /api/setup/*.
 *
 * Esos endpoints crean la empresa y el primer administrador: son la puerta de
 * entrada del sistema. Sin proteccion, cualquiera que llegue a la URL antes de
 * que lo haga el instalador se convierte en administrador. Por eso exigen la
 * cabecera `X-Setup-Token` con el valor de la variable SETUP_TOKEN.
 *
 * En desarrollo se permite entrar sin token (no hay SETUP_TOKEN en .env.local)
 * para no romper el flujo local. En produccion, si la variable no esta
 * definida, el endpoint responde 404: el endpoint simplemente no existe sin el
 * secreto, en vez de dejarlo abierto.
 */
export function verificarSetupToken(request: Request): NextResponse | null {
  const configurado = process.env.SETUP_TOKEN

  if (!configurado) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'No encontrado.' }, { status: 404 })
    }
    return null
  }

  const enviado = request.headers.get('x-setup-token')
  if (enviado !== configurado) {
    return NextResponse.json({ error: 'Código de instalación incorrecto.' }, { status: 401 })
  }

  return null
}
