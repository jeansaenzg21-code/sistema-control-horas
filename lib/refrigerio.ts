/** Horario de refrigerio según la hora local del trabajador: [13:00, 14:00). */
export function esHorarioRefrigerio(fecha: Date = new Date()): boolean {
  return fecha.getHours() === 13
}
