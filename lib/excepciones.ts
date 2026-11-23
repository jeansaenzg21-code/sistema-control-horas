import pool from '@/lib/db'
import { esJefeDeArea, esSocio, type UsuarioConPermisos } from '@/lib/permisos'
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

export function puedeGestionarExcepciones(user: UsuarioConPermisos): boolean {
  return esAdmin(user) || esJefeDeArea(user)
}

// Usa los alias e, u y ar en consultas que operan sobre una excepción existente.
export function alcanceExcepciones(user: UsuarioConPermisos, empresaId: number) {
  return esAdmin(user) || esSocio(user)
    ? { sql: '(e.usuario_id IS NULL OR ar.empresa_id = ?)', valores: [empresaId] }
    : { sql: 'ar.empresa_id = ? AND u.area_id = ?', valores: [empresaId, user.area_id] }
}

export async function validarDestinatarioExcepcion(
  usuarioId: number | null,
  user: UsuarioConPermisos,
  empresaId: number,
): Promise<{ error: string; status: number } | null> {
  const admin = esAdmin(user)
  if (usuarioId === null) {
    return admin ? null : { error: 'Selecciona a un miembro de tu división o a ti mismo.', status: 403 }
  }

  const [filas] = await pool.query(
    `SELECT u.id FROM usuarios u JOIN areas ar ON ar.id = u.area_id
      WHERE u.id = ? AND ar.empresa_id = ? AND u.activo = TRUE${admin ? '' : ' AND u.area_id = ?'}`,
    admin ? [usuarioId, empresaId] : [usuarioId, empresaId, user.area_id],
  )
  if ((filas as unknown[]).length) return null
  return admin
    ? { error: 'El colaborador no pertenece a la empresa activa o está inactivo.', status: 400 }
    : { error: 'Solo puedes gestionar excepciones para colaboradores de tu división.', status: 403 }
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