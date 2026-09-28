// Cómo se reconoce a una persona del Excel en el personal cargado.
//
// El problema real: el Excel trae el NOMBRE primero y el apellido después
// ("EDUARDO CHISCUL"), y el personal se carga con los apellidos primero
// ("CHISCUL MOLINA EDUARDO EMILIO"). Comparar cadenas no encuentra a nadie, y
// comparar solo el primer apellido se confunde entre homónimos.
//
// La solución es comparar CONJUNTOS de palabras, sin importar el orden ni
// cuántos apellidos o nombres intermedios traiga cada uno. Pero se mantiene la
// seguridad: si más de una persona encaja, no se elige ninguna.
//
// Esto NO es "buscar el más parecido". Exige que TODAS las palabras del Excel
// aparezcan en el nombre del usuario. "Trainee" y "Junior" no son personas y
// siguen sin encontrar a nadie.

/** Divide en palabras normalizadas: sin acentos, en minúsculas, sin signos. */
export function palabras(nombre: string | null): string[] {
  if (!nombre) return []
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-zñ\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1)
}

export type NivelCoincidencia = 'EXACTA' | 'CONTIENE'

export type Coincidencia = {
  usuarioId: number
  usuarioNombre: string
  nivel: NivelCoincidencia
  /** Las palabras del Excel, por si hay que explicarle al Líder el porqué. */
  coincidentes: string[]
}

type Usuario = { id: number; nombre: string }

function encaja(excel: string[], usuario: string[]): NivelCoincidencia | null {
  if (excel.length === 0 || usuario.length === 0) return null

  const conjuntoUsuario = new Set(usuario)
  const iguales = excel.length === usuario.length && excel.every((p) => conjuntoUsuario.has(p))
  if (iguales) return 'EXACTA'

  // El Excel suele venir abreviado: "EDUARDO CHISCUL" dentro de
  // "CHISCUL MOLINA EDUARDO EMILIO". Se exige que aparezcan TODAS sus palabras.
  // Con una sola palabra no se arriesga: "Trainee" podria encajar con cualquiera.
  if (excel.length < 2) return null
  if (!excel.every((p) => conjuntoUsuario.has(p))) return null

  return 'CONTIENE'
}

/**
 * Busca a la persona del Excel entre el personal.
 *
 * Devuelve `null` si no hay ninguna coincidencia o si hay más de una. La
 * ambigüedad se rechaza: es preferible que el Líder confirme a mano a adjudicarle
 * las horas de otra persona.
 */
export function buscarPersona(
  nombreExcel: string | null,
  usuarios: Usuario[]
): Coincidencia | null {
  const excel = palabras(nombreExcel)
  if (excel.length === 0) return null

  const encontradas: Coincidencia[] = []
  for (const u of usuarios) {
    const nivel = encaja(excel, palabras(u.nombre))
    if (!nivel) continue
    const conjunto = new Set(palabras(u.nombre))
    encontradas.push({
      usuarioId: u.id,
      usuarioNombre: u.nombre,
      nivel,
      coincidentes: excel.filter((p) => conjunto.has(p)),
    })
  }

  if (encontradas.length !== 1) return null
  return encontradas[0]
}

/** Explicación para la interfaz y para el motivo que se guarda. */
export function explicarCoincidencia(nombreExcel: string | null, c: Coincidencia | null): string {
  if (!c) {
    if (!nombreExcel) return 'La fila del Excel no indica a quién se asignan las horas.'
    return `"${nombreExcel}" no coincide exactamente con ninguna persona del personal.`
  }
  if (c.nivel === 'EXACTA') return `"${nombreExcel}" coincide con ${c.usuarioNombre}.`
  return `"${nombreExcel}" corresponde a ${c.usuarioNombre}, registrado con más apellidos.`
}
