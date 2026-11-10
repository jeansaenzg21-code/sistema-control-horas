import { NextResponse } from 'next/server'
import { ipDeRequest } from '@/lib/auditoria'
import { resolverAccesoCliente } from '@/lib/presupuestos/acceso-cliente'
import { actualizarTareaCronograma, crearTareasCronograma, eliminarTareaCronograma, guardarConfiguracionCronograma, listarCronogramaCliente, leerConfiguracionCronograma } from '@/lib/presupuestos/cronograma-cliente'
import { ErrorPlanificacion, type EntradaTareaCronograma } from '@/lib/planificacion/modelo'
import { estadoPlanificado, progresoPlanificado } from '@/lib/planificacion/fechas'
import { esquemaTareaPlan, esquemaLotePlan, esquemaEditarPlan, esquemaConfigPlan } from '@/lib/planificacion/validacion'
import { leerJson } from '@/lib/validacion/leer-json'
import type { z } from 'zod'

export const runtime = 'nodejs'
type Contexto = { params: Promise<{ id: string }> }
async function acceso(request: Request, ctx: Contexto) { return resolverAccesoCliente(request, Number((await ctx.params).id)) }
const prohibido = () => NextResponse.json({ error: 'Solo quien administra el área de este cliente puede editar su cronograma.' }, { status: 403 })
function errorRespuesta(error: unknown) {
  if (error instanceof ErrorPlanificacion) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Error de planificación:', error)
  return NextResponse.json({ error: 'No se pudo guardar. Reintenta cuando se restablezca la conexión.' }, { status: 500 })
}
function normalizar(t: z.infer<typeof esquemaTareaPlan>): EntradaTareaCronograma {
  // El avance y el estado los calcula el sistema a partir de las fechas planificadas.
  return { servicioId: t.servicio_id, servicioNombre: null, padreId: t.padre_id, nombre: t.nombre, etapa: t.etapa,
    fechaInicio: t.fecha_inicio, fechaFin: t.fecha_fin, horas: t.horas,
    progreso: progresoPlanificado(t.fecha_inicio, t.fecha_fin), estado: estadoPlanificado(t.fecha_inicio, t.fecha_fin),
    responsableId: t.responsable_id, dependencias: [...new Set(t.dependencias)], notas: t.notas, claveCreacion: t.clave_creacion }
}
export async function GET(request: Request, ctx: Contexto) {
  try {
    const a = await acceso(request, ctx)
    if (!a.ok) return a.response
    const [tareas, configuracion] = await Promise.all([listarCronogramaCliente(a.cliente.id), leerConfiguracionCronograma(a.cliente.id)])
    return NextResponse.json({ tareas, configuracion }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return errorRespuesta(error) }
}
export async function POST(request: Request, ctx: Contexto) {
  try {
    const a = await acceso(request, ctx)
    if (!a.ok) return a.response
    if (!a.puedeGestionar) return prohibido()
    const cuerpo = await leerJson(request, esquemaLotePlan)
    if (!cuerpo.ok) return cuerpo.response
    const resultado = await crearTareasCronograma(a.cliente.id, cuerpo.data.tareas.map(normalizar), { usuarioId: a.usuario.id, empresaId: a.empresaId, ip: ipDeRequest(request) })
    return NextResponse.json(resultado, { status: 201 })
  } catch (error) { return errorRespuesta(error) }
}
export async function PATCH(request: Request, ctx: Contexto) {
  try {
    const a = await acceso(request, ctx)
    if (!a.ok) return a.response
    if (!a.puedeGestionar) return prohibido()
    const cuerpo = await leerJson(request, esquemaEditarPlan)
    if (!cuerpo.ok) return cuerpo.response
    const t = cuerpo.data
    const tareas = await actualizarTareaCronograma(a.cliente.id, t.id, normalizar(t), t.revision, t.antes_de, { usuarioId: a.usuario.id, empresaId: a.empresaId, ip: ipDeRequest(request) })
    return NextResponse.json({ tareas })
  } catch (error) { return errorRespuesta(error) }
}
export async function DELETE(request: Request, ctx: Contexto) {
  try {
    const a = await acceso(request, ctx)
    if (!a.ok) return a.response
    if (!a.puedeGestionar) return prohibido()
    const params = new URL(request.url).searchParams
    const id = Number(params.get('id')), revision = Number(params.get('revision'))
    if (!Number.isInteger(id) || id <= 0 || !params.has('revision') || !Number.isInteger(revision) || revision < 0) return NextResponse.json({ error: 'Actividad o revisión inválida.' }, { status: 400 })
    const tareas = await eliminarTareaCronograma(a.cliente.id, id, revision, { usuarioId: a.usuario.id, empresaId: a.empresaId, ip: ipDeRequest(request) })
    return NextResponse.json({ tareas })
  } catch (error) { return errorRespuesta(error) }
}
export async function PUT(request: Request, ctx: Contexto) {
  try {
    const a = await acceso(request, ctx)
    if (!a.ok) return a.response
    if (!a.puedeGestionar) return prohibido()
    const cuerpo = await leerJson(request, esquemaConfigPlan)
    if (!cuerpo.ok) return cuerpo.response
    const configuracion = await guardarConfiguracionCronograma(a.cliente.id, { fechaInicio: cuerpo.data.fecha_inicio, meses: cuerpo.data.meses }, { usuarioId: a.usuario.id, empresaId: a.empresaId, ip: ipDeRequest(request) })
    return NextResponse.json({ configuracion })
  } catch (error) { return errorRespuesta(error) }
}
