import { randomUUID } from 'crypto'
import pool from '@/lib/db'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'

export interface NuevaNotificacion {
  usuario_id: number
  empresa_id: number
  tipo: string
  titulo: string
  mensaje: string | null
  url: string | null
  clave_deduplicacion?: string | null
}

export async function crearNotificacion(datos: NuevaNotificacion): Promise<boolean> {
  const clave = datos.clave_deduplicacion ?? `evento:${randomUUID()}`
  try {
    const [resultado] = await pool.query<ResultSetHeader>(
      `INSERT INTO notificaciones (
        usuario_id,
        empresa_id,
        tipo,
        titulo,
        mensaje,
        url,
        clave_deduplicacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE id = id`,
      [
        datos.usuario_id,
        datos.empresa_id,
        datos.tipo,
        datos.titulo,
        datos.mensaje ?? '',
        datos.url,
        clave,
      ],
    )
    return resultado.affectedRows > 0
  } catch (error) {
    console.error('Error al crear notificación:', error)
    return false
  }
}

export async function notificarAdministradoresEmpresa(
  empresaId: number,
  tipo: string,
  titulo: string,
  mensaje: string,
  url: string,
  claveDeduplicacion: string,
): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id
     FROM usuarios u
     INNER JOIN areas ar ON ar.id = u.area_id
     WHERE u.rol = 'ADMINISTRACION'
       AND u.activo = TRUE
       AND ar.empresa_id = ?`,
    [empresaId],
  )
  const administradores = rows as Array<{ id: number }>
  let creadas = 0
  for (const administrador of administradores) {
    const creada = await crearNotificacion({
      usuario_id: Number(administrador.id),
      empresa_id: empresaId,
      tipo,
      titulo,
      mensaje,
      url,
      clave_deduplicacion: claveDeduplicacion,
    })
    if (creada) creadas += 1
  }
  return creadas
}

export async function notificarRevisoresActividad(
  empresaId: number,
  propietarioId: number,
  tipo: string,
  titulo: string,
  mensaje: string,
  url: string,
  claveDeduplicacion: string,
): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT u.id
     FROM usuarios u
     LEFT JOIN usuarios propietario ON propietario.id = ?
     LEFT JOIN areas ua ON ua.id = u.area_id
       WHERE u.activo = TRUE
         AND ua.empresa_id = ?
         AND (
            u.rol = 'ADMINISTRACION'
            OR (u.rol = 'SUPERVISOR' AND u.id = propietario.supervisor_id)
         )`,
     [propietarioId, empresaId],
  )
  const revisores = rows as Array<{ id: number }>
  let creadas = 0
  for (const revisor of revisores) {
    const creada = await crearNotificacion({
      usuario_id: Number(revisor.id),
      empresa_id: empresaId,
      tipo,
      titulo,
      mensaje,
      url,
      clave_deduplicacion: claveDeduplicacion,
    })
    if (creada) creadas += 1
  }
  return creadas
}
