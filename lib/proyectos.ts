import pool from './db'
import { getEmpresaContext, getUserFromRequest, type SessionUser } from './auth'
import { esAdministrador, esJefeDeArea } from './permisos'

export function normalizarFechaSQL(valor: unknown): string | null {
  if (valor == null || valor === '') return null
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null
    const anio = valor.getFullYear()
    const mes = String(valor.getMonth() + 1).padStart(2, '0')
    const dia = String(valor.getDate()).padStart(2, '0')
    return `${anio}-${mes}-${dia}`
  }
  return String(valor).slice(0, 10)
}

export type EstadoProyecto = 'PLANIFICACION' | 'EN_CURSO' | 'PAUSADO' | 'COMPLETADO' | 'CANCELADO'
export type RolProyecto = 'LIDER' | 'COORDINADOR' | 'ESPECIALISTA' | 'COLABORADOR'

export interface ProyectoParticipante {
  usuario_id: number
  nombre: string
  usuario: string
  rol: string
  area_id: number
  area_nombre: string
  cargo: string | null
  especialidad: string | null
  rol_proyecto: RolProyecto
}

export interface Proyecto {
  id: number
  empresa_id: number
  cliente_id: number | null
  cliente_nombre: string | null
  jefe_id: number
  jefe_nombre: string
  nombre: string
  descripcion: string | null
  estado: EstadoProyecto
  fecha_inicio: string | null
  fecha_fin: string | null
  activo: boolean
  participantes_count: number
  areas: string
  created_at: string
  updated_at: string
}

export interface ProyectoDetalle extends Proyecto {
  participantes: ProyectoParticipante[]
  areas_detalle: Array<{ id: number; nombre: string }>
  actividades: Array<{
    id: number
    usuario_id: number
    usuario_nombre: string
    descripcion: string | null
    estado: string
    inicio: string
    fin: string | null
    duracion_segundos: number | null
  }>
}

export async function getProyectoContexto(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return { error: 'No autorizado.', status: 401 } as const
  const context = await getEmpresaContext(user)
  if (!context.activa) return { error: 'No hay una empresa activa.', status: 409 } as const
  return { user, empresaId: context.activa.id } as const
}

export async function estructuraProyectosDisponible(): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proyectos') AS tabla_proyectos,
      (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proyecto_areas') AS tabla_areas,
      (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proyecto_participantes') AS tabla_participantes,
      (SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proyectos'
         AND COLUMN_NAME IN ('id', 'empresa_id', 'cliente_id', 'jefe_id', 'nombre', 'descripcion', 'estado', 'fecha_inicio', 'fecha_fin', 'activo', 'created_at', 'updated_at')) AS columnas_proyectos,
      (SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proyecto_areas'
         AND COLUMN_NAME IN ('proyecto_id', 'area_id')) AS columnas_areas,
      (SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proyecto_participantes'
         AND COLUMN_NAME IN ('proyecto_id', 'usuario_id', 'rol_proyecto')) AS columnas_participantes`
  )
  const row = (rows as Array<{
    tabla_proyectos: number | string
    tabla_areas: number | string
    tabla_participantes: number | string
    columnas_proyectos: number | string
    columnas_areas: number | string
    columnas_participantes: number | string
  }>)[0]
  return Number(row?.tabla_proyectos ?? 0) > 0
    && Number(row?.tabla_areas ?? 0) > 0
    && Number(row?.tabla_participantes ?? 0) > 0
    && Number(row?.columnas_proyectos ?? 0) === 12
    && Number(row?.columnas_areas ?? 0) === 2
    && Number(row?.columnas_participantes ?? 0) === 3
}

export async function proyectosDisponibles(): Promise<boolean> {
  if (!(await estructuraProyectosDisponible())) return false
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'actividades'
       AND COLUMN_NAME = 'proyecto_id'`
  )
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0) > 0
}

export async function obtenerProyectoRow(id: number, empresaId: number): Promise<Record<string, unknown> | null> {
  const [rows] = await pool.query(
    `SELECT p.id, p.empresa_id, p.cliente_id, c.nombre AS cliente_nombre,
            p.jefe_id, jefe.nombre AS jefe_nombre, p.nombre, p.descripcion, p.estado,
            p.fecha_inicio, p.fecha_fin, p.activo, p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM proyecto_participantes pp WHERE pp.proyecto_id = p.id) AS participantes_count,
            (SELECT GROUP_CONCAT(ar.nombre ORDER BY ar.nombre SEPARATOR ', ')
             FROM proyecto_areas pa INNER JOIN areas ar ON ar.id = pa.area_id
             WHERE pa.proyecto_id = p.id) AS areas
     FROM proyectos p
     LEFT JOIN clientes c ON c.id = p.cliente_id
       AND c.area_id IN (SELECT ar_empresa.id FROM areas ar_empresa WHERE ar_empresa.empresa_id = p.empresa_id)
     INNER JOIN usuarios jefe ON jefe.id = p.jefe_id
     INNER JOIN areas jefe_area ON jefe_area.id = jefe.area_id AND jefe_area.empresa_id = p.empresa_id
     WHERE p.id = ? AND p.empresa_id = ? AND p.activo = TRUE
     LIMIT 1`,
    [id, empresaId]
  )
  return (rows as Array<Record<string, unknown>>)[0] ?? null
}

export async function puedeAccederProyecto(user: SessionUser, proyectoId: number, empresaId: number): Promise<boolean> {
  if (esAdministrador(user)) {
    return Boolean(await obtenerProyectoRow(proyectoId, empresaId))
  }
  const [rows] = await pool.query(
    `SELECT p.id
     FROM proyectos p
     WHERE p.id = ?
       AND p.empresa_id = ?
       AND p.activo = TRUE
       AND (
         p.jefe_id = ?
         OR EXISTS (
           SELECT 1 FROM proyecto_participantes pp
           WHERE pp.proyecto_id = p.id AND pp.usuario_id = ?
         )
       )
     LIMIT 1`,
    [proyectoId, empresaId, user.id, user.id]
  )
  return (rows as unknown[]).length > 0
}

export async function puedeEditarProyecto(user: SessionUser, proyectoId: number, empresaId: number): Promise<boolean> {
  if (esAdministrador(user)) return Boolean(await obtenerProyectoRow(proyectoId, empresaId))
  if (!esJefeDeArea(user)) return false
  const [rows] = await pool.query(
    `SELECT p.id
     FROM proyectos p
     WHERE p.id = ? AND p.empresa_id = ? AND p.activo = TRUE AND p.jefe_id = ?
     LIMIT 1`,
    [proyectoId, empresaId, user.id]
  )
  return (rows as unknown[]).length > 0
}

export async function obtenerParticipantes(proyectoId: number): Promise<ProyectoParticipante[]> {
  const [rows] = await pool.query(
    `SELECT u.id AS usuario_id, u.nombre, u.usuario, u.rol, u.area_id,
            ar.nombre AS area_nombre, u.cargo, u.especialidad, pp.rol_proyecto
     FROM proyecto_participantes pp
     INNER JOIN usuarios u ON u.id = pp.usuario_id
     INNER JOIN areas ar ON ar.id = u.area_id
     WHERE pp.proyecto_id = ?
       AND ar.empresa_id = (SELECT p.empresa_id FROM proyectos p WHERE p.id = pp.proyecto_id)
     ORDER BY FIELD(pp.rol_proyecto, 'LIDER', 'COORDINADOR', 'ESPECIALISTA', 'COLABORADOR'), u.nombre`,
    [proyectoId]
  )
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    usuario_id: Number(row.usuario_id),
    nombre: String(row.nombre),
    usuario: String(row.usuario),
    rol: String(row.rol),
    area_id: Number(row.area_id),
    area_nombre: String(row.area_nombre),
    cargo: row.cargo == null ? null : String(row.cargo),
    especialidad: row.especialidad == null ? null : String(row.especialidad),
    rol_proyecto: String(row.rol_proyecto) as RolProyecto,
  }))
}

export function serializarProyecto(row: Record<string, unknown>): Proyecto {
  return {
    id: Number(row.id),
    empresa_id: Number(row.empresa_id),
    cliente_id: row.cliente_id == null ? null : Number(row.cliente_id),
    cliente_nombre: row.cliente_nombre == null ? null : String(row.cliente_nombre),
    jefe_id: Number(row.jefe_id),
    jefe_nombre: String(row.jefe_nombre),
    nombre: String(row.nombre),
    descripcion: row.descripcion == null ? null : String(row.descripcion),
    estado: String(row.estado) as EstadoProyecto,
    fecha_inicio: normalizarFechaSQL(row.fecha_inicio),
    fecha_fin: normalizarFechaSQL(row.fecha_fin),
    activo: Boolean(row.activo),
    participantes_count: Number(row.participantes_count ?? 0),
    areas: row.areas == null ? '' : String(row.areas),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export function esLiderProyecto(user: SessionUser, proyecto: Proyecto): boolean {
  return esAdministrador(user) || (esJefeDeArea(user) && proyecto.jefe_id === user.id)
}
