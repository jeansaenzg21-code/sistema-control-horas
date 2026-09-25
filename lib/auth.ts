import { randomBytes } from 'crypto'
import pool from './db'

const SESSION_DURATION_HOURS = 72

export interface EmpresaSesion {
  id: number
  nombre: string
  descripcion: string | null
  pais: string
  ciudad: string | null
  logo: string | null
}

export interface SessionUser {
  id: number
  nombre: string
  usuario: string
  rol: string
  area_id: number | null
  cargo: string | null
  especialidad: string | null
  activo: boolean
  empresa_id: number | null
}

export interface EmpresaContext {
  activa: EmpresaSesion | null
  disponibles: EmpresaSesion[]
}

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

function mapEmpresa(row: Record<string, unknown>): EmpresaSesion {
  return {
    id: Number(row.id),
    nombre: String(row.nombre),
    descripcion: row.descripcion == null ? null : String(row.descripcion),
    pais: String(row.pais || 'Perú'),
    ciudad: row.ciudad == null ? null : String(row.ciudad),
    logo: row.logo == null ? null : String(row.logo),
  }
}

export async function getUserFromRequest(request: Request): Promise<SessionUser | null> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  if (!token || token.length < 10) return null

  const [rows] = await pool.query(
    `SELECT s.usuario_id, s.empresa_id, u.nombre, u.usuario, u.rol, u.area_id, u.cargo, u.especialidad, u.activo
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
    id: Number(s.usuario_id),
    nombre: String(s.nombre),
    usuario: String(s.usuario),
    rol: String(s.rol),
    area_id: s.area_id == null ? null : Number(s.area_id),
    cargo: s.cargo == null ? null : String(s.cargo),
    especialidad: s.especialidad == null ? null : String(s.especialidad),
    activo: Boolean(s.activo),
    empresa_id: s.empresa_id == null ? null : Number(s.empresa_id),
  }
}

export async function getEmpresasDisponibles(user: SessionUser): Promise<EmpresaSesion[]> {
  if (user.rol === 'ADMINISTRACION') {
    const [rows] = await pool.query(
      'SELECT id, nombre, descripcion, pais, ciudad, logo FROM empresa ORDER BY id'
    )
    return (rows as Array<Record<string, unknown>>).map(mapEmpresa)
  }

  if (!user.area_id) return []
  const [rows] = await pool.query(
    `SELECT DISTINCT e.id, e.nombre, e.descripcion, e.pais, e.ciudad, e.logo
     FROM empresa e
     INNER JOIN areas a ON a.empresa_id = e.id
     WHERE a.id = ?`,
    [user.area_id]
  )
  return (rows as Array<Record<string, unknown>>).map(mapEmpresa)
}

export async function getEmpresaContext(user: SessionUser): Promise<EmpresaContext> {
  const disponibles = await getEmpresasDisponibles(user)
  const activa = user.empresa_id
    ? disponibles.find((empresa) => empresa.id === user.empresa_id) || null
    : null
  return { activa, disponibles }
}

export async function getEmpresaDisponible(user: SessionUser, empresaId: number): Promise<EmpresaSesion | null> {
  const empresas = await getEmpresasDisponibles(user)
  return empresas.find((empresa) => empresa.id === empresaId) || null
}

async function getDefaultEmpresaId(usuarioId: number): Promise<number | null> {
  const [userRows] = await pool.query(
    `SELECT u.rol, a.empresa_id
     FROM usuarios u
     LEFT JOIN areas a ON a.id = u.area_id
     WHERE u.id = ?`,
    [usuarioId]
  )
  const user = userRows as Array<{ rol: string; empresa_id: number | null }>
  if (user.length === 0) return null

  if (user[0].rol === 'ADMINISTRACION') {
    const [empresaRows] = await pool.query('SELECT id FROM empresa ORDER BY id LIMIT 1')
    const empresas = empresaRows as Array<{ id: number }>
    return empresas.length > 0 ? Number(empresas[0].id) : null
  }

  return user[0].empresa_id == null ? null : Number(user[0].empresa_id)
}

export async function createSession(usuarioId: number): Promise<string> {
  const token = generateToken()
  const expiraEn = new Date()
  expiraEn.setHours(expiraEn.getHours() + SESSION_DURATION_HOURS)
  const empresaId = await getDefaultEmpresaId(usuarioId)

  await pool.query(
    `INSERT INTO sesiones (usuario_id, empresa_id, token, expira_en) VALUES (?, ?, ?, ?)`,
    [usuarioId, empresaId, token, expiraEn]
  )

  return token
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sesiones WHERE token = ?`, [token])
}

export async function cleanExpiredSessions(): Promise<void> {
  await pool.query(`DELETE FROM sesiones WHERE expira_en < NOW()`)
}
