import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { ResultSetHeader } from 'mysql2'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import {
  alcanceExcepciones,
  puedeGestionarExcepciones,
  validarDestinatarioExcepcion,
  validarDatosExcepcion,
  existeDuplicadoExcepcion,
} from '@/lib/excepciones'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !puedeGestionarExcepciones(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { id: idParam } = await params
    const id = Number(idParam)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    }

    const alcance = alcanceExcepciones(user, context.activa.id)
    const [existe] = await pool.query(
      `SELECT e.id FROM excepciones e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       LEFT JOIN areas ar ON ar.id = u.area_id
       WHERE e.id = ? AND (${alcance.sql})`,
      [id, ...alcance.valores],
    )
    if (!(existe as unknown[]).length) {
      return NextResponse.json({ error: 'Excepción no encontrada.' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const validado = await validarDatosExcepcion(body)
    if (!validado.ok) {
      return NextResponse.json({ error: validado.error }, { status: validado.status })
    }
    const destinatario = await validarDestinatarioExcepcion(validado.datos.usuario_id, user, context.activa.id)
    if (destinatario) {
      return NextResponse.json({ error: destinatario.error }, { status: destinatario.status })
    }

    const duplicado = await existeDuplicadoExcepcion(validado.datos, id)
    if (duplicado) {
      return NextResponse.json(
        { error: 'Ya existe una excepción para esa fecha, tipo y colaborador (o general).' },
        { status: 409 }
      )
    }

    const { fecha, tipo, usuario_id, descripcion } = validado.datos
    const [resultado] = await pool.query<ResultSetHeader>(
      `UPDATE excepciones e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       LEFT JOIN areas ar ON ar.id = u.area_id
       SET e.fecha = ?, e.tipo = ?, e.usuario_id = ?, e.descripcion = ?
       WHERE e.id = ? AND (${alcance.sql})`,
      [fecha, tipo, usuario_id, descripcion, id, ...alcance.valores],
    )
    if (!resultado.affectedRows) return NextResponse.json({ error: 'Excepción no encontrada.' }, { status: 404 })

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
    if (!user || !puedeGestionarExcepciones(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { id: idParam } = await params
    const id = Number(idParam)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    }

    const alcance = alcanceExcepciones(user, context.activa.id)
    const [resultado] = await pool.query<ResultSetHeader>(
      `DELETE e FROM excepciones e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       LEFT JOIN areas ar ON ar.id = u.area_id
       WHERE e.id = ? AND (${alcance.sql})`,
      [id, ...alcance.valores],
    )
    if (!resultado.affectedRows) return NextResponse.json({ error: 'Excepción no encontrada.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar excepción:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}