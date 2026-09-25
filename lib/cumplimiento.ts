export type TipoExcepcion = 'FERIADO' | 'VACACIONES'

export interface Excepcion {
  id: number
  fecha: string
  tipo: TipoExcepcion
  usuario_id: number | null
  usuario_nombre: string | null
  ambito: 'todos' | 'colaborador'
  descripcion: string | null
  created_at: string
  updated_at: string
}

export type EstadoDia =
  | 'reportado'
  | 'pendiente'
  | 'incompleto'
  | 'feriado'
  | 'vacacion'
  | 'no_exigible'

export interface DiaCumplimiento {
  dia: number
  fecha: string
  estado: EstadoDia
  etiqueta: string
}

export type EstadoCumplimiento = 'CUMPLE' | 'CUMPLE_PARCIAL' | 'NO_CUMPLE'

export interface ColaboradorCumplimiento {
  id: number
  nombre: string
  area_nombre: string
  cargo: string | null
  registros: number
  horas_totales: number
  exigibles: number
  reportados: number
  pendientes: number
  incompletos: number
  cobertura: number
  semanas_exigidas: number
  semanas_reportadas: number
  semanas_pendientes: number
  estado: EstadoCumplimiento
  observacion: string
  dias: DiaCumplimiento[]
}

export interface PendienteRevisar {
  id: number
  usuario_id: number
  usuario_nombre: string
  fecha: string
  cliente_id: number | null
  cliente_nombre: string | null
  actividad: string | null
  horas_definidas: boolean
  horas: number
  dato_faltante: string
  estado: string
}

export interface SemanaCumplimiento {
  inicio: string
  fin: string
}

export interface DiaMolde {
  dia: number
  fecha: string
  dia_semana: number
  fin_semana: boolean
  semana_index: number
}

export interface CumplimientoResumen {
  colaboradores: number
  dias_exigibles: number
  dias_reportados: number
  cobertura: number
  cumplen: number
  cumplen_parcial: number
  no_cumplen: number
  registros_por_revisar: number
}

export interface CumplimientoReporte {
  periodo: {
    anio: number
    mes: number
    desde: string
    hasta: string
    dias_mes: number
    dias: DiaMolde[]
    semanas: SemanaCumplimiento[]
  }
  resumen: CumplimientoResumen
  colaboradores: ColaboradorCumplimiento[]
  pendientes: PendienteRevisar[]
}

export interface OpcionesCumplimiento {
  anio: number
  mes: number
  usuario_id?: number | null
  cliente_id?: number | null
}

// Datos que faltan de un registro según la lógica del Excel.
// Orden: Cliente → Actividad → Horas → Clasificación facturable.
export function datosFaltantesActividad(r: {
  cliente_id: number | null
  descripcion: string | null
  fin: Date | string | null
  facturable: unknown
}): string[] {
  const codigos: string[] = []
  if (r.cliente_id == null) codigos.push('cliente')
  if (!r.descripcion || !r.descripcion.trim()) codigos.push('actividad')
  if (r.fin == null) codigos.push('horas')
  if (r.fin != null && r.facturable == null) codigos.push('clasificación facturable')
  return codigos
}

export function textoDatosFaltantes(codigos: string[]): string {
  if (codigos.length === 1) return `Falta ${codigos[0]}`
  return `Faltan ${codigos.join(' y ')}`
}