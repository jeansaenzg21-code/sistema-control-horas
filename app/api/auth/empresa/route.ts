import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import {
  getEmpresaContext,
  getEmpresaDisponible,
  getUserFromRequest,
  hashToken,
  tokenDeRequest,
} from '@/lib/auth'

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
  const user = await getUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: 'Sesión inválida o expirada.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { empresa_id?: unknown }
  const empresaId = Number(body.empresa_id)
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    return NextResponse.json({ error: 'La empresa seleccionada no es válida.' }, { status: 400 })
  }

  const empresa = await getEmpresaDisponible(user, empresaId)
  if (!empresa) {
    return NextResponse.json({ error: 'No tienes acceso a esa empresa.' }, { status: 403 })
  }

  const token = tokenDeRequest(request)
  if (!token) {
    return NextResponse.json({ error: 'Sesión inválida o expirada.' }, { status: 401 })
  }

  // La columna guarda el hash del token, no el token.
  await pool.query(
    'UPDATE sesiones SET empresa_id = ? WHERE token = ? AND expira_en > NOW()',
    [empresaId, hashToken(token)]
  )

  return NextResponse.json({ ok: true, empresa_activa: empresa })
}

export async function DELETE(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: 'Sesión inválida o expirada.' }, { status: 401 })
  }

  const token = tokenDeRequest(request)
  if (!token) {
    return NextResponse.json({ error: 'Sesión inválida o expirada.' }, { status: 401 })
  }

  await pool.query(
    'UPDATE sesiones SET empresa_id = NULL WHERE token = ? AND expira_en > NOW()',
    [hashToken(token)]
  )

  return NextResponse.json({ ok: true, empresa_activa: null })
}
