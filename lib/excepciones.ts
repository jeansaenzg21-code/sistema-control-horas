import pool from '@/lib/db'
import { esFechaValida } from '@/lib/fechas'

export const TIPOS_EXCEPCION = ['FERIADO', 'VACACIONES'] as const
export type TipoExcepcion = (typeof TIPOS_EXCEPCION)[number]

export interface DatosExcepcion {
  fecha: string
  tipo: TipoExcepcion
  usuario_id: number | null
  descripcion: string | null
}

export function esAdmin(user: { rol: string } | null): boolean {
  return !!user && user.rol === 'ADMINISTRACION'
}

export function claveUnicaExcepcion(datos: DatosExcepcion): number {
  return datos.usuario_id ?? 0
}

export async function validarDatosExcepcion(
  body: Record<string, unknown>,
): Promise<{ ok: true; datos: DatosExcepcion } | { ok: false; error: string; status: number }> {
  const fecha = String(body.fecha ?? '').trim()
  const tipo = String(body.tipo ?? '').trim()

  if (!fecha || !esFechaValida(fecha)) {
    return { ok: false, error: 'La fecha no es válida. Usa el formato YYYY-MM-DD con una fecha real.', status: 400 }
  }

  if (!TIPOS_EXCEPCION.includes(tipo as TipoExcepcion)) {
    return { ok: false, error: 'El tipo debe ser FERIADO o VACACIONES.', status: 400 }
  }

  let usuarioId: number | null = null
  if (body.usuario_id !== undefined && body.usuario_id !== null && body.usuario_id !== '') {
    usuarioId = Number(body.usuario_id)
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return { ok: false, error: 'El colaborador indicado no es válido.', status: 400 }
    }
    const [rows] = await pool.query(
      'SELECT id FROM usuarios WHERE id = ? AND activo = TRUE',
      [usuarioId]
    )
    const existe = rows as Array<Record<string, unknown>>
    if (existe.length === 0) {
      return { ok: false, error: 'El colaborador indicado no existe o está inactivo.', status: 400 }
    }
  }

  if (tipo === 'VACACIONES' && !usuarioId) {
    return {
      ok: false,
      error: 'Las vacaciones siempre corresponden a un colaborador específico.',
      status: 400,
    }
  }

  let descripcion: string | null = null
  if (body.descripcion !== undefined && body.descripcion !== null && body.descripcion !== '') {
    descripcion = String(body.descripcion).trim().slice(0, 255)
  }

  return { ok: true, datos: { fecha, tipo: tipo as TipoExcepcion, usuario_id: usuarioId, descripcion } }
}

export async function existeDuplicadoExcepcion(
  datos: DatosExcepcion,
  excluirId?: number,
): Promise<boolean> {
  const clave = claveUnicaExcepcion(datos)
  let sql = 'SELECT id FROM excepciones WHERE fecha = ? AND tipo = ? AND usuario_clave = ?'
  const valores: (string | number)[] = [datos.fecha, datos.tipo, clave]
  if (excluirId) {
    sql += ' AND id <> ?'
    valores.push(excluirId)
  }
  const [rows] = await pool.query(sql, valores)
  return (rows as Array<Record<string, unknown>>).length > 0
}