import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import {
  esAdmin,
  validarDatosExcepcion,
  existeDuplicadoExcepcion,
} from '@/lib/excepciones'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !esAdmin(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { id: idParam } = await params
    const id = Number(idParam)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    }

    const [existe] = await pool.query(
      `SELECT e.id FROM excepciones e
       LEFT JOIN usuarios eu ON eu.id = e.usuario_id
       LEFT JOIN areas ea ON ea.id = eu.area_id
       WHERE e.id = ? AND (e.usuario_id IS NULL OR ea.empresa_id = ?)`,
      [id, context.activa.id]
    )
    if ((existe as Array<Record<string, unknown>>).length === 0) {
      return NextResponse.json({ error: 'Excepción no encontrada.' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const validado = await validarDatosExcepcion(body)
    if (!validado.ok) {
      return NextResponse.json({ error: validado.error }, { status: validado.status })
    }
    if (validado.datos.usuario_id) {
      const [usuarios] = await pool.query(
        `SELECT u.id FROM usuarios u INNER JOIN areas ar ON ar.id = u.area_id
         WHERE u.id = ? AND ar.empresa_id = ? AND u.activo = TRUE`,
        [validado.datos.usuario_id, context.activa.id]
      )
      if ((usuarios as unknown[]).length === 0) {
        return NextResponse.json({ error: 'El colaborador no pertenece a la empresa activa.' }, { status: 400 })
      }
    }

    const duplicado = await existeDuplicadoExcepcion(validado.datos, id)
    if (duplicado) {
      return NextResponse.json(
        { error: 'Ya existe una excepción para esa fecha, tipo y colaborador (o general).' },
        { status: 409 }
      )
    }

    await pool.query(
      `UPDATE excepciones
       SET fecha = ?, tipo = ?, usuario_id = ?, descripcion = ?
       WHERE id = ?`,
      [validado.datos.fecha, validado.datos.tipo, validado.datos.usuario_id, validado.datos.descripcion, id]
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'Ya existe una excepción para esa fecha, tipo y colaborador (o general).' },
        { status: 409 }
      )
    }
    console.error('Error al actualizar excepción:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !esAdmin(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { id: idParam } = await params
    const id = Number(idParam)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    }

    const [existe] = await pool.query(
      `SELECT e.id FROM excepciones e
       LEFT JOIN usuarios eu ON eu.id = e.usuario_id
       LEFT JOIN areas ea ON ea.id = eu.area_id
       WHERE e.id = ? AND (e.usuario_id IS NULL OR ea.empresa_id = ?)`,
      [id, context.activa.id]
    )
    if ((existe as Array<Record<string, unknown>>).length === 0) {
      return NextResponse.json({ error: 'Excepción no encontrada.' }, { status: 404 })
    }

    await pool.query('DELETE FROM excepciones WHERE id = ?', [id])
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar excepción:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}