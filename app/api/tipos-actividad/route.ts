import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'
import { esJefeDeArea, esPersonal } from '@/lib/permisos'
import { columnaExiste } from '@/lib/esquema'
import { claveTexto } from '@/lib/actividades/catalogo-excel'

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { searchParams } = new URL(request.url)
    const areaParam = searchParams.get('area_id')
    const areaJefe = esJefeDeArea(user) ? user.area_id : null
    let areaId = areaJefe
    if (areaId == null && esPersonal(user)) areaId = user.area_id
    if (areaId == null && areaParam) {
      const parsedAreaId = Number(areaParam)
      if (!Number.isInteger(parsedAreaId) || parsedAreaId <= 0) {
        return NextResponse.json({ error: 'La división indicada no es válida.' }, { status: 400 })
      }
      areaId = parsedAreaId
    }

    const params: (string | number)[] = [context.activa.id]
    // `codigo` llegó después de crear el catálogo por área. Se consulta solo si
    // la columna existe, para que una instalación que no haya aplicado
    // sql/actividades_codigo.sql siga funcionando sin dar error.
    const hayCodigo = await columnaExiste('tipos_actividad', 'codigo')
    const columnas = hayCodigo
      ? 'ta.id, ta.area_id, ta.nombre, ta.codigo, ta.activo, ta.es_general'
      : 'ta.id, ta.area_id, ta.nombre, ta.activo, ta.es_general'
    let query = `SELECT ${columnas}
      FROM tipos_actividad ta
      LEFT JOIN areas ar ON ar.id = ta.area_id
      WHERE ta.activo = TRUE
        AND (ta.es_general = TRUE OR ar.empresa_id = ?)`
    if (areaId != null) {
      // Un área con catálogo propio ve SOLO ese catálogo. Las cinco generales
      // son el respaldo de las áreas que no tienen una lista propia, no un
      // añadido a las que sí: mezcladas con 30 actividades específicas solo
      // sirven para que alguien imputa sus horas a "Revisión, Informes y
      // Cierre" cuando en realidad estaba haciendo otra cosa.
      query += ` AND (
        ta.area_id = ?
        OR (ta.es_general = TRUE AND NOT EXISTS (
              SELECT 1 FROM tipos_actividad propio
               WHERE propio.area_id = ? AND propio.activo = TRUE AND propio.es_general = FALSE))
      )`
      params.push(areaId, areaId)
    }
    // Por código, que es como el personal nombra estas actividades en sus
    // papeles. Las generales no tienen código y quedan al final.
    query += ' ORDER BY ta.es_general DESC, ta.codigo IS NULL, ta.codigo, ta.nombre'

    const [rows] = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener tipos de actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !esAdmin(user)) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const body = (await request.json().catch(() => ({}))) as {
      area_id?: unknown
      nombre?: unknown
      codigo?: unknown
    }
    const areaId = Number(body.area_id)
    if (!Number.isInteger(areaId) || areaId <= 0) {
      return NextResponse.json({ error: 'Selecciona una división.' }, { status: 400 })
    }

    const nombre = String(body.nombre ?? '').trim()
    if (!nombre) {
      return NextResponse.json({ error: 'El nombre de la actividad es obligatorio.' }, { status: 400 })
    }
    if (nombre.length > 255) {
      return NextResponse.json({ error: 'El nombre no puede superar 255 caracteres.' }, { status: 400 })
    }

    const codigo = String(body.codigo ?? '').trim().toUpperCase().slice(0, 32) || null

    const [areas] = await pool.query(
      'SELECT id FROM areas WHERE id = ? AND empresa_id = ? LIMIT 1',
      [areaId, context.activa.id]
    )
    if ((areas as unknown[]).length === 0) {
      return NextResponse.json({ error: 'División no encontrada.' }, { status: 404 })
    }

    const hayCodigo = await columnaExiste('tipos_actividad', 'codigo')
    if (codigo && !hayCodigo) {
      return NextResponse.json(
        { error: 'Falta preparar la base de datos. Ejecuta sql/actividades_codigo.sql.' },
        { status: 503 }
      )
    }

    const [tipos] = await pool.query(
      `SELECT id, nombre, ${hayCodigo ? 'codigo' : 'NULL AS codigo'}, activo
         FROM tipos_actividad
        WHERE area_id = ? AND es_general = FALSE`,
      [areaId]
    )
    const existentes = tipos as Array<{
      id: number
      nombre: string
      codigo: string | null
      activo: number
    }>

    const porNombre = new Map<string, (typeof existentes)[number]>()
    const porCodigo = new Map<string, (typeof existentes)[number]>()
    for (const tipo of existentes) {
      porNombre.set(claveTexto(tipo.nombre), tipo)
      if (tipo.codigo) porCodigo.set(claveTexto(tipo.codigo), tipo)
    }

    const porNombreMatch = porNombre.get(claveTexto(nombre))
    const porCodigoMatch = codigo ? porCodigo.get(claveTexto(codigo)) : undefined
    if (porNombreMatch && porCodigoMatch && porNombreMatch.id !== porCodigoMatch.id) {
      return NextResponse.json(
        { error: 'El nombre y el código pertenecen a actividades distintas.' },
        { status: 409 }
      )
    }

    const existente = porCodigoMatch ?? porNombreMatch

    if (existente) {
      if (existente.activo) {
        return NextResponse.json(
          { error: 'Ya existe una actividad con ese nombre o código en la división.' },
          { status: 409 }
        )
      }
      if (hayCodigo) {
        await pool.query(
          'UPDATE tipos_actividad SET nombre = ?, codigo = ?, activo = TRUE, es_general = FALSE WHERE id = ?',
          [nombre, codigo, existente.id]
        )
      } else {
        await pool.query(
          'UPDATE tipos_actividad SET nombre = ?, activo = TRUE, es_general = FALSE WHERE id = ?',
          [nombre, existente.id]
        )
      }
      return NextResponse.json({ ok: true, id: existente.id, reactivada: true })
    }

    const [resultado] = hayCodigo
      ? await pool.query(
          'INSERT INTO tipos_actividad (nombre, codigo, area_id, es_general, activo) VALUES (?, ?, ?, FALSE, TRUE)',
          [nombre, codigo, areaId]
        )
      : await pool.query(
          'INSERT INTO tipos_actividad (nombre, area_id, es_general, activo) VALUES (?, ?, FALSE, TRUE)',
          [nombre, areaId]
        )

    return NextResponse.json({
      ok: true,
      id: Number((resultado as { insertId: number }).insertId),
    })
  } catch (error) {
    console.error('Error al crear tipo de actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
