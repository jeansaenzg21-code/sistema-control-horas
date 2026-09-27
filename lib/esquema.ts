import pool from './db'
import { RowDataPacket } from 'mysql2/promise'

/**
 * Estado del esquema, cacheado en memoria y con caducidad corta.
 *
 * El problema que resuelve: varias rutas necesitan saber si una columna o tabla
 * existe (por ejemplo `actividades.proyecto_id` o `actividades.id_operacion`).
 * Consultar `information_schema` en cada peticion costaba unas 8 consultas de
 * metadatos por `GET /api/actividades`, y con 200 usuariosEso es carga
 * completamente evitable.
 *
 * Por que NO se cachea para siempre: si alguien aplica una migracion, el
 * proceso seguiria creyendo que la columna no existe y la funcion seguiria
 * degradando al camino viejo, sin error visible, hasta que reinicie el
 * servidor. Con una caducidad de 30 segundos, una migracion se detecta sola en
 * menos de medio minuto y no hace falta reiniciar nada.
 *
 * Por que NO se usa un error silenciado: si la consulta a `information_schema`
 * falla de verdad (permisos, base no disponible), se marca como "no disponible"
 * solo durante esa misma ventana y se registra en la consola. No se oculta nada:
 * el fallo aparece en el log.
 */
const TTL_MS = 30_000

type Clave = string

type Entrada = {
  total: number
  expiraEn: number
}

// Se guarda en `globalThis` para sobreviver al hot reload de Next en desarrollo,
// igual que hace lib/events.ts con sus listeners.
const almacen = (globalThis as unknown as { __pcEsquema?: Map<Clave, Entrada> }).__pcEsquema
  ?? new Map<Clave, Entrada>()
;(globalThis as unknown as { __pcEsquema?: Map<Clave, Entrada> }).__pcEsquema = almacen

export async function columnaExiste(tabla: string, columna: string): Promise<boolean> {
  return (
    (await contar('COLUMNS', 'TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [tabla, columna])) > 0
  )
}

export async function tablaExiste(tabla: string): Promise<boolean> {
  return (await contar('TABLES', 'TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [tabla])) > 0
}

/** Todas las columnas indicadas existen a la vez. Una sola consulta. */
export async function columnasExisten(tabla: string, columnas: string[]): Promise<boolean> {
  if (columnas.length === 0) return true
  const marcadores = columnas.map(() => '?').join(', ')
  return (
    (await contar(
      'COLUMNS',
      `TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (${marcadores})`,
      [tabla, ...columnas]
    )) === columnas.length
  )
}

async function contar(tipo: 'COLUMNS' | 'TABLES', where: string, params: (string | number)[]): Promise<number> {
  const clave = `${tipo}:${where}:${JSON.stringify(params)}`
  const ahora = Date.now()
  const previa = almacen.get(clave)
  if (previa && previa.expiraEn > ahora) return previa.total

  try {
    const [filas] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM information_schema.${tipo} WHERE ${where}`,
      params
    )
    const total = Number(filas[0]?.total ?? 0)
    almacen.set(clave, { total, expiraEn: ahora + TTL_MS })
    return total
  } catch (error) {
    // No se oculta: se registra y se devuelve 0, que es el camino conservador
    // (funcionalidad completa, sin la mejora opcional). No se cachea un fallo,
    // para que un error transitorio no se convierta en 30 s de malfuncion.
    console.error(`[esquema] No se pudo comprobar ${tipo} (${where}):`, error)
    return 0
  }
}

/** Descarta la cache. Se usa tras aplicar una migracion desde la propia app. */
export function invalidarEsquema(): void {
  almacen.clear()
}
