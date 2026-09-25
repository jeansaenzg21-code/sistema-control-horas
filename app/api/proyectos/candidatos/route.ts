import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'
import { esAdministrador, esJefeDeArea } from '@/lib/permisos'
import { getProyectoContexto, proyectosDisponibles } from '@/lib/proyectos'

interface Candidato extends RowDataPacket {
  id: number
  nombre: string
  usuario: string
  rol: string
  area_id: number
  area_nombre: string
  cargo: string | null
  especialidad: string | null
}

interface ClienteCandidato extends RowDataPacket {
  id: number
  nombre: string
}

export async function GET(request: Request) {
  try {
    const context = await getProyectoContexto(request)
    if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
    if (!esAdministrador(context.user) && !esJefeDeArea(context.user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    if (!(await proyectosDisponibles())) {
      return NextResponse.json({ error: 'Falta aplicar la migración de proyectos. Ejecuta sql/proyectos.sql.' }, { status: 503 })
    }

    const [usuarios] = await pool.query<Candidato[]>(
      `SELECT u.id, u.nombre, u.usuario, u.rol, u.area_id,
               ar.nombre AS area_nombre, u.cargo, u.especialidad
       FROM usuarios u
       INNER JOIN areas ar ON ar.id = u.area_id
       WHERE u.activo = TRUE AND ar.empresa_id = ? AND ar.activo = TRUE
       ORDER BY ar.nombre, u.nombre`,
      [context.empresaId]
    )
    const [clientes] = await pool.query<ClienteCandidato[]>(
      `SELECT c.id, c.nombre
       FROM clientes c
       INNER JOIN areas ar ON ar.id = c.area_id
       WHERE c.activo = TRUE AND ar.empresa_id = ?
       ORDER BY c.nombre`,
      [context.empresaId]
    )
    return NextResponse.json({ usuarios, clientes })
  } catch (error) {
    console.error('Error al obtener candidatos de proyecto:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
