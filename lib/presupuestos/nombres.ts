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

export type NivelCoincidencia = 'EXACTA' | 'CONTIENE' | 'APROXIMADA'

export type Coincidencia = {
  usuarioId: number
  usuarioNombre: string
  nivel: NivelCoincidencia
  /** Las palabras del Excel, por si hay que explicarle al Líder el porqué. */
  coincidentes: string[]
  /** Palabras que encajaron por tolerancia, no de forma exacta. */
  aproximadas: string[]
}

type Usuario = { id: number; nombre: string }

/**
 * Distancia de edición, acotada a `maximo` para cortar en cuanto se pasa.
 * Sirve para medir lo lejos que está una palabra de otra.
 */
function distancia(a: string, b: string, maximo: number): number {
  if (Math.abs(a.length - b.length) > maximo) return maximo + 1
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const actual = [i]
    let mejor = i
    for (let j = 1; j <= b.length; j += 1) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      const valor = Math.min(actual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + costo)
      actual.push(valor)
      if (valor < mejor) mejor = valor
    }
    if (mejor > maximo) return maximo + 1
    anterior = actual
  }
  return anterior[b.length]
}

/**
 * Cuánto se le perdona a una palabra mal escrita.
 *
 * El margen crece con la longitud porque un error de tecleo en un nombre largo
 * es normal, mientras que en uno de tres letras cualquier parecido es una
 * casualidad: "Ana" y "Alo" no son la misma persona, y "yonni" y "yonny" sí.
 * Por debajo de cuatro letras no se perdona nada.
 */
function tolerancia(palabra: string): number {
  if (palabra.length >= 7) return 2
  if (palabra.length >= 4) return 1
  return 0
}

/**
 * Para cada palabra del Excel, qué personas del personal encajan con ella.
 *
 * Se resuelve PARA TODA LA LISTA, no persona por persona. Si "yonni" se parece
 * a "yonny" y a "yonnyfer", las dos encajarían "únicamente" entre sí, yChoosing
 * una al azar sería inventar. Al resolverlo de forma global, la ambigüedad se
 * detecta y se rechaza.
 */
function usuariosPorPalabra(excel: string[], usuarios: Usuario[]): Map<string, number[]> {
  const palabrasDeUsuario = usuarios.map((u) => palabras(u.nombre))
  const mapa = new Map<string, number[]>()

  for (const palabra of excel) {
    const exactos: number[] = []
    for (let i = 0; i < usuarios.length; i += 1) {
      if (palabrasDeUsuario[i].includes(palabra)) exactos.push(i)
    }
    if (exactos.length > 0) {
      mapa.set(palabra, exactos)
      continue
    }

    // Sin coincidencia exacta, se busca una única parecida. Con varias, no se
    // elige ninguna: el Líder tiene que decir a quién corresponde.
    const margen = tolerancia(palabra)
    if (margen === 0) {
      mapa.set(palabra, [])
      continue
    }
    const parecidos: number[] = []
    for (let i = 0; i < usuarios.length; i += 1) {
      const existe = palabrasDeUsuario[i].some((p) => distancia(palabra, p, margen) <= margen)
      if (existe) parecidos.push(i)
    }
    mapa.set(palabra, parecidos.length === 1 ? parecidos : [])
  }

  return mapa
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
  if (excel.length === 0 || usuarios.length === 0) return null

  const palabrasDeUsuario = usuarios.map((u) => palabras(u.nombre))
  const porPalabra = usuariosPorPalabra(excel, usuarios)

  // Al menos una palabra tiene que encajar de forma EXACTA con alguna persona.
  // Si todas son aproximadas no hay ningún ancla y no se sabe de quién se trata:
  // "Candiotti" no se parece a nadie porque no se parece a nadie de forma
  // concluyente, y adivinarlo sería inventar un reparto.
  let hayExacta = false
  for (const palabra of excel) {
    if (palabrasDeUsuario.some((delUsuario) => delUsuario.includes(palabra))) {
      hayExacta = true
      break
    }
  }
  if (!hayExacta) return null

  // Una persona vale si TODAS las palabras del Excel la señalan.
  const candidatos: number[] = []
  for (let i = 0; i < usuarios.length; i += 1) {
    if (excel.every((p) => (porPalabra.get(p) ?? []).includes(i))) candidatos.push(i)
  }
  if (candidatos.length !== 1) return null

  const elegido = candidatos[0]
  const conjunto = new Set(palabrasDeUsuario[elegido])
  const aproximadas = excel.filter((p) => !conjunto.has(p))
  const nivel: NivelCoincidencia =
    aproximadas.length > 0
      ? 'APROXIMADA'
      : excel.length === palabrasDeUsuario[elegido].length
        ? 'EXACTA'
        : 'CONTIENE'

  return {
    usuarioId: usuarios[elegido].id,
    usuarioNombre: usuarios[elegido].nombre,
    nivel,
    coincidentes: excel.filter((p) => conjunto.has(p)),
    aproximadas,
  }
}

/** Explicación para la interfaz y para el motivo que se guarda. */
export function explicarCoincidencia(nombreExcel: string | null, c: Coincidencia | null): string {
  if (!c) {
    if (!nombreExcel) return 'La fila del Excel no indica a quién se asignan las horas.'
    return `"${nombreExcel}" no coincide exactamente con ninguna persona del personal.`
  }
  if (c.nivel === 'EXACTA') return `"${nombreExcel}" coincide con ${c.usuarioNombre}.`
  if (c.nivel === 'APROXIMADA') {
    return `"${nombreExcel}" corresponde a ${c.usuarioNombre} (se corrigieron ${c.aproximadas.join(', ')}).`
  }
  return `"${nombreExcel}" corresponde a ${c.usuarioNombre}, registrado con más apellidos.`
}
