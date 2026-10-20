import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    await pool.query('SELECT 1')
    return NextResponse.json({ ok: true, baseDeDatos: 'conectada' })
  } catch {
    return NextResponse.json({ ok: false, baseDeDatos: 'sin conexion' }, { status: 503 })
  }
}