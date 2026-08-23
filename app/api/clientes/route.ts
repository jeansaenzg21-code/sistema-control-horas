import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth'

async function requireAdmin(request: Request) {
  const usuario = await getUserFromRequest(request)
  return usuario?.rol === 'ADMINISTRACION' ? usuario : null
}

async function requireUser(request: Request) {
  return getUserFromRequest(request)
}

export async function GET(request: Request) {
  try {
    const usuario = await requireUser(request)
    if (!usuario) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    const { searchParams } = new URL(request.url)
    const areaId = searchParams.get('area_id')

    let query = `SELECT c.id, c.nombre, c.ruc, c.correo, c.telefono, c.direccion,
       c.area_id, c.horas_contratadas,
       COALESCE((SELECT SUM(GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, a.fin) -
         COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, a.fin)))
           FROM pausas p WHERE p.actividad_id = a.id), 0)))
         FROM actividades a WHERE a.cliente_id = c.id AND a.fin IS NOT NULL
           AND a.estado IN ('PENDIENTE_APROBACION', 'APROBADA')), 0) / 3600 AS horas_consumidas,
       c.activo, c.created_at,
      a.nombre AS area_nombre
      FROM clientes c
      INNER JOIN areas a ON a.id = c.area_id
      WHERE c.activo = TRUE`
    const params: (string | number)[] = []

    if (areaId) {
      query += ' AND c.area_id = ?'
      params.push(areaId)
    }

    query += ' ORDER BY c.nombre'

    const [rows] = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener clientes:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const usuario = await requireAdmin(request)
    if (!usuario) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    const { nombre, ruc, correo, telefono, direccion, area_id, horas_contratadas } = await request.json()

    if (!nombre?.trim()) {
      return NextResponse.json({ error: 'El nombre del cliente es obligatorio.' }, { status: 400 })
    }
    if (!area_id) {
      return NextResponse.json({ error: 'El área es obligatoria.' }, { status: 400 })
    }

    const [result] = await pool.query(
      `INSERT INTO clientes (nombre, ruc, correo, telefono, direccion, area_id, horas_contratadas)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre.trim(),
        ruc?.trim() || null,
        correo?.trim() || null,
        telefono?.trim() || null,
        direccion?.trim() || null,
        area_id,
        horas_contratadas || 0,
      ]
    )

    const insertId = (result as { insertId: number }).insertId
    return NextResponse.json({ ok: true, id: insertId })
  } catch (error) {
    console.error('Error al crear cliente:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const usuario = await requireAdmin(request)
    if (!usuario) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    const { id, nombre, ruc, correo, telefono, direccion, area_id, horas_contratadas } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    }

    await pool.query(
      `UPDATE clientes SET
        nombre = COALESCE(?, nombre),
        ruc = COALESCE(?, ruc),
        correo = COALESCE(?, correo),
        telefono = COALESCE(?, telefono),
        direccion = COALESCE(?, direccion),
        area_id = COALESCE(?, area_id),
        horas_contratadas = COALESCE(?, horas_contratadas)
       WHERE id = ?`,
      [nombre?.trim() || null, ruc?.trim() || null, correo?.trim() || null, telefono?.trim() || null, direccion?.trim() || null, area_id || null, horas_contratadas ?? null, id]
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al actualizar cliente:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const usuario = await requireAdmin(request)
    if (!usuario) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    }

    await pool.query('UPDATE clientes SET activo = FALSE WHERE id = ?', [id])
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar cliente:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
