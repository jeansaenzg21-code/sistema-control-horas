import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const dos = (n: number) => String(n).padStart(2, '0')

export function formatHora(valor: string | Date): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor
  if (Number.isNaN(fecha.getTime())) return String(valor)
  return `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`
}

export function formatFecha(valor: string | Date): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor
  if (Number.isNaN(fecha.getTime())) return String(valor)
  return `${dos(fecha.getDate())}-${dos(fecha.getMonth() + 1)}-${fecha.getFullYear()}`
}

export function fechaLocalISO(valor: string | Date): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor
  if (Number.isNaN(fecha.getTime())) return String(valor)
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
}

export function esFacturable(valor: unknown): boolean {
  return valor === true || valor === 1
}

export function esNoFacturable(valor: unknown): boolean {
  return valor === false || valor === 0
}

export function formatoHoras(horas: number): string {
  if (!Number.isFinite(horas)) return '0min'
  const totalMin = Math.round(horas * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

/** Sin tildes, sin signos y en minÃºsculas, para comparar dos palabras. */
function planchar(valor: string): string {  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-ZÃ±Ã‘\s]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function iguales(a: string, b: string): boolean {
  return planchar(a) === planchar(b) && planchar(a) !== ''
}

/**
 * Las dos piezas que da el correo: el nombre de pila y el primer apellido.
 *
 * El sistema usa el patrón `nombre.apellido@paredescano.com`, así que la parte
 * anterior al punto ES el nombre de pila y la posterior, el primer apellido. No
 * es una suposición: "Alejandro Bonifacio" se registra como
 * `alejandro.bonifacio@`, mientras que el campo `nombre` guarda los apellidos
 * delante, `BONIFACIO CAMPOS ALEJANDRO`.
 *
 * Eso importa porque el orden del campo `nombre` NO es uniforme. Con la misma
 * base de datos hay "ALAYO BERECHE JULIA MERCEDES" (apellidos, nombres) y
 * "BONIFACIO CAMPOS ALEJANDRO", donde el primer apellido se llama como un
 * nombre. Cualquier regla que mire solo la posición de las palabras acierta en un
 * caso y falla en el otro; el correo no falla en ninguno de los dos.
 *
 * Se devuelve `null` si el correo no sigue el patrón de la empresa, para no
 * inventar: los correos genéricos (`marketing@`, `sistemas@`) y los alias
 * (`trainee.soporte@`) dicen cómo escribir el correo, no cómo se llama la
 * persona. El nombre de pila solo se acepta si aparece tal cual entre las
 * palabras del nombre, que es lo que descarta esos casos.
 */
function pilaYApellidoDesdeCorreo(
  correo: string | null | undefined,
  partes: string[],
): { pila: string; apellido: string | null } | null {
  if (!correo) return null
  const local = correo.split('@')[0]
  if (!local) return null
  const pedazos = local.split('.')
  // Con más de un punto el correo ya no sigue el patrón y no se sabe cuál
  // pedazo es el nombre.
  if (pedazos.length !== 2) return null
  const pila = partes.find((p) => iguales(p, pedazos[0]))
  if (!pila) return null
  return { pila, apellido: pedazos[1] }
}

/**
 * Nombre de pila con la inicial de la segunda parte, para tablas y gráficos
 * estrechos.
 *
 * En el sistema el nombre viene con los apellidos delante, y en una barra de
 * 20 px de ancho no cabe "ALAYO BERECHE JULIA MERCEDES": lo que interesa para
 * comparar personas es el nombre, no el apellido.
 *
 * Se usa el CORREO como fuente (ver `pilaYApellidoDesdeCorreo`) porque es el
 * único dato fiable. La segunda letra se saca así:
 *   - si hay una palabra DESPUÉS del nombre de pila, esa es el segundo nombre
 *     ("JULIA MERCEDES" -> "JULIA M.");
 *   - si no la hay, el nombre de pila es la última palabra y se recurre a la
 *     inicial del apellido, también leído del correo
 *     ("BONIFACIO CAMPOS ALEJANDRO" -> "ALEJANDRO B.").
 *
 * Sin correo utilizable se cae a la posición de las palabras, que es una
 * aproximación, y solo a partir de cuatro palabras: con tres es ambiguo si la
 * última es un nombre o un segundo apellido, y equivocarse pone un apellido
 * donde iba el nombre. El nombre COMPLETO se conserva en el `title`.
 */
export function nombreCorto(nombre: string | null | undefined, correo?: string | null): string {
  const limpio = String(nombre ?? '').trim().replace(/\s+/g, ' ')
  if (limpio === '') return '—'
  const partes = limpio.split(' ')

  const desdeCorreo = pilaYApellidoDesdeCorreo(correo, partes)
  if (desdeCorreo) {
    const { pila, apellido } = desdeCorreo
    const indice = partes.findIndex((p) => iguales(p, pila))
    const siguiente = indice >= 0 ? partes[indice + 1] : undefined
    // El segundo nombre si lo hay. Sin él, la inicial la pone el apellido:
    // mejor "ALEJANDRO B." que un nombre pelado, y mejor eso que el apellido
    // equivocado, que es lo que pasaba con "BONIFACIO CAMPOS ALEJANDRO".
    const segunda = siguiente ?? apellido ?? (indice > 0 ? partes[indice - 1] : undefined)
    if (!segunda) return pila
    return `${pila} ${segunda.charAt(0).toLocaleUpperCase('es-PE')}.`
  }

  if (partes.length < 4) return limpio
  const nombrePila = partes[partes.length - 2]
  const inicial = partes[partes.length - 1].charAt(0).toLocaleUpperCase('es-PE')
  return `${nombrePila} ${inicial}.`
}

