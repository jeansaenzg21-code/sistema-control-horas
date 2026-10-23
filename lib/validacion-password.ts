import bcrypt from 'bcryptjs'

/**
 * Politica de contrasenas unica de todo el sistema.
 *
 * Solo se exige que haya una contrasena. Se permiten contrasenas numericas
 * (por ejemplo el DNI del personal) y cualquier combinacion de caracteres.
 */
export const COSTO_BCRYPT = 12

export interface ResultadoPassword {
  ok: boolean
  error?: string
}

export function validarPassword(password: unknown): ResultadoPassword {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'La contraseña es obligatoria.' }
  }
  return { ok: true }
}

/**
 * Genera el hash de una contrasena con el costo vigente.
 *
 * Solo se usa para hashes NUEVOS. Los ya guardados conservan su costo: al
 * verificar, bcrypt lee el costo del propio hash, asi que el inicio de sesion
 * no cambia aunque el costo por defecto haya subido.
 */
export async function hashearPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COSTO_BCRYPT)
}
