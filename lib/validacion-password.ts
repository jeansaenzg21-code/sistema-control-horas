import bcrypt from 'bcryptjs'

/**
 * Politica de contrasenas unica de todo el sistema.
 *
 * Antes habia cuatro reglas distintas (4 caracteres en el setup, 7 en la
 * importacion, 10 en las de usuario) y ninguna era la misma. Toda ruta que crea
 * o cambia una contrasena debe pasar por aqui, salvo la importacion masiva de
 * personal: ahi la contrasena inicial es el DNI y no cumple esta politica.
 *
 * Requisitos:
 *   - Al menos una letra.
 *   - Al menos un numero.
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
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(password)) {
    return { ok: false, error: 'La contraseña debe incluir al menos una letra.' }
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: 'La contraseña debe incluir al menos un número.' }
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
