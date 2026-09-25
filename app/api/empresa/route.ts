import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const context = await getEmpresaContext(user)
    if (new URL(request.url).searchParams.get('todas') === '1') {
      if (!esAdmin(user) && context.disponibles.length === 0) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
      }
      return NextResponse.json(context.disponibles)
    }

    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }
    return NextResponse.json(context.activa)
  } catch (error) {
    console.error('Error al obtener empresa:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user || !esAdmin(user)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const nombre = String(body.nombre ?? '').trim()
  const descripcion = String(body.descripcion ?? '').trim()
  const pais = String(body.pais ?? '').trim() || 'Perú'
  const ciudad = String(body.ciudad ?? '').trim()

  if (!nombre) {
    return NextResponse.json({ error: 'El nombre de la empresa es obligatorio.' }, { status: 400 })
  }
  if (nombre.length > 255) {
    return NextResponse.json({ error: 'El nombre no puede superar 255 caracteres.' }, { status: 400 })
  }
  if (pais.length > 100) {
    return NextResponse.json({ error: 'El país no puede superar 100 caracteres.' }, { status: 400 })
  }
  if (ciudad.length > 100) {
    return NextResponse.json({ error: 'La ciudad no puede superar 100 caracteres.' }, { status: 400 })
  }

  const [existentes] = await pool.query(
    'SELECT id FROM empresa WHERE LOWER(nombre) = LOWER(?) LIMIT 1',
    [nombre]
  )
  if ((existentes as unknown[]).length > 0) {
    return NextResponse.json({ error: 'Ya existe una empresa con ese nombre.' }, { status: 409 })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [empresaResult] = await connection.query(
      'INSERT INTO empresa (nombre, descripcion, pais, ciudad) VALUES (?, ?, ?, ?)',
      [nombre, descripcion || null, pais, ciudad || null]
    )
    const empresaId = (empresaResult as { insertId: number }).insertId

    const [areaResult] = await connection.query(
      'INSERT INTO areas (empresa_id, nombre, descripcion) VALUES (?, ?, ?)',
      [empresaId, 'General', 'División inicial para la empresa.']
    )
    const areaId = (areaResult as { insertId: number }).insertId

    await connection.commit()

    const [rows] = await pool.query(
      'SELECT id, nombre, descripcion, pais, ciudad, logo FROM empresa WHERE id = ?',
      [empresaId]
    )
    const empresa = (rows as Array<Record<string, unknown>>)[0]
    return NextResponse.json(
      {
        empresa,
        area: { id: areaId, empresa_id: empresaId, nombre: 'General' },
      },
      { status: 201 }
    )
  } catch (error) {
    await connection.rollback()
    console.error('Error al crear empresa:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  } finally {
    connection.release()
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !esAdmin(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const { nombre, descripcion, pais, ciudad } = await request.json()
    await pool.query(
      'UPDATE empresa SET nombre = ?, descripcion = ?, pais = ?, ciudad = ? WHERE id = ?',
      [nombre, descripcion, pais, ciudad, context.activa.id]
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al actualizar empresa:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
