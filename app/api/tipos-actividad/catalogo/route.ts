import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'
import { columnaExiste } from '@/lib/esquema'

/**
 * Resumen del catálogo de actividades por división.
 *
 * Es lo único que permite ver el catálogo desde la aplicación: hasta ahora
 * `tipos_actividad` no se podía ni listar ni editar, y los tipos de una área
 * solo aparecían en el desplegable de "iniciar actividad", ya filtrados por el
 * área del usuario. Sin esto, una importación no tenía forma de verificarse
 * desde la pantalla.
 *
 * Cuenta también las inactivas y las que tienen horas imputadas, que son los
 * dos datos que hacen falta para entender por qué un área no cuadra con el
 * archivo.
 */
export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !esAdmin(user)) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const hayCodigo = await columnaExiste('tipos_actividad', 'codigo')
    const sumaCodigo = hayCodigo ? 'SUM(ta.codigo IS NOT NULL)' : '0'

    const [areasFilas] = await pool.query(
      `SELECT ar.id,
              ar.nombre,
              ar.activo,
              COALESCE(SUM(ta.activo = TRUE), 0) AS activas,
              COALESCE(SUM(ta.activo = FALSE), 0) AS inactivas,
              COALESCE(${sumaCodigo}, 0) AS con_codigo,
              COALESCE(SUM(ta.activo = TRUE), 0) = 0 AS usa_generales,
              COALESCE(SUM(ta.id IS NOT NULL AND ta.id IN (
                SELECT DISTINCT tipo_actividad_id FROM actividades
              )), 0) AS en_uso
         FROM areas ar
         LEFT JOIN tipos_actividad ta ON ta.area_id = ar.id AND ta.es_general = FALSE
        WHERE ar.empresa_id = ?
        GROUP BY ar.id, ar.nombre, ar.activo
        ORDER BY ar.nombre`,
      [context.activa.id]
    )

    const [generalesFilas] = await pool.query(
      'SELECT id, nombre FROM tipos_actividad WHERE es_general = TRUE AND activo = TRUE ORDER BY nombre'
    )

    const [tiposFilas] = await pool.query(
      `SELECT ta.id, ta.area_id, ta.nombre,
              ${hayCodigo ? 'ta.codigo' : 'NULL AS codigo'},
              ta.activo
         FROM tipos_actividad ta
         INNER JOIN areas ar ON ar.id = ta.area_id
        WHERE ar.empresa_id = ? AND ta.es_general = FALSE
        ORDER BY ta.nombre`,
      [context.activa.id]
    )

    const actividadesPorArea = new Map<number, Array<Record<string, unknown>>>()
    for (const tipo of tiposFilas as Array<Record<string, unknown>>) {
      const areaId = Number(tipo.area_id)
      const lista = actividadesPorArea.get(areaId) ?? []
      lista.push({
        id: tipo.id,
        nombre: tipo.nombre,
        codigo: tipo.codigo,
        activo: tipo.activo,
      })
      actividadesPorArea.set(areaId, lista)
    }

    const areas = (areasFilas as Array<Record<string, unknown>>).map((area) => ({
      ...area,
      actividades: actividadesPorArea.get(Number(area.id)) ?? [],
    }))

    return NextResponse.json({
      conCodigo: hayCodigo,
      areas,
      generales: generalesFilas,
    })
  } catch (error) {
    console.error('Error al obtener el catálogo de actividades:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
