import { NextResponse } from 'next/server'

import { resolverAccesoCliente } from '@/lib/presupuestos/acceso-cliente'
import { obtenerGestionCliente } from '@/lib/presupuestos/gestion-cliente'

export const runtime = 'nodejs'

type Contexto = { params: Promise<{ id: string }> }

/**
 * Gestión integral de un cliente, sin pasar por un proyecto.
 *
 * Permiso: quien administra el área del cliente, o un administrador. Antes esto
 * era "el Líder del proyecto", pero el cliente es el ancla y no siempre hay
 * proyecto; el jefe de su área es quien responde por su presupuesto.
 */
export async function GET(request: Request, ctx: Contexto) {
  try {
    const { id } = await ctx.params
    const acceso = await resolverAccesoCliente(request, Number(id))
    if (!acceso.ok) return acceso.response

    const gestion = await obtenerGestionCliente(
      acceso.cliente,
      acceso.puedeGestionar,
      acceso.motivo
    )
    return NextResponse.json(gestion)
  } catch (error) {
    console.error('Error al cargar la gestion del cliente:', error)
    return NextResponse.json({ error: 'No se pudo cargar la gestión del cliente.' }, { status: 500 })
  }
}
