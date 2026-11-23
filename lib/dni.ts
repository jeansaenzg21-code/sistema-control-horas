/** Recupera los ceros que Excel pierde al leer una celda como número. */
export function normalizarDni(valor: unknown): string | null {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null
  const texto = String(valor).trim()
  if (!/^\d{1,8}$/.test(texto)) return null
  return texto.padStart(8, '0')
}
