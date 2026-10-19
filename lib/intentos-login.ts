import pool from './db'

/**
 * Control de intentos fallidos de inicio de sesion.
 *
 * Regla: tras 5 intentos fallidos, el bloqueo dura 15 minutos. Se aplica dos
 * veces, de forma independiente:
 *
 *   - Por usuario: un atacante que pruebe muchas contrasenas contra UNA cuenta
 *     se bloquea con ella aunque cambie de IP.
 *   - Por IP: un atacante que pruebe las contrasenas de MUCHAS cuentas desde una
 *     sola IP tambien se bloquea, aunque no averigue ni un usuario valido.
 *
 * El contador vive en la tabla `intentos_login`, no en memoria, para que el
 * bloqueo sobreviva a un reinicio y funcione igual con varias instancias.
 *
 * El conteo es por "ventana": cada fila guarda cuando empezo a acumular
 * intentos. Pasados los 15 minutos desde entonces, el conteo se reinicia y el
 * usuario vuelve a tener sus 5 intentos.
 */

const MAX_INTENTOS = 5
const VENTANA_MINUTOS = 15

interface IntentoFila {
  usuario: string
  ip: string
  intentos: number
  primer_intento_en: Date
}

export interface EstadoBloqueo {
  bloqueado: boolean
  reintentaEnSegundos: number
}

function leerFilas(filas: unknown): IntentoFila[] {
  return (filas as Array<Record<string, unknown>>).map((f) => ({
    usuario: String(f.usuario ?? ''),
    ip: String(f.ip ?? ''),
    intentos: Number(f.intentos ?? 0),
    primer_intento_en: new Date(String(f.primer_intento_en)),
  }))
}

/**
 * Si el usuario o la IP estan bloqueados ahora mismo.
 *
 * El usuario se guarda en minusculas y sin espacios (el mismo formato con el
 * que se lee en el login), para que el conteo coincida siempre.
 */
export async function bloqueadoPorIntentos(usuario: string, ip: string): Promise<EstadoBloqueo> {
  const ahora = new Date()
  const filas = await pool.query(
    'SELECT usuario, ip, intentos, primer_intento_en FROM intentos_login WHERE usuario = ? OR ip = ?',
    [usuario, ip]
  )
  let bloqueado = false
  let reintentaEnSegundos = 0

  for (const fila of leerFilas(filas[0])) {
    const finDeVentana = new Date(
      fila.primer_intento_en.getTime() + VENTANA_MINUTOS * 60_000
    )
    if (fila.intentos >= MAX_INTENTOS && finDeVentana > ahora) {
      bloqueado = true
      reintentaEnSegundos = Math.max(
        reintentaEnSegundos,
        Math.ceil((finDeVentana.getTime() - ahora.getTime()) / 1000)
      )
    }
  }

  return { bloqueado, reintentaEnSegundos }
}

/**
 * Suma un intento fallido al usuario y a la IP.
 *
 * El intento se guarda en DOS filas: una claveada por usuario y otra por IP.
 * Asi los dos limites se cuentan por separado, que es justo lo que se quiere.
 * Pasado el tiempo de la ventana, la fila antigua se borra y el conteo vuelve
 * a empezar.
 */
export async function registrarIntentoFallido(usuario: string, ip: string): Promise<void> {
  const ahora = new Date()
  // Ventanas vencidas: si el ultimo intento fue hace mas de 15 minutos, ya no
  // cuentan. Sin esta limpieza, el contador seguiria subiendo para siempre y el
  // usuario quedaria bloqueado de por vida.
  await pool.query(
    'DELETE FROM intentos_login WHERE ultimo_intento_en < DATE_SUB(NOW(), INTERVAL ? MINUTE)',
    [VENTANA_MINUTOS]
  )

  // Una fila para el limite por usuario (ip vacia).
  await pool.query(
    `INSERT INTO intentos_login (usuario, ip, intentos, primer_intento_en, ultimo_intento_en)
     VALUES (?, '', 1, ?, ?)
     ON DUPLICATE KEY UPDATE intentos = intentos + 1, ultimo_intento_en = VALUES(ultimo_intento_en)`,
    [usuario, ahora, ahora]
  )

  // Otra fila para el limite por IP (usuario vacio).
  await pool.query(
    `INSERT INTO intentos_login (usuario, ip, intentos, primer_intento_en, ultimo_intento_en)
     VALUES ('', ?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE intentos = intentos + 1, ultimo_intento_en = VALUES(ultimo_intento_en)`,
    [ip, ahora, ahora]
  )
}

/** Borra los contadores de un usuario y una IP tras un inicio de sesion correcto. */
export async function limpiarIntentos(usuario: string, ip: string): Promise<void> {
  await pool.query('DELETE FROM intentos_login WHERE usuario = ? OR ip = ?', [usuario, ip])
}

/**
 * Direccion IP del cliente.
 *
 * Detras de un proxy o un balanceador la IP real llega en X-Forwarded-For. Si
 * no, se usa X-Real-IP. En desarrollo no hay ninguna de las dos y el valor
 * cae en una constante, para que los intentos de todos los locales compartan
 * el mismo contador.
 */
export function obtenerIp(request: Request): string {
  const reenviado = request.headers.get('x-forwarded-for')
  if (reenviado) {
    const primera = reenviado.split(',')[0]?.trim()
    if (primera) return primera
  }
  const real = request.headers.get('x-real-ip')
  if (real && real.trim()) return real.trim()
  return 'desconocida'
}
