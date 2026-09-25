export interface Actividad {
  id: number
  usuario_id: number
  cliente_id: number | null
  proyecto_id?: number | null
  proyecto_nombre?: string | null
  tipo_actividad_id: number
  descripcion: string | null
  facturable: boolean | null
  inicio: string
  fin: string | null
  duracion_segundos: number | null
  pausa_acumulada_segundos: number
  estado: 'EN_CURSO' | 'PAUSADA' | 'PENDIENTE_APROBACION' | 'CORRECCION_SOLICITADA' | 'APROBADA' | 'RECHAZADA'
  revisado_por: number | null
  revisado_en: string | null
  observacion_revision: string | null
  created_at: string
  usuario_nombre?: string
  cargo?: string | null
  especialidad?: string
  tipo_actividad_nombre?: string
  area_nombre?: string
  area_id?: number | null
  cliente_nombre?: string
}

export interface WidgetUsuario {
  id: number
  nombre: string
  usuario: string
  rol: string
}

export interface WidgetContextValue {
  actividadActual: Actividad | null
  usuario: WidgetUsuario | null
  tiempoPausaMs: number | null
  pausarActividad: () => Promise<void>
  reanudarActividad: () => Promise<void>
  finalizarActividad: () => Promise<void>
}
