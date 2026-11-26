/** El refrigerio es fijo en Perú, todos los días de 13:00 a 14:00. */
const DESFASE_PERU_MS = 5 * 60 * 60 * 1000
const UNA_HORA_MS = 60 * 60 * 1000
const UN_DIA_MS = 24 * UNA_HORA_MS

export function esHorarioRefrigerio(fecha: Date = new Date()): boolean {
  // Perú no aplica horario de verano; se usa UTC para no depender de la zona
  // horaria del navegador ni de la zona configurada en la base de datos.
  return new Date(fecha.getTime() - DESFASE_PERU_MS).getUTCHours() === 13
}

/** Primer inicio de refrigerio que alcanza un tramo continuo de trabajo. */
export function inicioPausaRefrigerio(inicio: Date, ahora = new Date()): Date | null {
  const fechaPeru = new Date(inicio.getTime() - DESFASE_PERU_MS)
  let corte = Date.UTC(fechaPeru.getUTCFullYear(), fechaPeru.getUTCMonth(), fechaPeru.getUTCDate(), 18)
  if (inicio.getTime() >= corte + UNA_HORA_MS) corte += UN_DIA_MS
  corte = Math.max(corte, inicio.getTime())
  return corte <= ahora.getTime() ? new Date(corte) : null
}

/** Evita imputar tiempo al refrigerio incluso al cargar bloques retroactivos. */
export function cruzaRefrigerio(inicio: Date, fin: Date): boolean {
  return inicioPausaRefrigerio(inicio, new Date(fin.getTime() - 1)) !== null
}
