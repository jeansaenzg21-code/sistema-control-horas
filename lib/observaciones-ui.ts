export type ModuloObservacion = 'APROBACIONES' | 'CUMPLIMIENTO'
export type VisibilidadObservacion = 'TRABAJADOR' | 'INTERNA'
export type EstadoAtencionObservacion = 'ABIERTA' | 'ATENDIDA' | 'RESUELTA'
export type TipoObservacion =
  | 'OBSERVACION'
  | 'NOTA_INTERNA'
  | 'SOLICITUD_CORRECCION'
  | 'RESPUESTA'
  | 'REENVIO'
  | 'APROBACION'
  | 'RECHAZO'

export interface AutorObservacion {
  id: number
  nombre: string
}

export interface ObservacionTimeline {
  id: number
  modulo: ModuloObservacion
  actividad_id: number | null
  usuario_destino_id: number
  periodo_anio: number | null
  periodo_mes: number | null
  empresa_id: number
  visibilidad: VisibilidadObservacion
  tipo: TipoObservacion
  contenido: string
  estado_atencion: EstadoAtencionObservacion
  parent_id: number | null
  created_at: string
  autor: AutorObservacion | null
  actividad: {
    id: number
    descripcion: string | null
    estado: string
    inicio: string
    tipo_actividad: string | null
    cliente: string | null
  } | null
}

export interface AccionMisObservacion {
  codigo: 'RESPONDER' | 'CORREGIR' | 'REENVIO' | 'ATENDER' | 'VER'
  etiqueta: string
  url: string
}

export interface MisObservacion {
  id: number
  modulo: ModuloObservacion
  tipo: TipoObservacion
  contenido: string
  estado_atencion: EstadoAtencionObservacion
  parent_id: number | null
  periodo: {
    anio: number | null
    mes: number | null
  }
  actividad: {
    id: number
    descripcion: string | null
    estado: string
    inicio: string | null
    tipo_actividad: string | null
    cliente: string | null
  } | null
  autor: AutorObservacion | null
  created_at: string
  acciones: AccionMisObservacion[]
}

export interface CumplimientoObservacion {
  id: number
  usuario_id: number
  contenido: string
  visibilidad: VisibilidadObservacion
  tipo?: TipoObservacion
  estado_atencion: EstadoAtencionObservacion
  parent_id?: number | null
  autor_nombre: string | null
  usuario_nombre?: string | null
  created_at: string
}

export function esVisibleParaTrabajador(observacion: { visibilidad?: string; tipo?: string }): boolean {
  return observacion.visibilidad !== 'INTERNA' && observacion.tipo !== 'NOTA_INTERNA'
}

export function normalizarVisibilidad(valor: unknown): VisibilidadObservacion {
  return String(valor ?? 'TRABAJADOR').toUpperCase() === 'INTERNA' ? 'INTERNA' : 'TRABAJADOR'
}

export function normalizarEstadoAtencion(valor: unknown): EstadoAtencionObservacion {
  const estado = String(valor ?? 'ABIERTA').toUpperCase()
  if (estado === 'ATENDIDA' || estado === 'RESUELTA') return estado
  return 'ABIERTA'
}
