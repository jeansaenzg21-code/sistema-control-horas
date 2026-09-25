import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'
import { esJefeDeArea } from '@/lib/permisos'

async function getContextoActivo(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return { error: 'No autorizado.', status: 401 } as const
  const context = await getEmpresaContext(user)
  if (!context.activa) return { error: 'No hay una empresa activa.', status: 409 } as const
  return { user, empresaId: context.activa.id } as const
}

async function tieneColumnaJefeArea(): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'areas'
       AND COLUMN_NAME = 'jefe_id'`
  )
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0) > 0
}

export async function GET(request: Request) {
  try {
    const context = await getContextoActivo(request)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const areaJefe = esJefeDeArea(context.user) ? context.user.area_id : null
    const filtroArea = areaJefe != null ? ' AND a.id = ?' : ''
    const consultaConJefe = `
      SELECT a.id, a.empresa_id, a.nombre, a.descripcion, a.activo, a.jefe_id,
        jefe.nombre AS jefe_nombre,
        jefe.rol AS jefe_rol,
        (SELECT COUNT(*) FROM usuarios u WHERE u.area_id = a.id AND u.activo = TRUE) AS total_usuarios
      FROM areas a
      LEFT JOIN usuarios jefe ON jefe.id = a.jefe_id AND jefe.area_id = a.id AND jefe.activo = TRUE
      WHERE a.empresa_id = ? AND a.activo = TRUE${filtroArea}
      ORDER BY a.nombre`
    const consultaSinJefe = `
      SELECT a.id, a.empresa_id, a.nombre, a.descripcion, a.activo,
        NULL AS jefe_id, NULL AS jefe_nombre, NULL AS jefe_rol,
        (SELECT COUNT(*) FROM usuarios u WHERE u.area_id = a.id AND u.activo = TRUE) AS total_usuarios
      FROM areas a
      WHERE a.empresa_id = ? AND a.activo = TRUE${filtroArea}
      ORDER BY a.nombre`
    const params: Array<number> = [context.empresaId]
    if (areaJefe != null) params.push(areaJefe)
    const [rows] = await pool.query(
      await tieneColumnaJefeArea() ? consultaConJefe : consultaSinJefe,
      params
    )
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener divisiones:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const context = await getContextoActivo(request)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!esAdmin(context.user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const { nombre, descripcion } = await request.json()
    const nombreLimpio = String(nombre ?? '').trim()
    const descripcionLimpia = String(descripcion ?? '').trim()
    if (!nombreLimpio) {
      return NextResponse.json({ error: 'El nombre de la división es obligatorio.' }, { status: 400 })
    }
    if (nombreLimpio.length > 100) {
      return NextResponse.json({ error: 'El nombre no puede superar 100 caracteres.' }, { status: 400 })
    }

    const [areasExistentes] = await pool.query(
      'SELECT id, activo FROM areas WHERE empresa_id = ? AND nombre = ? LIMIT 1',
      [context.empresaId, nombreLimpio]
    )
    const areaExistente = (areasExistentes as Array<{ id: number; activo: number }>)[0]
    if (areaExistente) {
      if (areaExistente.activo) {
        return NextResponse.json({ error: 'Ya existe una división activa con ese nombre.' }, { status: 409 })
      }
      await pool.query(
        'UPDATE areas SET activo = TRUE, descripcion = COALESCE(?, descripcion) WHERE id = ? AND empresa_id = ?',
        [descripcionLimpia || null, areaExistente.id, context.empresaId]
      )
      return NextResponse.json({ ok: true, id: areaExistente.id, reactivada: true })
    }

    const [result] = await pool.query(
      'INSERT INTO areas (empresa_id, nombre, descripcion) VALUES (?, ?, ?)',
      [context.empresaId, nombreLimpio, descripcionLimpia || null]
    )
    const insertId = (result as { insertId: number }).insertId
    return NextResponse.json({ ok: true, id: insertId })
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Ya existe una división con ese nombre.' }, { status: 409 })
    }
    console.error('Error al crear división:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const context = await getContextoActivo(request)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!esAdmin(context.user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const areaId = Number(body.id)
    if (!Number.isInteger(areaId) || areaId <= 0) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    }

    const [areas] = await pool.query(
      'SELECT id FROM areas WHERE id = ? AND empresa_id = ? AND activo = TRUE LIMIT 1',
      [areaId, context.empresaId]
    )
    if ((areas as unknown[]).length === 0) {
      return NextResponse.json({ error: 'División no encontrada.' }, { status: 404 })
    }

    if (body.jefe_id !== undefined && !(await tieneColumnaJefeArea())) {
      return NextResponse.json(
        { error: 'Falta aplicar la migración de jefe de área. Ejecuta sql/areas_jefe.sql.' },
        { status: 503 }
      )
    }

    const campos: string[] = []
    const valores: unknown[] = []

    if (body.nombre !== undefined) {
      const nombreLimpio = String(body.nombre ?? '').trim()
      if (nombreLimpio) {
        if (nombreLimpio.length > 100) {
          return NextResponse.json({ error: 'El nombre no puede superar 100 caracteres.' }, { status: 400 })
        }
        campos.push('nombre = ?')
        valores.push(nombreLimpio)
      }
    }

    if (body.descripcion !== undefined) {
      campos.push('descripcion = ?')
      valores.push(String(body.descripcion ?? '').trim() || null)
    }

    if (body.jefe_id !== undefined) {
      let jefeId: number | null = null
      if (body.jefe_id !== null && body.jefe_id !== '') {
        jefeId = Number(body.jefe_id)
        if (!Number.isInteger(jefeId) || jefeId <= 0) {
          return NextResponse.json({ error: 'El jefe de la división no es válido.' }, { status: 400 })
        }

        const [candidatos] = await pool.query(
          `SELECT u.id
           FROM usuarios u
           INNER JOIN areas a ON a.id = u.area_id
           WHERE u.id = ?
             AND u.area_id = ?
             AND u.rol = 'JEFE_AREA'
             AND u.activo = TRUE
             AND a.empresa_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM areas otra
               WHERE otra.jefe_id = u.id AND otra.id <> a.id
             )
           LIMIT 1`,
          [jefeId, areaId, context.empresaId]
        )
        if ((candidatos as unknown[]).length === 0) {
          return NextResponse.json(
            { error: 'El jefe debe ser un perfil Jefe de área activo de esta división.' },
            { status: 400 }
          )
        }
      }
      campos.push('jefe_id = ?')
      valores.push(jefeId)
    }

    if (campos.length === 0) {
      return NextResponse.json({ error: 'No hay cambios para guardar.' }, { status: 400 })
    }

    valores.push(areaId, context.empresaId)
    const [result] = await pool.query(
      `UPDATE areas SET ${campos.join(', ')} WHERE id = ? AND empresa_id = ?`,
      valores
    )
    if ((result as { affectedRows: number }).affectedRows === 0) {
      return NextResponse.json({ error: 'División no encontrada.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al actualizar división:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getContextoActivo(request)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!esAdmin(context.user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    }
    const [result] = await pool.query(
      'UPDATE areas SET activo = FALSE WHERE id = ? AND empresa_id = ?',
      [id, context.empresaId]
    )
    if ((result as { affectedRows: number }).affectedRows === 0) {
      return NextResponse.json({ error: 'División no encontrada.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar división:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
