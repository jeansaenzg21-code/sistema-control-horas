import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    const [empresas] = await pool.query('SELECT id FROM empresa LIMIT 1')
    const [usuarios] = await pool.query('SELECT id FROM usuarios LIMIT 1')

    const tieneEmpresa = (empresas as unknown[]).length > 0
    const tieneUsuarios = (usuarios as unknown[]).length > 0

    return NextResponse.json({
      necesita_setup: !tieneEmpresa || !tieneUsuarios,
      tiene_empresa: tieneEmpresa,
      tiene_usuarios: tieneUsuarios,
    })
  } catch (error) {
    console.error('Error al verificar setup:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
