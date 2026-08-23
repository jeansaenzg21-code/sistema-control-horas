export type EstadoActividad =
  | 'EN_CURSO'
  | 'PAUSADA'
  | 'PENDIENTE_APROBACION'
  | 'APROBADA'
  | 'RECHAZADA'

export interface Actividad {
  id: number
  usuario_id: number
  cliente_id: number | null
  tipo_actividad_id: number
  descripcion: string | null
  facturable: boolean | null
  inicio: string
  fin: string | null
  duracion_segundos: number | null
  pausa_acumulada_segundos: number
  estado: EstadoActividad
  revisado_por: number | null
  revisado_en: string | null
  observacion_revision: string | null
  created_at: string
  usuario_nombre?: string
  especialidad?: string
  tipo_actividad_nombre?: string
  area_nombre?: string
  area_id?: number | null
  cliente_nombre?: string
}

export interface ActividadFormData {
  descripcion: string
  tipo_actividad_id: number
  usuario_id: number
  facturable?: boolean | null
}
