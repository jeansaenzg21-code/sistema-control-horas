import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !esAdmin(user)) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { id: idParam } = await params
    const id = Number(idParam)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Actividad no válida.' }, { status: 400 })
    }

    const [filas] = await pool.query(
      `SELECT ta.id, ta.nombre, ta.es_general, ar.empresa_id
         FROM tipos_actividad ta
         LEFT JOIN areas ar ON ar.id = ta.area_id
        WHERE ta.id = ?
        LIMIT 1`,
      [id]
    )
    const tipo = (filas as Array<Record<string, unknown>>)[0]
    if (!tipo) {
      return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
    }
    if (Number(tipo.es_general)) {
      return NextResponse.json(
        { error: 'Las actividades generales no se pueden eliminar.' },
        { status: 400 }
      )
    }
    if (Number(tipo.empresa_id) !== context.activa.id) {
      return NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 })
    }

    const [usoFilas] = await pool.query(
      'SELECT COUNT(*) AS total FROM actividades WHERE tipo_actividad_id = ?',
      [id]
    )
    const enUso = Number((usoFilas as Array<{ total: number | string }>)[0]?.total ?? 0)
    if (enUso > 0) {
      await pool.query('UPDATE tipos_actividad SET activo = FALSE WHERE id = ?', [id])
      return NextResponse.json({ ok: true, desactivada: true, enUso })
    }

    try {
      await pool.query('DELETE FROM tipos_actividad WHERE id = ?', [id])
      return NextResponse.json({ ok: true, eliminada: true })
    } catch (error) {
      const err = error as { code?: string; errno?: number }
      if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
        await pool.query('UPDATE tipos_actividad SET activo = FALSE WHERE id = ?', [id])
        return NextResponse.json({ ok: true, desactivada: true })
      }
      throw error
    }
  } catch (error) {
    console.error('Error al eliminar tipo de actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
