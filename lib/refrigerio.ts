/** El refrigerio es fijo en Perú, todos los días de 13:00 a 14:00. */
const DESFASE_PERU_MS = 5 * 60 * 60 * 1000
const UNA_HORA_MS = 60 * 60 * 1000
const UN_DIA_MS = 24 * UNA_HORA_MS

export function esHorarioRefrigerio(fecha: Date = new Date()): boolean {
  // Perú no aplica horario de verano; se usa UTC para no depender de la zona
  // horaria del navegador ni de la zona configurada en la base de datos.
  return new Date(fecha.getTime() - DESFASE_PERU_MS).getUTCHours() === 13
}

/** Evita imputar tiempo al refrigerio incluso al cargar bloques retroactivos. */
export function cruzaRefrigerio(inicio: Date, fin: Date): boolean {
  const fechaPeru = new Date(inicio.getTime() - DESFASE_PERU_MS)
  let inicioRefrigerio = Date.UTC(
    fechaPeru.getUTCFullYear(), fechaPeru.getUTCMonth(), fechaPeru.getUTCDate(), 18,
  )
  if (inicio.getTime() >= inicioRefrigerio + UNA_HORA_MS) inicioRefrigerio += UN_DIA_MS
  return inicio.getTime() < inicioRefrigerio + UNA_HORA_MS && fin.getTime() > inicioRefrigerio
}
