// Constantes compartidas entre cliente y servidor. Convención:
// 1 = Lunes ... 7 = Domingo.
export interface DiaSemana {
  dia_semana: number
  nombre: string
  corto: string
}

export const NOMBRES_DIAS: DiaSemana[] = [
  { dia_semana: 1, nombre: 'Lunes', corto: 'Lun' },
  { dia_semana: 2, nombre: 'Martes', corto: 'Mar' },
  { dia_semana: 3, nombre: 'Miércoles', corto: 'Mié' },
  { dia_semana: 4, nombre: 'Jueves', corto: 'Jue' },
  { dia_semana: 5, nombre: 'Viernes', corto: 'Vie' },
  { dia_semana: 6, nombre: 'Sábado', corto: 'Sáb' },
  { dia_semana: 7, nombre: 'Domingo', corto: 'Dom' },
]