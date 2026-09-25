import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'
import { NOMBRES_DIAS } from '@/lib/dias'
import { horarioValido } from '@/lib/horarios'

async function getContextoActivo(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return { error: 'No autorizado.', status: 401 } as const
  const context = await getEmpresaContext(user)
  if (!context.activa) return { error: 'No hay una empresa activa.', status: 409 } as const
  return { user, empresaId: context.activa.id } as const
}

export async function GET(request: Request) {
  try {
    const context = await getContextoActivo(request)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!esAdmin(context.user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const usuarioId = searchParams.get('usuario_id')
    const params: (string | number)[] = [context.empresaId]
    let query = `SELECT h.id, h.usuario_id, h.dia_semana,
      CAST(h.hora_inicio AS CHAR) AS hora_inicio, CAST(h.hora_fin AS CHAR) AS hora_fin,
      h.created_at, h.updated_at
      FROM horarios h
      INNER JOIN usuarios u ON u.id = h.usuario_id
      INNER JOIN areas ar ON ar.id = u.area_id
      WHERE ar.empresa_id = ?`

    if (usuarioId) {
      const id = Number(usuarioId)
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: 'El parámetro usuario_id no es válido.' }, { status: 400 })
      }
      query += ' AND h.usuario_id = ?'
      params.push(id)
    }
    query += ' ORDER BY h.usuario_id, h.dia_semana'

    const [rows] = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener horarios:', error)
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

    const body = await request.json().catch(() => ({}))
    const usuarioId = Number(body.usuario_id)
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return NextResponse.json({ error: 'El colaborador indicado no es válido.' }, { status: 400 })
    }

    const [existe] = await pool.query(
      `SELECT u.id FROM usuarios u INNER JOIN areas ar ON ar.id = u.area_id
       WHERE u.id = ? AND ar.empresa_id = ? AND u.activo = TRUE`,
      [usuarioId, context.empresaId]
    )
    if ((existe as unknown[]).length === 0) {
      return NextResponse.json({ error: 'El colaborador indicado no pertenece a la empresa activa.' }, { status: 400 })
    }

    const dias = Array.isArray(body.dias) ? body.dias : []
    if (dias.length > 7) {
      return NextResponse.json({ error: 'No se pueden configurar más de 7 días.' }, { status: 400 })
    }

    const diaValido = new Set(NOMBRES_DIAS.map((d) => d.dia_semana))
    const vistos = new Set<number>()
    for (const d of dias as Array<Record<string, unknown>>) {
      const diaSemana = Number(d.dia_semana)
      const horaInicio = String(d.hora_inicio ?? '')
      const horaFin = String(d.hora_fin ?? '')
      if (!diaValido.has(diaSemana)) {
        return NextResponse.json({ error: `Día de la semana inválido: ${diaSemana}.` }, { status: 400 })
      }
      if (vistos.has(diaSemana)) {
        return NextResponse.json({ error: `El día ${diaSemana} está repetido.` }, { status: 400 })
      }
      vistos.add(diaSemana)
      if (!horarioValido(horaInicio, horaFin)) {
        return NextResponse.json(
          { error: 'Los horarios deben usar formato HH:MM y la hora de salida debe ser mayor a la de entrada.' },
          { status: 400 }
        )
      }
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query('DELETE FROM horarios WHERE usuario_id = ?', [usuarioId])
      for (const d of dias as Array<Record<string, unknown>>) {
        await conn.query(
          'INSERT INTO horarios (usuario_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)',
          [usuarioId, Number(d.dia_semana), String(d.hora_inicio), String(d.hora_fin)]
        )
      }
      await conn.commit()
      return NextResponse.json({ ok: true, guardados: dias.length })
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  } catch (error) {
    console.error('Error al guardar horario:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
