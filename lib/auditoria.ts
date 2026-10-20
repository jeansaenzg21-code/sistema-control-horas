import pool from './db'

export interface DatosAuditoria {
  empresaId?: number | null
  usuarioId?: number | null
  accion: string
  entidad: string
  entidadId?: number | string | null
  antes?: unknown
  despues?: unknown
  ip?: string | null
}

function limpiar(valor: unknown): string | null {
  if (valor == null) return null
  try {
    return JSON.stringify(valor)
  } catch {
    return null
  }
}

/**
 * Registra un evento de auditoria. Es "best effort": si la tabla no existe o
 * falla la insercion, no interrumpe el flujo principal.
 *
 * Nunca se deben pasar contrasenas ni tokens en `antes`/`despues`.
 */
export async function registrarAuditoria(datos: DatosAuditoria): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO auditoria (empresa_id, usuario_id, accion, entidad, entidad_id, antes, despues, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        datos.empresaId ?? null,
        datos.usuarioId ?? null,
        datos.accion,
        datos.entidad,
        datos.entidadId ?? null,
        limpiar(datos.antes),
        limpiar(datos.despues),
        datos.ip ?? null,
      ]
    )
  } catch {
    // Auditoria no debe romper la operacion principal.
  }
}

export function ipDeRequest(request: Request): string | null {
  const reenviado = request.headers.get('x-forwarded-for')
  if (reenviado) {
    const primera = reenviado.split(',')[0]?.trim()
    if (primera) return primera
  }
  const real = request.headers.get('x-real-ip')
  if (real && real.trim()) return real.trim()
  return null
}