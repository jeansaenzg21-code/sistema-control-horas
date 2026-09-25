import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import {
  TIPOS_EXCEPCION,
  esAdmin,
  validarDatosExcepcion,
  existeDuplicadoExcepcion,
} from '@/lib/excepciones'

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !esAdmin(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const { searchParams } = new URL(request.url)
    const anio = searchParams.get('anio')
    const mes = searchParams.get('mes')
    const usuarioId = searchParams.get('usuario_id')
    const tipo = searchParams.get('tipo')

    let query = `SELECT e.id, DATE_FORMAT(e.fecha, '%Y-%m-%d') AS fecha, e.tipo, e.usuario_id,
      e.descripcion, e.created_at, e.updated_at,
      u.nombre AS usuario_nombre,
      CASE WHEN e.usuario_id IS NULL THEN 'todos' ELSE 'colaborador' END AS ambito
      FROM excepciones e
      LEFT JOIN usuarios u ON u.id = e.usuario_id
      LEFT JOIN areas ar ON ar.id = u.area_id
      WHERE (e.usuario_id IS NULL OR ar.empresa_id = ?)`
    const params: (string | number)[] = [context.activa.id]

    if (anio) {
      query += ' AND YEAR(e.fecha) = ?'
      params.push(Number(anio))
    }
    if (mes) {
      if (!anio) {
        return NextResponse.json({ error: 'El filtro mes requiere también el año.' }, { status: 400 })
      }
      query += ' AND MONTH(e.fecha) = ?'
      params.push(Number(mes))
    }
    if (usuarioId) {
      query += ' AND e.usuario_id = ?'
      params.push(Number(usuarioId))
    }
    if (tipo) {
      if (!TIPOS_EXCEPCION.includes(tipo as (typeof TIPOS_EXCEPCION)[number])) {
        return NextResponse.json({ error: 'El filtro tipo debe ser FERIADO o VACACIONES.' }, { status: 400 })
      }
      query += ' AND e.tipo = ?'
      params.push(tipo)
    }

    query += ' ORDER BY e.fecha DESC, e.tipo, u.nombre'

    const [rows] = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener excepciones:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !esAdmin(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

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

    const duplicado = await existeDuplicadoExcepcion(validado.datos)
    if (duplicado) {
      return NextResponse.json(
        { error: 'Ya existe una excepción para esa fecha, tipo y colaborador (o general).' },
        { status: 409 }
      )
    }

    const [result] = await pool.query(
      `INSERT INTO excepciones (fecha, tipo, usuario_id, descripcion)
       VALUES (?, ?, ?, ?)`,
      [validado.datos.fecha, validado.datos.tipo, validado.datos.usuario_id, validado.datos.descripcion]
    )
    const insertId = (result as { insertId: number }).insertId

    return NextResponse.json({ ok: true, id: insertId })
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'Ya existe una excepción para esa fecha, tipo y colaborador (o general).' },
        { status: 409 }
      )
    }
    console.error('Error al crear excepción:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}