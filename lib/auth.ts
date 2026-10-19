import { randomBytes } from 'crypto'
import { RowDataPacket } from 'mysql2'
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

/**
 * Rutas que un SOCIO sí puede usar aunque el método sea de escritura.
 *
 * No son datos del negocio: son las que hacen que la sesión funcione. Sin esto el
 * socio se echaría de la aplicación a las 12 horas por no poder renovar su token,
 * y no podría moverse entre empresas.
 *
 * OJO con `/api/notificaciones`: solo el PUT (marcar leídas) se deja pasar. Su
 * POST CREA notificaciones, y eso es escribir en el sistema. Por eso la
 * excepción nombra el método, no la ruta entera.
 *
 * Todo lo demás que modifique algo queda cerrado. La lista es explícita a
 * propósito: lo que no está aquí, está bloqueado.
 */
const ESCRITURA_PERMITIDA_A_SOLO_LECTURA: { metodo: string; ruta: RegExp }[] = [
  { metodo: 'POST', ruta: /^\/api\/auth\// },
  { metodo: 'DELETE', ruta: /^\/api\/widget\/sync$/ },
  { metodo: 'PUT', ruta: /^\/api\/notificaciones$/ },
]

function rutaPermiteEscrituraAModoLectura(metodo: string, url: string): boolean {
  if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return true
  const ruta = url.split('?')[0]
  return ESCRITURA_PERMITIDA_A_SOLO_LECTURA.some(
    (e) => e.metodo === metodo && e.ruta.test(ruta),
  )
}

/**
 * Comprueba, tras autenticar, si este usuario puede modificar algo.
 *
 * Devuelve `null` cuando puede, y el motivo cuando no. No devuelve un
 * `NextResponse` a propósito: `lib/auth.ts` no depende de `next/server`, y así el
 * mismo dato sirve tanto para responder a la API como paralo que necesite el
 * cliente.
 */
export function motivoEscrituraBloqueada(user: SessionUser | null): string | null {
  if (!user) return null
  if (user.rol === 'SOCIO') {
    return 'Tu perfil es de solo lectura: puedes revisar los datos, pero no modificarlos.'
  }
  return null
}

export async function getUserFromRequest(request: Request): Promise<SessionUser | null> {
  // Dos vias de autenticacion, en este orden:
  //   1. Cabecera Authorization: Bearer. La usa la app movil y cualquier
  //      cliente que no pueda tener cookies.
  //   2. Cookie HttpOnly `pc_token`. La usa la web, que ya no necesita guardar
  //      el token en localStorage: el navegador la envia solo en cada peticion
  //      al mismo origen, tambien al abrir un EventSource.
  // Asi la sesion sobrevive a cerrar y reabrir el navegador, que es justamente
  // de lo que se trata: que el trabajador no escriba su clave cada vez.
  const authHeader = request.headers.get('Authorization')
  let token: string | null = null
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  } else {
    token = leerCookieAcceso(request)
  }
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

  const usuario: SessionUser = {
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

  // El bloqueo va AQUÍ y no en cada ruta: es el único punto por el que pasan las
  // 47 rutas de la API, así que una ruta nueva nace bloqueada. Si se hiciera ruta
  // por ruta, bastaría olvidar una para que el "fantasma" pudiera escribir.
  if (!rutaPermiteEscrituraAModoLectura(request.method, request.url)) {
    if (motivoEscrituraBloqueada(usuario)) return null
  }

  return usuario
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

// El token de acceso es corto a propósito: si se filtra, deja de servir en
//Hours. La permanencia la da el token de renovación, que vive en una cookie
// HttpOnly o en el almacenamiento seguro del móvil y no viaja en las peticiones
// de datos. El efecto para el usuario es el de cualquier app: entra una vez y no
// vuelve a escribir su contraseña mientras el dispositivo siga siendo suyo.
const ACCESS_TOKEN_HOURS = 12
const REFRESH_TOKEN_DAYS = 30
// Ventana de gracia tras rotar el token de renovacion. Sin esto, dos pestanas
// abiertas que renueven en el mismo instante se invalidarian entre ellas y el
// usuario veria un cierre de sesion espurio.
const REFRESH_GRACIA_MINUTES = 5
// Dispersion a la hora de caducidad del token de acceso.
//
// Sin esto, los 200 usuarios que inician sesion a las 8:00 reciben tokens que
// caducan EXACTAMENTE 12 horas despues, tambien a las 20:00. Si esaRenewal fuera
// al fallar, a las 20:00 los 200 intenta renovar en el mismo segundo. Con esta
// dispersion, las caducidades quedan repartidas en una ventana de 20 minutos.
const ACCESS_JITTER_MINUTES = 20
const COOKIE_REFRESH = 'pc_refresh'
const COOKIE_ACCESO = 'pc_token'

export const SESSION_DURATIONS = {
  accessHoras: ACCESS_TOKEN_HOURS,
  refreshDias: REFRESH_TOKEN_DAYS,
  cookie: COOKIE_REFRESH,
}

export interface SesionEmitida {
  token: string
  refreshToken: string
  expiraAcceso: Date
  expiraRenovacion: Date
}

function masHoras(horas: number): Date {
  const d = new Date()
  d.setHours(d.getHours() + horas)
  return d
}

function masDias(dias: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d
}

/**
 * Calcula la caducidad del token de acceso con un Retardo aleatorio por
 * dispositivo. Sirve para que una avalancha de-principio de jornada no se
 * convierta en una avalancha de renovaciones 12 horas despues.
 */
function caducidadTokenAcceso(): Date {
  const d = masHoras(ACCESS_TOKEN_HOURS)
  d.setMinutes(d.getMinutes() + Math.floor(Math.random() * ACCESS_JITTER_MINUTES))
  return d
}

// `sesiones` gana columnas con la migraci�n sql/sesiones_persistentes.sql. Si
// el c�digo se despliega antes de aplicarla, un INSERT con esas columnas
// revienta con "Unknown column" y NING�N usuario podr�a entrar. Para que el
// orden de despliegue no importe, se comprueba una sola vez si las columnas
// existen y, si no, se usa el INSERT de siempre. El sistema funciona con
// sesiones antiguas hasta que se aplique la migraci�n, sin romperse.
let columnasRenovacion: boolean | null = null

async function renovacionDisponible(): Promise<boolean> {
  if (columnasRenovacion !== null) return columnasRenovacion
  try {
    const [filas] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sesiones'
          AND COLUMN_NAME IN ('refresh_token','refresh_expira_en','dispositivo','ultimo_uso')`
    )
    columnasRenovacion = Number(filas[0]?.total ?? 0) === 4
  } catch {
    columnasRenovacion = false
  }
  return columnasRenovacion
}

export async function createSession(usuarioId: number, dispositivo?: string | null): Promise<SesionEmitida> {
  const token = generateToken()
  const refreshToken = generateToken()
  const expiraAcceso = caducidadTokenAcceso()
  const expiraRenovacion = masDias(REFRESH_TOKEN_DAYS)
  const empresaId = await getDefaultEmpresaId(usuarioId)

  if (await renovacionDisponible()) {
    await pool.query(
      `INSERT INTO sesiones
         (usuario_id, empresa_id, token, expira_en, refresh_token, refresh_expira_en, dispositivo, ultimo_uso)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [usuarioId, empresaId, token, expiraAcceso, refreshToken, expiraRenovacion, dispositivo ?? null]
    )
    return { token, refreshToken, expiraAcceso, expiraRenovacion }
  }

  // La migraci�n todav�a no est� aplicada: sesi�n antigua, sin renovaci�n.
  await pool.query(
    `INSERT INTO sesiones (usuario_id, empresa_id, token, expira_en) VALUES (?, ?, ?, ?)`,
    [usuarioId, empresaId, token, expiraAcceso]
  )
  return { token, refreshToken, expiraAcceso, expiraRenovacion }
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sesiones WHERE token = ?`, [token])
}

/**
 * Renueva una sesión sin pedir credenciales.
 *
 * La rotación y el bloqueo van en la MISMA transacción: se bloquea la fila con
 * `FOR UPDATE`, de modo que dos renovaciones simultáneas del mismo token se
 * serializan. La primera rota el token; la segunda, al desbloquear, ya no lo
 * encuentra vigente y usa el token anterior dentro de la ventana de gracia, que
 * sigue siendo válido. Así ninguna de las dos invalida a la otra.
 */
export async function renovarSession(
  refreshToken: string
): Promise<{ token: string; refreshToken: string; expiraAcceso: Date; expiraRenovacion: Date; usuarioId: number } | null> {
  if (!refreshToken || refreshToken.length < 10) return null
  // Sin la migración aplicada no hay token de renovación que renovar. Se
  // responde "no hay sesión" en lugar de reventar con un error de columna.
  if (!(await renovacionDisponible())) return null

  const conexion = await pool.getConnection()
  try {
    await conexion.beginTransaction()

    // `activo` vive en `usuarios`, no en `sesiones`: hay que unir para poder
    // comprobarlo. Sirve para que al desactivar una cuenta su sesion deje de
    // renovarse, en vez de seguir viva hasta el vencimiento.
    const [filas] = await conexion.query<RowDataPacket[]>(
      `SELECT s.id, s.usuario_id, u.activo
         FROM sesiones s
         INNER JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.refresh_token = ?
           OR (s.refresh_anterior = ? AND s.refresh_anterior_expira_en > NOW())
        FOR UPDATE`,
      [refreshToken, refreshToken]
    )

    if (filas.length === 0) {
      await conexion.rollback()
      return null
    }

    const fila = filas[0]
    if (Number(fila.activo) !== 1) {
      await conexion.rollback()
      return null
    }

    const nuevoAcceso = generateToken()
    const nuevoRefresh = generateToken()
    const expiraAcceso = caducidadTokenAcceso()
    // El token de acceso puede renovar aunque la fila haya pasado su expira_en:
    // mientras el de renovación siga vivo, la sesión sigue existiendo. Si no,
    // un usuario que trabaja 12 h seguidas se quedaría fuera.
    const expiraRenovacion = masDias(REFRESH_TOKEN_DAYS)
    const finGracia = new Date()
    finGracia.setMinutes(finGracia.getMinutes() + REFRESH_GRACIA_MINUTES)

    await conexion.query(
      `UPDATE sesiones
          SET token = ?, expira_en = ?,
              refresh_anterior = refresh_token, refresh_anterior_expira_en = ?,
              refresh_token = ?, refresh_expira_en = ?, ultimo_uso = NOW()
        WHERE id = ?`,
      [nuevoAcceso, expiraAcceso, finGracia, nuevoRefresh, expiraRenovacion, fila.id]
    )

    await conexion.commit()
    return { token: nuevoAcceso, refreshToken: nuevoRefresh, expiraAcceso, expiraRenovacion, usuarioId: Number(fila.usuario_id) }
  } catch (error) {
    try {
      await conexion.rollback()
    } catch {}
    throw error
  } finally {
    conexion.release()
  }
}

/** Cierra la sesión de UN dispositivo, sin tocar las de los demás. */
export async function cerrarSesionDispositivo(refreshToken: string): Promise<void> {
  // Sin la migración no hay sesiones revocables por token de renovación.
  if (!(await renovacionDisponible())) return
  await pool.query('DELETE FROM sesiones WHERE refresh_token = ? OR refresh_anterior = ?', [refreshToken, refreshToken])
}

/** Cierra el resto de sesiones del usuario, conservando la actual. */
export async function cerrarRestoDeSesiones(usuarioId: number, refreshTokenActual: string): Promise<number> {
  const [result] = await pool.query(
    `DELETE FROM sesiones
      WHERE usuario_id = ? AND refresh_token <> ? AND refresh_token IS NOT NULL`,
    [usuarioId, refreshTokenActual]
  )
  return (result as { affectedRows: number }).affectedRows
}

/** Lista los dispositivos con sesión abierta del usuario, marcando el actual. */
export async function listarSesiones(usuarioId: number, idSesionActual: number | null) {
  // Sin la migración no hay sesiones por dispositivo que listar.
  if (!(await renovacionDisponible())) return []
  const [filas] = await pool.query<RowDataPacket[]>(
    `SELECT id, dispositivo, ultimo_uso, expira_en, refresh_expira_en, created_at
       FROM sesiones
      WHERE usuario_id = ? AND refresh_token IS NOT NULL
      ORDER BY ultimo_uso DESC, id DESC`,
    [usuarioId]
  )
  return filas.map((f) => ({
    id: Number(f.id),
    dispositivo: f.dispositivo == null ? null : String(f.dispositivo),
    ultimo_uso: f.ultimo_uso,
    expira_en: f.expira_en,
    expira_en_renovacion: f.refresh_expira_en,
    creada_en: f.created_at,
    actual: idSesionActual != null && Number(f.id) === idSesionActual,
  }))
}

/** Id de la sesión a la que pertenece un token de renovación, si sigue viva. */
export async function idSesionPorRefresh(refreshToken: string): Promise<number | null> {
  if (!(await renovacionDisponible())) return null
  const [filas] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM sesiones WHERE (refresh_token = ? OR refresh_anterior = ?) AND refresh_expira_en > NOW() LIMIT 1',
    [refreshToken, refreshToken]
  )
  return filas.length ? Number(filas[0].id) : null
}

function leerCookie(request: Request, nombre: string): string | null {
  const cabecera = request.headers.get('cookie')
  if (!cabecera) return null
  for (const parte of cabecera.split(';')) {
    const [clave, ...resto] = parte.trim().split('=')
    if (clave === nombre) return decodeURIComponent(resto.join('='))
  }
  return null
}

export function leerCookieRefresh(request: Request): string | null {
  return leerCookie(request, COOKIE_REFRESH)
}

export function leerCookieAcceso(request: Request): string | null {
  return leerCookie(request, COOKIE_ACCESO)
}

function construirCookie(nombre: string, valor: string, expira: Date, maxAge: number | null): string {
  const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  // HttpOnly en las dos: el JavaScript de la pagina no puede leer ninguna de las
  // dos credenciales, que es lo que evita que un XSS se lleve la sesion.
  const vida = maxAge == null ? `Expires=${expira.toUTCString()}` : `Max-Age=${maxAge}`
  return `${nombre}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; ${vida}${seguro}`
}

export function cookieRefresh(refreshToken: string, expira: Date): string {
  return construirCookie(COOKIE_REFRESH, refreshToken, expira, null)
}

export function cookieAcceso(token: string, expira: Date): string {
  return construirCookie(COOKIE_ACCESO, token, expira, null)
}

export function cookieVacia(nombre: string): string {
  return construirCookie(nombre, '', new Date(0), 0)
}

export function cookieRefreshVacia(): string {
  return cookieVacia(COOKIE_REFRESH)
}

export function cookieAccesoVacia(): string {
  return cookieVacia(COOKIE_ACCESO)
}

/** Dos cookies en una sola cabecera Set-Cookie. */
export function cookiesSesion(acceso: string, expiraAcceso: Date, refresh: string, expiraRefresh: Date): string[] {
  return [cookieAcceso(acceso, expiraAcceso), cookieRefresh(refresh, expiraRefresh)]
}

export async function cleanExpiredSessions(): Promise<void> {
  // Misma degradacion que `createSession`: si la migracion de sesiones
  // persistentes todavia no esta aplicada, la tabla no tiene esas columnas y
  // esta consulta reventaba con 500 en CADA intento de login, dejando el
  // sistema sin acceso para todo el mundo. Con la comprobacion previa, se usa
  // el criterio antiguo mientras la migracion no exista.
  if (await renovacionDisponible()) {
    await pool.query(
      `DELETE FROM sesiones WHERE expira_en < NOW() AND (refresh_token IS NULL OR refresh_expira_en < NOW())`
    )
    return
  }
  await pool.query(`DELETE FROM sesiones WHERE expira_en < NOW()`)
}
