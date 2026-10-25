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
  origen_hoja: string | null
  origen_seccion: string | null
  origen_fila: number | null
}

function fechaCorta(valor: string | Date | null): string {
  if (!valor) return ''
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  return String(valor).slice(0, 10)
}

function claveTexto(valor: string | null | undefined): string {
  return String(valor ?? '').trim().toUpperCase()
}

function contarGrupos(conteo: Map<string, number>): number {
  let grupos = 0
  for (const cantidad of conteo.values()) {
    if (cantidad > 1) grupos++
  }
  return grupos
}

function mapFila(
  fila: FilaLaptopDb,
  porCodigo: Map<string, number>,
  porSerie: Map<string, number>,
) {
  const codigo = String(fila.codigo)
  const serie = fila.numero_serie == null ? '' : String(fila.numero_serie)
  const duplicado = (porCodigo.get(claveTexto(codigo)) ?? 0) > 1
  const duplicadoSerie = serie !== '' && (porSerie.get(claveTexto(serie)) ?? 0) > 1

  return {
    id: Number(fila.id),
    codigo,
    tipoActivo: String(fila.tipo_activo ?? 'Laptop'),
    usuario: String(fila.responsable_actual ?? ''),
    estado: String(fila.estado),
    propiedad: String(fila.propiedad),
    area: String(fila.area ?? fila.area_destino ?? ''),
    areaDestino: String(fila.area_destino ?? ''),
    marca: String(fila.marca ?? ''),
    modelo: String(fila.modelo ?? ''),
    procesador: String(fila.procesador ?? ''),
    ram: String(fila.ram ?? ''),
    disco: String(fila.disco ?? ''),
    serie,
    proveedor: String(fila.proveedor ?? ''),
    mantenimiento: fechaCorta(fila.ultimo_mantenimiento),
    observacion: String(fila.observacion ?? ''),
    origenHoja: String(fila.origen_hoja ?? ''),
    origenSeccion: String(fila.origen_seccion ?? ''),
    origenFila: fila.origen_fila == null ? null : Number(fila.origen_fila),
    duplicado,
    duplicadoSerie,
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
              disco, proveedor, observacion, ultimo_mantenimiento,
              origen_hoja, origen_seccion, origen_fila
         FROM inventario_laptops
        WHERE empresa_id = ? AND activo = TRUE
        ORDER BY codigo, id`,
      [context.activa.id]
    )

    // Un mismo codigo o una misma serie pueden aparecer mas de una vez: el
    // Excel real repite LP-091 y hay series compartidas. No se ocultan, se
    // marcan para que el dashboard pueda avisar.
    const porCodigo = new Map<string, number>()
    const porSerie = new Map<string, number>()
    for (const fila of filas) {
      const codigo = claveTexto(fila.codigo)
      if (codigo) porCodigo.set(codigo, (porCodigo.get(codigo) ?? 0) + 1)
      const serie = claveTexto(fila.numero_serie)
      if (serie) porSerie.set(serie, (porSerie.get(serie) ?? 0) + 1)
    }

    const equipos = filas.map((fila) => mapFila(fila, porCodigo, porSerie))
    const duplicados = {
      codigos: contarGrupos(porCodigo),
      series: contarGrupos(porSerie),
      equipos: equipos.filter((equipo) => equipo.duplicado || equipo.duplicadoSerie).length,
    }

    return NextResponse.json({ equipos, duplicados })
  } catch (error) {
    console.error('Error al listar laptops:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
