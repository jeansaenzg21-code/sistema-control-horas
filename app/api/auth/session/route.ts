import { NextResponse } from 'next/server'
import { getUserFromRequest, getEmpresaContext, deleteSession, tokenDeRequest } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida o expirada.' }, { status: 401 })
    }
    const context = await getEmpresaContext(user)
    return NextResponse.json({
      ok: true,
      usuario: user,
      empresa_activa: context.activa,
      empresas: context.disponibles,
      requiere_empresa: !context.activa,
    })
  } catch (error) {
    console.error('Error al validar sesión:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    // La web manda la cookie HttpOnly, el movil la cabecera Bearer: se aceptan
    // las dos.
    const token = tokenDeRequest(request)
    if (token) {
      await deleteSession(token)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al cerrar sesión:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
