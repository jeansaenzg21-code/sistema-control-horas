import { NextResponse } from 'next/server'
import { z } from 'zod'

export type ResultadoLectura<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }

/**
 * Lee el cuerpo de la peticion y lo valida contra el esquema Zod.
 * Devuelve el dato tipado o una respuesta 400 con mensajes en espanol.
 */
export async function leerJson<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<ResultadoLectura<T>> {
  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'El cuerpo de la peticion no es JSON valido.' }, { status: 400 }),
    }
  }

  const resultado = schema.safeParse(cuerpo)
  if (!resultado.success) {
    const mensajes = resultado.error.issues.map((i) => {
      const ruta = i.path.length ? i.path.join('.') : 'campo'
      return `${ruta}: ${i.message}`
    })
    return {
      ok: false,
      response: NextResponse.json(
        { error: mensajes[0] || 'La solicitud no es valida.', detalles: mensajes },
        { status: 400 }
      ),
    }
  }

  return { ok: true, data: resultado.data }
}
