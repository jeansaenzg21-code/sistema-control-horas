import { randomBytes } from 'crypto'
import pool from './db'

const SESSION_DURATION_HOURS = 72

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export interface SessionUser {
  id: number
  nombre: string
  usuario: string
  rol: string
  area_id: number | null
  especialidad: string | null
  activo: boolean
}

export async function getUserFromRequest(request: Request): Promise<SessionUser | null> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  if (!token || token.length < 10) return null

  const [rows] = await pool.query(
    `SELECT s.usuario_id, u.nombre, u.usuario, u.rol, u.area_id, u.especialidad, u.activo
     FROM sesiones s
     INNER JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ? AND s.expira_en > NOW()`,
    [token]
  )

  const sesiones = rows as Array<Record<string, unknown>>
  if (sesiones.length === 0) return null

  const s = sesiones[0]
  if (!s.activo) return null

  return {
    id: s.usuario_id as number,
    nombre: s.nombre as string,
    usuario: s.usuario as string,
    rol: s.rol as string,
    area_id: s.area_id as number | null,
    especialidad: s.especialidad as string | null,
    activo: Boolean(s.activo),
  }
}

export async function createSession(usuarioId: number): Promise<string> {
  const token = generateToken()
  const expiraEn = new Date()
  expiraEn.setHours(expiraEn.getHours() + SESSION_DURATION_HOURS)

  await pool.query(
    `INSERT INTO sesiones (usuario_id, token, expira_en) VALUES (?, ?, ?)`,
    [usuarioId, token, expiraEn]
  )

  return token
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sesiones WHERE token = ?`, [token])
}

export async function cleanExpiredSessions(): Promise<void> {
  await pool.query(`DELETE FROM sesiones WHERE expira_en < NOW()`)
}
