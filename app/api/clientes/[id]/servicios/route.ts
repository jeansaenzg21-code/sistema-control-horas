import { NextResponse } from 'next/server'
import { resolverAccesoCliente } from '@/lib/presupuestos/acceso-cliente'
import { crearServicioManual, eliminarServicioPresupuesto, esquemaServicioManual } from '@/lib/presupuestos/servicio-manual'
import { ErrorPlanificacion } from '@/lib/planificacion/modelo'
import { leerJson } from '@/lib/validacion/leer-json'
import { ipDeRequest } from '@/lib/auditoria'

export const runtime = 'nodejs'
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const acceso = await resolverAccesoCliente(request, Number((await ctx.params).id))
    if (!acceso.ok) return acceso.response
    if (!acceso.puedeGestionar) return NextResponse.json({ error: 'No puedes modificar el presupuesto de este cliente.' }, { status: 403 })
    const cuerpo = await leerJson(request, esquemaServicioManual)
    if (!cuerpo.ok) return cuerpo.response
    const resultado = await crearServicioManual(acceso.cliente.id, cuerpo.data, { empresaId: acceso.empresaId, usuarioId: acceso.usuario.id, ip: ipDeRequest(request) })
    return NextResponse.json(resultado, { status: 201 })
  } catch (error) {
    if (error instanceof ErrorPlanificacion) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Error al añadir servicio al presupuesto:', error)
    return NextResponse.json({ error: 'No se pudo guardar el servicio. Puedes reintentar sin duplicarlo.' }, { status: 500 })
  }
}
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const acceso = await resolverAccesoCliente(request, Number((await ctx.params).id))
    if (!acceso.ok) return acceso.response
    if (!acceso.puedeGestionar) return NextResponse.json({ error: 'No puedes modificar el presupuesto de este cliente.' }, { status: 403 })
    const params = new URL(request.url).searchParams
    const servicioId = Number(params.get('servicioId')), presupuestoId = Number(params.get('presupuestoId'))
    if (!Number.isInteger(servicioId) || servicioId <= 0 || !Number.isInteger(presupuestoId) || presupuestoId <= 0) {
      return NextResponse.json({ error: 'Servicio o presupuesto inválido.' }, { status: 400 })
    }
    const resultado = await eliminarServicioPresupuesto(acceso.cliente.id, presupuestoId, servicioId, { empresaId: acceso.empresaId, usuarioId: acceso.usuario.id, ip: ipDeRequest(request) })
    return NextResponse.json(resultado)
  } catch (error) {
    if (error instanceof ErrorPlanificacion) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Error al eliminar servicio del presupuesto:', error)
    return NextResponse.json({ error: 'No se pudo eliminar el servicio. Intenta de nuevo.' }, { status: 500 })
  }
}
