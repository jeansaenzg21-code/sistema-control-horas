import pool from '@/lib/db'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { SessionUser } from '@/lib/auth'
import { crearNotificacion } from '@/lib/notificaciones'

export const MODULOS_OBSERVACION = ['APROBACIONES', 'CUMPLIMIENTO'] as const
export const VISIBILIDADES_OBSERVACION = ['TRABAJADOR', 'INTERNA'] as const
export const TIPOS_OBSERVACION = [
  'OBSERVACION',
  'NOTA_INTERNA',
  'SOLICITUD_CORRECCION',
  'RESPUESTA',
  'REENVIO',
  'APROBACION',
  'RECHAZO',
] as const
export const ESTADOS_ATENCION = ['ABIERTA', 'ATENDIDA', 'RESUELTA'] as const

export type ModuloObservacion = (typeof MODULOS_OBSERVACION)[number]
export type VisibilidadObservacion = (typeof VISIBILIDADES_OBSERVACION)[number]
export type TipoObservacion = (typeof TIPOS_OBSERVACION)[number]
export type EstadoAtencion = (typeof ESTADOS_ATENCION)[number]
type Conexion = Pool | PoolConnection

export interface ActividadObservacion {
  id: number
  usuario_id: number
  usuario_nombre: string
  supervisor_id: number | null
  area_id: number
  empresa_id: number
  cliente_id: number | null
  descripcion: string | null
  estado: string
  periodo_anio: number
  periodo_mes: number
}

export interface NuevaObservacion {
  modulo: ModuloObservacion
  actividad_id: number | null
  usuario_destino_id: number
  periodo_anio: number | null
  periodo_mes: number | null
  autor_id: number
  empresa_id: number
  visibilidad: VisibilidadObservacion
  tipo: TipoObservacion
  contenido: string
  estado_atencion: EstadoAtencion
  parent_id: number | null
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
  estado_atencion: EstadoAtencion
  parent_id: number | null
  created_at: string
  autor: { id: number; nombre: string } | null
  actividad: {
    id: number
    descripcion: string | null
    estado: string
    inicio: string
    tipo_actividad: string | null
    cliente: string | null
  } | null
}

interface TimelineRow extends RowDataPacket {
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
  estado_atencion: EstadoAtencion
  parent_id: number | null
  created_at: Date | string
  autor_id: number | null
  autor_nombre: string | null
  actividad_descripcion: string | null
  actividad_estado: string | null
  actividad_inicio: Date | string | null
  tipo_actividad: string | null
  cliente: string | null
}

interface ParentRow extends RowDataPacket {
  id: number
  tipo: TipoObservacion
  visibilidad: VisibilidadObservacion
  usuario_destino_id: number
  autor_id: number | null
  estado_atencion: EstadoAtencion
}

/**
 * Quién puede aprobar o rechazar una actividad.
 *
 * El jefe de área entra por su ÁREA, no por su jerarquía: puede revisar lo que
 * registraron los miembros de su división y nada más. La comparación es por
 * `area_id` contra la suya y por empresa, así que un jefe no puede colarse en la
 * de otro aun si se inventa el id de la actividad.
 *
 * El supervisor sigue viniendo por su cadena de supervisión, que es más
 * estrecha: solo sus subordinados directos, aunque sean de otra área.
 */
export function puedeRevisarActividad(
  user: SessionUser,
  actividad: Pick<ActividadObservacion, 'usuario_id' | 'supervisor_id' | 'area_id' | 'empresa_id'>,
): boolean {
  if (user.rol === 'ADMINISTRACION') return true
  if (user.empresa_id !== actividad.empresa_id) return false
  if (user.rol === 'JEFE_AREA') {
    return user.area_id != null && user.area_id === actividad.area_id
  }
  return user.rol === 'SUPERVISOR' && actividad.supervisor_id === user.id
}

export function puedeVerActividad(
  user: SessionUser,
  actividad: Pick<ActividadObservacion, 'usuario_id' | 'supervisor_id' | 'area_id' | 'empresa_id'>,
): boolean {
  if (actividad.usuario_id === user.id || puedeRevisarActividad(user, actividad)) return true
  return user.rol === 'JEFE_AREA'
    && user.area_id != null
    && user.area_id === actividad.area_id
    && user.empresa_id === actividad.empresa_id
}

export async function obtenerActividadObservacion(
  conexion: Conexion,
  actividadId: number,
  empresaId: number,
  paraBloquear = false,
): Promise<ActividadObservacion | null> {
  const [rows] = await conexion.query<RowDataPacket[]>(
    `SELECT
      a.id,
      a.usuario_id,
      a.cliente_id,
      a.descripcion,
      a.estado,
      YEAR(a.inicio) AS periodo_anio,
      MONTH(a.inicio) AS periodo_mes,
       u.nombre AS usuario_nombre,
       u.supervisor_id,
       ar.id AS area_id,
       ar.empresa_id
    FROM actividades a
    INNER JOIN usuarios u ON u.id = a.usuario_id
    INNER JOIN areas ar ON ar.id = u.area_id
    WHERE a.id = ? AND ar.empresa_id = ?
    LIMIT 1${paraBloquear ? ' FOR UPDATE' : ''}`,
    [actividadId, empresaId],
  )
  const row = (rows as Array<Record<string, unknown>>)[0]
  if (!row) return null
  return {
    id: Number(row.id),
    usuario_id: Number(row.usuario_id),
    usuario_nombre: String(row.usuario_nombre),
    supervisor_id: row.supervisor_id == null ? null : Number(row.supervisor_id),
    area_id: Number(row.area_id),
    empresa_id: Number(row.empresa_id),
    cliente_id: row.cliente_id == null ? null : Number(row.cliente_id),
    descripcion: row.descripcion == null ? null : String(row.descripcion),
    estado: String(row.estado),
    periodo_anio: Number(row.periodo_anio),
    periodo_mes: Number(row.periodo_mes),
  }
}

export async function crearObservacion(
  conexion: Conexion,
  datos: NuevaObservacion,
): Promise<number> {
  const [resultado] = await conexion.query<ResultSetHeader>(
    `INSERT INTO observaciones (
      modulo,
      actividad_id,
      usuario_destino_id,
      periodo_anio,
      periodo_mes,
      autor_id,
      empresa_id,
      visibilidad,
      tipo,
      contenido,
      estado_atencion,
      parent_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.modulo,
      datos.actividad_id,
      datos.usuario_destino_id,
      datos.periodo_anio,
      datos.periodo_mes,
      datos.autor_id,
      datos.empresa_id,
      datos.visibilidad,
      datos.tipo,
      datos.contenido,
      datos.estado_atencion,
      datos.parent_id,
    ],
  )
  return resultado.insertId
}

export async function obtenerParentObservacion(
  conexion: Conexion,
  parentId: number,
  empresaId: number,
  actividadId: number,
  usuarioDestinoId: number,
): Promise<ParentRow | null> {
  const [rows] = await conexion.query<RowDataPacket[]>(
    `SELECT id, tipo, visibilidad, usuario_destino_id, autor_id, estado_atencion
     FROM observaciones
     WHERE id = ?
       AND empresa_id = ?
       AND actividad_id = ?
       AND usuario_destino_id = ?
       AND modulo = 'APROBACIONES'
     LIMIT 1`,
    [parentId, empresaId, actividadId, usuarioDestinoId],
  )
  return ((rows as ParentRow[])[0] ?? null)
}

export async function obtenerUltimaSolicitudCorreccion(
  conexion: Conexion,
  empresaId: number,
  actividadId: number,
  usuarioId: number,
): Promise<ParentRow | null> {
  const [rows] = await conexion.query<RowDataPacket[]>(
    `SELECT id, tipo, visibilidad, usuario_destino_id, autor_id, estado_atencion
     FROM observaciones
     WHERE empresa_id = ?
       AND actividad_id = ?
       AND usuario_destino_id = ?
       AND modulo = 'APROBACIONES'
       AND tipo = 'SOLICITUD_CORRECCION'
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [empresaId, actividadId, usuarioId],
  )
  return ((rows as ParentRow[])[0] ?? null)
}

function mapTimelineRow(row: TimelineRow): ObservacionTimeline {
  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : String(row.created_at)
  const actividadInicio = row.actividad_inicio instanceof Date
    ? row.actividad_inicio.toISOString()
    : row.actividad_inicio == null
      ? null
      : String(row.actividad_inicio)
  return {
    id: Number(row.id),
    modulo: row.modulo,
    actividad_id: row.actividad_id == null ? null : Number(row.actividad_id),
    usuario_destino_id: Number(row.usuario_destino_id),
    periodo_anio: row.periodo_anio == null ? null : Number(row.periodo_anio),
    periodo_mes: row.periodo_mes == null ? null : Number(row.periodo_mes),
    empresa_id: Number(row.empresa_id),
    visibilidad: row.visibilidad,
    tipo: row.tipo,
    contenido: String(row.contenido),
    estado_atencion: row.estado_atencion,
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    created_at: createdAt,
    autor: row.autor_id == null
      ? null
      : { id: Number(row.autor_id), nombre: String(row.autor_nombre ?? '') },
    actividad: row.actividad_id == null
      ? null
      : {
          id: Number(row.actividad_id),
          descripcion: row.actividad_descripcion == null
            ? null
            : String(row.actividad_descripcion),
          estado: String(row.actividad_estado ?? ''),
          inicio: String(actividadInicio ?? ''),
          tipo_actividad: row.tipo_actividad == null ? null : String(row.tipo_actividad),
          cliente: row.cliente == null ? null : String(row.cliente),
        },
  }
}

const SELECT_TIMELINE = `
  SELECT
    o.id,
    o.modulo,
    o.actividad_id,
    o.usuario_destino_id,
    o.periodo_anio,
    o.periodo_mes,
    o.empresa_id,
    o.visibilidad,
    o.tipo,
    o.contenido,
    o.estado_atencion,
    o.parent_id,
    o.created_at,
    autor.id AS autor_id,
    autor.nombre AS autor_nombre,
    a.descripcion AS actividad_descripcion,
    a.estado AS actividad_estado,
    a.inicio AS actividad_inicio,
    ta.nombre AS tipo_actividad,
    c.nombre AS cliente
  FROM observaciones o
  LEFT JOIN usuarios autor ON autor.id = o.autor_id
  LEFT JOIN actividades a ON a.id = o.actividad_id
  LEFT JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
  LEFT JOIN clientes c ON c.id = a.cliente_id
`

export async function obtenerTimelineObservaciones(
  empresaId: number,
  actividadId: number,
  soloDestinatario: number | null,
  soloVisibles: boolean,
): Promise<ObservacionTimeline[]> {
  const condiciones = ['o.empresa_id = ?', 'o.actividad_id = ?', "o.modulo = 'APROBACIONES'"]
  const parametros: Array<number> = [empresaId, actividadId]
  if (soloDestinatario !== null) {
    condiciones.push('o.usuario_destino_id = ?')
    parametros.push(soloDestinatario)
  }
  if (soloVisibles) condiciones.push("o.visibilidad = 'TRABAJADOR'")
  const [rows] = await pool.query<RowDataPacket[]>(
    `${SELECT_TIMELINE}
     WHERE ${condiciones.join(' AND ')}
     ORDER BY o.created_at ASC, o.id ASC`,
    parametros,
  )
  return (rows as TimelineRow[]).map(mapTimelineRow)
}

export async function obtenerObservacionCreada(
  observacionId: number,
  empresaId: number,
): Promise<ObservacionTimeline | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `${SELECT_TIMELINE}
     WHERE o.id = ? AND o.empresa_id = ?
     LIMIT 1`,
    [observacionId, empresaId],
  )
  const row = (rows as TimelineRow[])[0]
  return row ? mapTimelineRow(row) : null
}

export async function notificarObservacionVisible(
  observacion: ObservacionTimeline,
  accion?: string,
): Promise<boolean> {
  if (observacion.visibilidad !== 'TRABAJADOR') return false
  const url = observacion.actividad_id
    ? `/actividades?actividad=${observacion.actividad_id}&observacion=${observacion.id}${accion ? `&accion=${accion}` : ''}`
    : `/actividades?pestana=observaciones&observacion=${observacion.id}`
  const titulo = observacion.tipo === 'SOLICITUD_CORRECCION'
    ? 'Corrección de actividad solicitada'
    : 'Nueva observación'
  return crearNotificacion({
    usuario_id: observacion.usuario_destino_id,
    empresa_id: observacion.empresa_id,
    tipo: 'observacion',
    titulo,
    mensaje: observacion.contenido,
    url,
    clave_deduplicacion: `observacion:${observacion.id}`,
  })
}
