import { NextResponse } from 'next/server'

import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { analizarPresupuesto } from '@/lib/presupuestos/importar-excel'
import {
  buscarAreaPorNombre,
  buscarClientePorNombre,
  listarAreas,
} from '@/lib/presupuestos/consultar'
import { resolverPermiso } from '@/lib/presupuestos/permisos'

export const runtime = 'nodejs'

const TAMANO_MAXIMO = 15 * 1024 * 1024

/**
 * Lee el Excel y devuelve lo que se puede rellenar del cliente, SIN guardar nada.
 *
 * Sirve para el flujo "cliente nuevo con presupuesto": se sube el archivo, se ve
 * qué cliente y qué área trae, se confirma, y solo entonces se crea el cliente y
 * se importa el presupuesto. Guardar aquí sería dejar basura si el usuario
 * cancela a medio camino.
 */
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
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo del presupuesto.' }, { status: 400 })
  }
  if (!/\.(xlsx|xlsm)$/i.test(archivo.name)) {
    return NextResponse.json({ error: 'El archivo debe ser un Excel .xlsx.' }, { status: 400 })
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return NextResponse.json({ error: 'El archivo supera los 15 MB.' }, { status: 400 })
  }

  const bytes = Buffer.from(await archivo.arrayBuffer())

  let analisis
  try {
    analisis = await analizarPresupuesto(bytes)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo leer el Excel.' },
      { status: 422 }
    )
  }

  // El área del Excel se propone, nunca se impone. Si no existe en la base, el
  // usuario tiene que elegir otra a mano.
  const area = analisis.area ? await buscarAreaPorNombre(analisis.area, context.activa.id) : null
  const clienteExistente = analisis.cliente
    ? await buscarClientePorNombre(analisis.cliente, context.activa.id)
    : null

  const permiso = await resolverPermiso({
    presupuestoId: 0,
    usuario: { id: user.id, rol: user.rol, area_id: user.area_id },
    accion: 'IMPORTAR',
    proyectoIdForzado: null,
    areaIdDelCliente: area?.id ?? null,
  })

  return NextResponse.json({
    cliente: {
      nombre: analisis.cliente,
      areaDetectada: analisis.area,
      areaId: area?.id ?? null,
      areaCoincide: area !== null,
    },
    clienteYaExiste: clienteExistente
      ? { id: clienteExistente.id, nombre: clienteExistente.nombre, areaId: clienteExistente.areaId }
      : null,
    puedeImportar: permiso.permitido,
    motivoPermiso: permiso.motivo,
    resumen: {
      hojas: analisis.hojas.length,
      serviciosDetallado: analisis.servicios.filter((s) => s.origen === 'DETALLADO').length,
      serviciosConsolidado: analisis.servicios.filter((s) => s.origen === 'CONSOLIDADO').length,
      horasDetallado: analisis.totales.horasDetallado,
      horasConsolidado: analisis.totales.horasSegunConsolidado,
      horasComplementario: analisis.totales.horasComplementario,
      observaciones: analisis.observaciones.length,
      observacionesBloqueantes: analisis.observaciones.filter((o) => o.severidad === 'BLOQUEANTE')
        .length,
    },
    areasDisponibles: await listarAreas(context.activa.id),
    // El archivo vuelve en base64 para que el cliente se cree y el presupuesto se
    // importe en un solo paso, sin pedirlo otra vez.
    archivoBase64: bytes.toString('base64'),
    nombreArchivo: archivo.name,
  })
}
