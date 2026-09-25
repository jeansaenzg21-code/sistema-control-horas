export const UMBRAL_HORAS_BOLSA = 10
export const UMBRAL_PORCENTAJE_BOLSA = 20

export type EstadoBolsaHoras = 'normal' | 'por_agotarse' | 'agotada'

export interface EvaluacionBolsaHoras {
  contratadas: number
  consumidas: number
  restantes: number
  porcentajeRestante: number
  estado: EstadoBolsaHoras
}

export function evaluarBolsaHoras(contratadas: number | string, consumidas: number | string): EvaluacionBolsaHoras {
  const contratadasNumero = Number(contratadas)
  const consumidasNumero = Number(consumidas)
  const contratadasSeguras = Number.isFinite(contratadasNumero) ? Math.max(0, contratadasNumero) : 0
  const consumidasSeguras = Number.isFinite(consumidasNumero) ? Math.max(0, consumidasNumero) : 0
  const restantes = contratadasSeguras - consumidasSeguras
  const porcentajeRestante = contratadasSeguras > 0 ? (restantes / contratadasSeguras) * 100 : 0

  if (contratadasSeguras <= 0) {
    return {
      contratadas: contratadasSeguras,
      consumidas: consumidasSeguras,
      restantes,
      porcentajeRestante: 0,
      estado: 'normal',
    }
  }

  const estado: EstadoBolsaHoras = restantes <= 0
    ? 'agotada'
    : restantes <= UMBRAL_HORAS_BOLSA || porcentajeRestante <= UMBRAL_PORCENTAJE_BOLSA
      ? 'por_agotarse'
      : 'normal'

  return {
    contratadas: contratadasSeguras,
    consumidas: consumidasSeguras,
    restantes,
    porcentajeRestante,
    estado,
  }
}
