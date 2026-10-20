import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { verificarSetupToken } from '@/lib/setup-token'

export async function POST(request: Request) {
  const sinToken = verificarSetupToken(request)
  if (sinToken) return sinToken

  try {
    const { nombre, descripcion, pais, ciudad } = (await request.json().catch(() => ({}))) as {
      nombre?: unknown
      descripcion?: unknown
      pais?: unknown
      ciudad?: unknown
    }

    const nombreLimpio = String(nombre ?? '').trim()
    const descripcionLimpia = String(descripcion ?? '').trim() || null
    const paisLimpio = String(pais ?? '').trim()
    const ciudadLimpia = String(ciudad ?? '').trim() || null

    if (!nombreLimpio) {
      return NextResponse.json({ error: 'El nombre de la empresa es obligatorio.' }, { status: 400 })
    }
    if (!paisLimpio) {
      return NextResponse.json({ error: 'El país es obligatorio.' }, { status: 400 })
    }

    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      const [existe] = await connection.query('SELECT id FROM empresa LIMIT 1 FOR UPDATE')
      if ((existe as unknown[]).length > 0) {
        await connection.rollback()
        return NextResponse.json({ error: 'La empresa ya está configurada.' }, { status: 400 })
      }

      const [empresaResult] = await connection.query(
        'INSERT INTO empresa (nombre, descripcion, pais, ciudad) VALUES (?, ?, ?, ?)',
        [nombreLimpio, descripcionLimpia, paisLimpio, ciudadLimpia]
      )
      const empresaId = (empresaResult as { insertId: number }).insertId

      await connection.query(
        'INSERT INTO areas (empresa_id, nombre, descripcion) VALUES (?, ?, ?)',
        [empresaId, 'Administración', 'Área principal de la empresa']
      )

      await connection.commit()
      return NextResponse.json({ ok: true, id: empresaId })
    } catch (error) {
      try {
        await connection.rollback()
      } catch {}
      throw error
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('Error al crear empresa:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
