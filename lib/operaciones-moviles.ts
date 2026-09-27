import pool from '@/lib/db'
import { RowDataPacket } from 'mysql2'

// La app móvil registra actividades sin conexión y las envía después. Para que
// las horas reflejen el momento real del registro y para que un reintento no
// duplique filas, el servidor acepta la hora del cliente y un identificador de
// operación. Ambas cosas son opcionales: sin la migración aplicada, el
// comportamiento actual del sistema web no cambia.

const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000
const ANTIGUEDAD_MAXIMA_DIAS = 30

let columnaDisponible: boolean | null = null

export async function columnaIdOperacionDisponible(): Promise<boolean> {
  if (columnaDisponible !== null) return columnaDisponible
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'actividades'
         AND COLUMN_NAME = 'id_operacion'`
    )
    columnaDisponible = Number(rows[0]?.total ?? 0) > 0
  } catch {
    columnaDisponible = false
  }
  return columnaDisponible
}

export function normalizarIdOperacion(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  if (limpio.length === 0 || limpio.length > 64) return null
  return limpio
}

export type ResultadoMarcaTiempo =
  | { ok: true; fecha: Date }
  | { ok: false; error: string }

// Valida una hora enviada por el cliente. Se usa NOW() del servidor cuando el
// cliente no envía nada, de modo que el sistema web sigue siendo la referencia.
export function validarMarcaTiempoCliente(valor: unknown, etiqueta: string): ResultadoMarcaTiempo | null {
  if (valor == null || valor === '') return null
  if (typeof valor !== 'string') {
    return { ok: false, error: `La ${etiqueta} no es válida.` }
  }

  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) {
    return { ok: false, error: `La ${etiqueta} no es válida.` }
  }
  if (fecha.getTime() > Date.now() + TOLERANCIA_FUTURO_MS) {
    return { ok: false, error: `La ${etiqueta} no puede estar en el futuro.` }
  }
  const antiguedad = Date.now() - fecha.getTime()
  if (antiguedad > ANTIGUEDAD_MAXIMA_DIAS * 24 * 60 * 60 * 1000) {
    return {
      ok: false,
      error: `La ${etiqueta} supera los ${ANTIGUEDAD_MAXIMA_DIAS} días permitidos para registrar una actividad.`,
    }
  }
  return { ok: true, fecha }
}

export async function buscarPorIdOperacion(idOperacion: string, empresaId: number): Promise<Record<string, unknown> | null> {
  if (!(await columnaIdOperacionDisponible())) return null
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
            a.proyecto_id, pr.nombre AS proyecto_nombre, a.inicio, a.fin, a.estado, a.created_at,
            u.nombre AS usuario_nombre, u.cargo,
            ta.nombre AS tipo_actividad_nombre,
            ar.nombre AS area_nombre,
            c.nombre AS cliente_nombre
     FROM actividades a
     INNER JOIN usuarios u ON u.id = a.usuario_id
     INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
     INNER JOIN areas ar ON ar.id = u.area_id
     LEFT JOIN proyectos pr ON pr.id = a.proyecto_id AND pr.empresa_id = ar.empresa_id
     LEFT JOIN clientes c ON c.id = a.cliente_id
     WHERE a.id_operacion = ? AND ar.empresa_id = ?
     LIMIT 1`,
    [idOperacion, empresaId]
  )
  return (rows as Array<Record<string, unknown>>)[0] ?? null
}
