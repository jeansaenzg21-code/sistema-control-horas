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

export function calcularDuracion(horaInicio: string, horaFin: string, pausaSegundos = 0): string {
  const [ih, im, is] = horaInicio.split(':').map(Number)
  const [fh, fm, fs] = horaFin.split(':').map(Number)
  if ([ih, im, fh, fm].some((n) => Number.isNaN(n))) return '—'
  const totalSeg = Math.max(0, (fh * 3600 + fm * 60 + (fs || 0)) - (ih * 3600 + im * 60 + (is || 0)) - pausaSegundos)
  const horas = Math.floor(totalSeg / 3600)
  const restantes = Math.floor((totalSeg % 3600) / 60)
  if (horas === 0) return `${restantes}min`
  if (restantes === 0) return `${horas}h`
  return `${horas}h ${restantes}min`
}
