import { NextResponse } from 'next/server'
import { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'

/**
 * Conteo de registros del dia para la tarjeta de bienvenida.
 *
 * Solo necesita SABER CUANTOS registros hay por estado, no las filas ni las
 * horas. Pedir el historial completo para contarlas en el navegador obligaba a
 * descargar hasta 200 filas (y contar solo esas), y ademas daba un total que no
 * era el del dia. Aqui MySQL hace un COUNT agrupado por estado: una respuesta de
 * unos pocos numeros.
 */
function siguienteDia(fecha: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const d = new Date(`${fecha}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha') ?? ''
    const siguiente = siguienteDia(fecha)
    if (!siguiente) {
      return NextResponse.json({ error: 'La fecha no es válida.' }, { status: 400 })
    }

    // Siempre los registros del propio usuario: es la tarjeta del saludo
    // personal, no la consolidacion del area.
    const [filas] = await pool.query<RowDataPacket[]>(
      `SELECT a.estado, COUNT(*) AS registros
         FROM actividades a
         INNER JOIN usuarios u ON u.id = a.usuario_id
         INNER JOIN areas ar ON ar.id = u.area_id
        WHERE ar.empresa_id = ?
          AND a.usuario_id = ?
          AND a.inicio >= ?
          AND a.inicio < ?
        GROUP BY a.estado`,
      [context.activa.id, user.id, `${fecha} 00:00:00`, `${siguiente} 00:00:00`]
    )

    const porEstado = filas.map((fila) => ({
      estado: String(fila.estado),
      registros: Number(fila.registros),
    }))

    return NextResponse.json({
      fecha,
      total: porEstado.reduce((acc, fila) => acc + fila.registros, 0),
      por_estado: porEstado,
    })
  } catch (error) {
    console.error('Error al resumir las actividades del día:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
