export type EstadoActividad =
  | 'en_curso'
  | 'pausada'
  | 'pendiente_aprobacion'
  | 'aprobada'
  | 'rechazada'

export interface Actividad {
  id: string
  titulo: string
  especialidad: string
  areaId?: string | null
  usuarioId?: string
  usuarioNombre?: string
  tipo: string
  facturable?: boolean | null
  fecha: string
  horaInicio: string
  iniciadaEn: number
  acumuladoMs?: number
  creadaEn?: number
  horaFin?: string
  duracion?: string
  estado: EstadoActividad
}

export interface ActividadFormData {
  titulo: string
  tipo: string
  especialidad: string
  areaId?: string | null
  usuarioId?: string
  usuarioNombre?: string
}
