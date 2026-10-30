import { NextResponse } from 'next/server'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: 'Sesión inválida o expirada.' }, { status: 401 })
  }

  const context = await getEmpresaContext(user)
  return NextResponse.json({
    ok: true,
    empresa_activa: context.activa,
    empresas: context.disponibles,
    requiere_empresa: !context.activa,
  })
}

export async function PUT(request: Request) {
  return NextResponse.json({ error: 'El cambio de empresa está deshabilitado.' }, { status: 403 })
}

export async function DELETE(request: Request) {
  return NextResponse.json({ error: 'La salida de empresa está deshabilitada.' }, { status: 403 })
}
