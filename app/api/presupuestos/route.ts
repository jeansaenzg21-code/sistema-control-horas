import { NextResponse } from 'next/server'

import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { analizarPresupuesto } from '@/lib/presupuestos/importar-excel'
import { guardarAnalisis } from '@/lib/presupuestos/guardar'
import { resolverPermiso } from '@/lib/presupuestos/permisos'

export const runtime = 'nodejs'

const TAMANO_MAXIMO = 15 * 1024 * 1024

export async function GET(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const context = await getEmpresaContext(user)
  if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

  const { searchParams } = new URL(request.url)
  const clienteId = Number(searchParams.get('cliente_id'))
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return NextResponse.json({ error: 'cliente_id no es valido.' }, { status: 400 })
  }

  const { obtenerPresupuestosDeCliente } = await import('@/lib/presupuestos/consultar')
  const lista = await obtenerPresupuestosDeCliente(clienteId, context.activa.id)
  return NextResponse.json(lista)
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const context = await getEmpresaContext(user)
  if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

  let formulario: FormData
  try {
    formulario = await request.formData()
  } catch {
    return NextResponse.json({ error: 'No se recibio un archivo.' }, { status: 400 })
  }

  const archivo = formulario.get('archivo')
  const clienteIdRaw = formulario.get('cliente_id')

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo del presupuesto.' }, { status: 400 })
  }
  const clienteId = Number(clienteIdRaw)
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return NextResponse.json({ error: 'cliente_id no es valido.' }, { status: 400 })
  }
  if (!/\.(xlsx|xlsm)$/i.test(archivo.name)) {
    return NextResponse.json({ error: 'El archivo debe ser un Excel .xlsx.' }, { status: 400 })
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return NextResponse.json({ error: 'El archivo supera los 15 MB.' }, { status: 400 })
  }

  const bytes = Buffer.from(await archivo.arrayBuffer())

  // Cargar el presupuesto del cliente es parte del trabajo del jefe de ÁREA, así
  // que se valida que sea el de su área (o el administrador). Esto va en el
  // backend: esconder el botón no impide nada.
  const { obtenerAreaDeCliente } = await import('@/lib/presupuestos/consultar')
  const areaCliente = await obtenerAreaDeCliente(clienteId, context.activa.id)
  if (areaCliente === null) {
    return NextResponse.json({ error: 'El cliente no existe en esta empresa.' }, { status: 404 })
  }
  const permiso = await resolverPermiso({
    presupuestoId: 0,
    usuario: { id: user.id, rol: user.rol, area_id: user.area_id },
    accion: 'IMPORTAR',
    proyectoIdForzado: null,
    areaIdDelCliente: areaCliente,
  })
  if (!permiso.permitido) {
    return NextResponse.json({ error: permiso.motivo }, { status: 403 })
  }

  let analisis
  try {
    analisis = await analizarPresupuesto(bytes)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo leer el Excel.' },
      { status: 422 }
    )
  }

  // Si el Excel no trae ningún bloque detallado no hay presupuesto que crear: se
  // rechaza antes de escribir nada en la base.
  const detallados = analisis.servicios.filter((s) => s.origen === 'DETALLADO')
  if (detallados.length === 0) {
    return NextResponse.json(
      { error: 'El archivo no contiene bloques de presupuesto detallados.' },
      { status: 422 }
    )
  }

  const resultado = await guardarAnalisis({
    empresaId: context.activa.id,
    clienteId,
    usuarioId: user.id,
    nombreArchivo: archivo.name,
    archivo: bytes,
    analisis,
  })

  return NextResponse.json({ ...resultado, analisis })
}
