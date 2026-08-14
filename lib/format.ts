export function formatearHora(fecha: Date = new Date()): string {
  const horas = String(fecha.getHours()).padStart(2, '0')
  const minutos = String(fecha.getMinutes()).padStart(2, '0')
  return `${horas}:${minutos}`
}

export function formatearFecha(fecha: Date = new Date()): string {
  return fecha.toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatearTiempoTranscurrido(ms: number): string {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000))
  const horas = Math.floor(totalSegundos / 3600)
  const minutos = Math.floor((totalSegundos % 3600) / 60)
  const segundos = totalSegundos % 60
  const dos = (n: number) => String(n).padStart(2, '0')
  if (horas > 0) return `${horas}:${dos(minutos)}:${dos(segundos)}`
  return `${dos(minutos)}:${dos(segundos)}`
}

export function calcularDuracion(horaInicio: string, horaFin: string): string {
  const [ih, im] = horaInicio.split(':').map(Number)
  const [fh, fm] = horaFin.split(':').map(Number)

  if ([ih, im, fh, fm].some((n) => Number.isNaN(n))) return '—'

  let minutos = fh * 60 + fm - (ih * 60 + im)
  if (minutos < 0) minutos += 24 * 60

  const horas = Math.floor(minutos / 60)
  const restantes = minutos % 60

  if (horas === 0) return `${restantes}min`
  if (restantes === 0) return `${horas}h`
  return `${horas}h ${restantes}min`
}

export function generarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function duracionAHoras(duracion?: string): number {
  if (!duracion) return 0
  const coincidencia = duracion.match(/(\d+)h(?:\s+(\d+)m)?/)
  if (!coincidencia) return 0
  const horas = Number(coincidencia[1])
  const minutos = coincidencia[2] ? Number(coincidencia[2]) : 0
  return horas + minutos / 60
}

const MESES: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
}

export function normalizarFecha(fecha: string): string {
  const español = fecha.match(/(\d{1,2}) de ([a-záéíóúñ]+), (\d{4})/i)
  if (español) {
    const dia = español[1].padStart(2, '0')
    const mes = MESES[español[2].toLowerCase()] ?? ''
    if (!mes) return ''
    return `${español[3]}-${mes}-${dia}`
  }
  const corto = fecha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (corto) {
    return `${corto[3]}-${corto[2].padStart(2, '0')}-${corto[1].padStart(2, '0')}`
  }
  return ''
}

export function fechaEnRango(fecha: string, desde: string, hasta: string): boolean {
  if (!desde && !hasta) return true
  const normalizada = normalizarFecha(fecha)
  if (!normalizada) return true
  if (desde && normalizada < desde) return false
  if (hasta && normalizada > hasta) return false
  return true
}
