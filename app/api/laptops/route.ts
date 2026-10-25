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

const CAMPOS = [
  ['codigo', 'codigo'], ['tipoActivo', 'tipo_activo'], ['propiedad', 'propiedad'],
  ['usuario', 'responsable_actual'], ['estado', 'estado'], ['area', 'area'],
  ['areaDestino', 'area_destino'], ['procesador', 'procesador'], ['marca', 'marca'],
  ['modelo', 'modelo'], ['ram', 'ram'], ['serie', 'numero_serie'], ['disco', 'disco'],
  ['proveedor', 'proveedor'], ['observacion', 'observacion'],
  ['mantenimiento', 'ultimo_mantenimiento'],
] as const

function datosEquipo(body: Record<string, unknown>) {
  const datos: Record<string, string | null> = {}
  for (const [cliente, columna] of CAMPOS) {
    const value = body[cliente]
    datos[columna] = value == null || String(value).trim() === '' ? null : String(value).trim()
  }
  return datos
}

async function autorizarEscritura(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user || !puedeVerGestionLaptops(user)) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }) }
  const context = await getEmpresaContext(user)
  if (!context.activa) return { error: NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 }) }
  return { user, empresaId: context.activa.id }
}

export async function POST(request: Request) {
  try {
    const auth = await autorizarEscritura(request)
    if ('error' in auth) return auth.error
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
    const datos = datosEquipo(body)
    if (!datos.codigo || !datos.numero_serie || !datos.marca) {
      return NextResponse.json({ error: 'Código, serie y marca son obligatorios.' }, { status: 400 })
    }
    const columnas = Object.keys(datos)
    const [result] = await pool.query(
      `INSERT INTO inventario_laptops (empresa_id, ${columnas.join(', ')}, activo) VALUES (?, ${columnas.map(() => '?').join(', ')}, TRUE)`,
      [auth.empresaId, ...Object.values(datos)]
    )
    return NextResponse.json({ ok: true, id: Number((result as { insertId: number }).insertId) }, { status: 201 })
  } catch (error) {
    console.error('Error al crear laptop:', error)
    return NextResponse.json({ error: 'No se pudo crear el equipo.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await autorizarEscritura(request)
    if ('error' in auth) return auth.error
    const body = await request.json().catch(() => null) as (Record<string, unknown> & { id?: unknown }) | null
    const id = Number(body?.id)
    if (!body || !Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Equipo inválido.' }, { status: 400 })
    const datos = datosEquipo(body)
    if (!datos.codigo || !datos.numero_serie || !datos.marca) {
      return NextResponse.json({ error: 'Código, serie y marca son obligatorios.' }, { status: 400 })
    }
    const columnas = Object.keys(datos)
    const [result] = await pool.query(
      `UPDATE inventario_laptops SET ${columnas.map((columna) => `${columna} = ?`).join(', ')} WHERE id = ? AND empresa_id = ? AND activo = TRUE`,
      [...Object.values(datos), id, auth.empresaId]
    )
    if ((result as { affectedRows: number }).affectedRows === 0) {
      const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM inventario_laptops WHERE id = ? AND empresa_id = ? AND activo = TRUE', [id, auth.empresaId])
      if (!rows.length) return NextResponse.json({ error: 'No se encontró el equipo.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al guardar laptop:', error)
    return NextResponse.json({ error: 'No se pudieron guardar los cambios.' }, { status: 500 })
  }
}
