import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2/promise'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { puedeVerGestionLaptops } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

interface FilaLaptopDb extends RowDataPacket {
  id: number
  codigo: string
  tipo_activo: string
  propiedad: string
  responsable_actual: string | null
  estado: string
  area: string | null
  area_destino: string | null
  procesador: string | null
  marca: string | null
  modelo: string | null
  ram: string | null
  numero_serie: string | null
  disco: string | null
  proveedor: string | null
  observacion: string | null
  ultimo_mantenimiento: string | Date | null
}

function fechaCorta(valor: string | Date | null): string {
  if (!valor) return ''
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  return String(valor).slice(0, 10)
}

function mapFila(fila: FilaLaptopDb) {
  return {
    codigo: String(fila.codigo),
    usuario: String(fila.responsable_actual ?? ''),
    estado: String(fila.estado),
    propiedad: String(fila.propiedad),
    area: String(fila.area ?? fila.area_destino ?? ''),
    marca: String(fila.marca ?? ''),
    modelo: String(fila.modelo ?? ''),
    procesador: String(fila.procesador ?? ''),
    ram: String(fila.ram ?? ''),
    disco: String(fila.disco ?? ''),
    serie: String(fila.numero_serie ?? ''),
    mantenimiento: fechaCorta(fila.ultimo_mantenimiento),
    observacion: String(fila.observacion ?? ''),
  }
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !puedeVerGestionLaptops(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const [filas] = await pool.query<FilaLaptopDb[]>(
      `SELECT id, codigo, tipo_activo, propiedad, responsable_actual, estado,
              area, area_destino, procesador, marca, modelo, ram, numero_serie,
              disco, proveedor, observacion, ultimo_mantenimiento
         FROM inventario_laptops
        WHERE empresa_id = ? AND activo = TRUE
        ORDER BY codigo`,
      [context.activa.id]
    )

    return NextResponse.json({ equipos: filas.map(mapFila) })
  } catch (error) {
    console.error('Error al listar laptops:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
