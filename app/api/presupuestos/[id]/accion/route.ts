import { NextResponse } from 'next/server'

import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import {
  activarBolsas,
  aprobarPresupuesto,
  confirmarAsignacion,
  vincularProyecto,
} from '@/lib/presupuestos/activar'

export const runtime = 'nodejs'

type Contexto = { params: Promise<{ id: string }> }

async function contexto(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return { error: 'No autorizado.', status: 401 } as const
  const ctx = await getEmpresaContext(user)
  if (!ctx.activa) return { error: 'No hay una empresa activa.', status: 409 } as const
  return { user, empresaId: ctx.activa.id } as const
}

/**
 * Acciones del flujo de presupuesto. Todas pasan por `lib/presupuestos/activar`,
 * que es donde se validan permisos y bloqueos; aquí solo se traduce HTTP.
 *
 * Se agrupan en una ruta para no repetir cuatro veces el mismo armazón de
 * autenticación, pero cada acción es real y ejecuta su caso.
 */
export async function POST(request: Request, ctx: Contexto) {
  const base = await contexto(request)
  if ('error' in base) return NextResponse.json({ error: base.error }, { status: base.status })

  const { id } = await ctx.params
  const presupuestoId = Number(id)
  if (!Number.isInteger(presupuestoId) || presupuestoId <= 0) {
    return NextResponse.json({ error: 'El presupuesto no es valido.' }, { status: 400 })
  }

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'No se recibieron datos.' }, { status: 400 })
  }

  const accion = String(cuerpo.accion ?? '').toUpperCase()
  const justificacion = typeof cuerpo.justificacion === 'string' ? cuerpo.justificacion : ''

  const usuario = {
    id: base.user.id,
    rol: base.user.rol,
    area_id: base.user.area_id ?? null,
  }

  switch (accion) {
    case 'VINCULAR': {
      const proyectoId = Number(cuerpo.proyecto_id)
      const liderId = Number(cuerpo.lider_id)
      if (!Number.isInteger(proyectoId) || proyectoId <= 0) {
        return NextResponse.json({ error: 'Elige el proyecto.' }, { status: 400 })
      }
      if (!Number.isInteger(liderId) || liderId <= 0) {
        return NextResponse.json({ error: 'Elige quien sera el Lider del proyecto.' }, { status: 400 })
      }
      const r = await vincularProyecto({
        presupuestoId,
        proyectoId,
        liderId,
        usuario,
        justificacion,
      })
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }

    case 'CONFIRMAR_ASIGNACION': {
      const asignacionId = Number(cuerpo.asignacion_id)
      const usuarioId = Number(cuerpo.usuario_id)
      if (!Number.isInteger(asignacionId) || asignacionId <= 0) {
        return NextResponse.json({ error: 'La asignacion no es valida.' }, { status: 400 })
      }
      const r = await confirmarAsignacion({
        asignacionId,
        usuarioId,
        motivo: justificacion,
      })
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }

    case 'APROBAR': {
      const r = await aprobarPresupuesto({ presupuestoId, usuario, justificacion })
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }

    case 'ACTIVAR_BOLSAS': {
      const r = await activarBolsas({ presupuestoId, usuario, justificacion })
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }

    default:
      return NextResponse.json({ error: 'Accion no reconocida.' }, { status: 400 })
  }
}
