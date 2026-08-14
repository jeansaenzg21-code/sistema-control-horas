export interface FilaReporte {
  [clave: string]: string | number
}

export function exportarExcel(columnas: string[], filas: FilaReporte[], nombre: string) {
  const encabezado = columnas.join(';')
  const cuerpo = filas
    .map((fila) => columnas.map((columna) => normalizeCSV(fila[columna] ?? '')).join(';'))
    .join('\r\n')
  // BOM para que Excel reconozca UTF-8
  const contenido = '\uFEFF' + [encabezado, cuerpo].join('\r\n')
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
  descargarBlob(blob, `${nombre}.csv`)
}

export function exportarPDF() {
  window.print()
}

function normalizeCSV(valor: unknown): string {
  const texto = String(valor)
  return `"${texto.replace(/"/g, '""')}"`
}

function descargarBlob(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}