import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2/promise'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { puedeVerGestionLaptops } from '@/lib/permisos'
import { analizarExcelLaptops, type AnalisisLaptops, type FilaLaptop } from '@/lib/laptops/excel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024

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

/**
 * Cuenta los duplicados del Excel sin ocultarlos. Antes la importacion se
 * quedaba con la primera aparicion de cada codigo; ahora se guardan todas y el
 * sistema solo avisa de que existen.
 */
function resumirDuplicados(filas: FilaLaptop[]) {
  const porCodigo = new Map<string, number>()
  const porSerie = new Map<string, number>()
  for (const fila of filas) {
    const codigo = claveTexto(fila.codigo)
    if (codigo) porCodigo.set(codigo, (porCodigo.get(codigo) ?? 0) + 1)
    const serie = claveTexto(fila.numero_serie)
    if (serie) porSerie.set(serie, (porSerie.get(serie) ?? 0) + 1)
  }

  let equipos = 0
  for (const fila of filas) {
    const codigo = claveTexto(fila.codigo)
    const serie = claveTexto(fila.numero_serie)
    if ((porCodigo.get(codigo) ?? 0) > 1 || (serie !== '' && (porSerie.get(serie) ?? 0) > 1)) {
      equipos++
    }
  }

  return {
    codigos: contarGrupos(porCodigo),
    series: contarGrupos(porSerie),
    equipos,
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !puedeVerGestionLaptops(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const formulario = await request.formData().catch(() => null)
    const archivo = formulario?.get('archivo')
    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: 'Adjunta el archivo Excel en el campo "archivo".' }, { status: 400 })
    }
    if (archivo.size === 0) {
      return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 })
    }
    if (archivo.size > MAX_BYTES) {
      return NextResponse.json({ error: 'El archivo supera el máximo de 10 MB.' }, { status: 400 })
    }

    let analisis: AnalisisLaptops
    try {
      const buffer = Buffer.from(await archivo.arrayBuffer())
      analisis = await analizarExcelLaptops(buffer)
    } catch {
      return NextResponse.json(
        { error: 'No se pudo leer el archivo. Verifica que sea un .xlsx válido.' },
        { status: 400 }
      )
    }

    if (analisis.filas.length === 0) {
      return NextResponse.json(
        { error: 'El archivo no contiene filas de inventario reconocibles.' },
        { status: 400 }
      )
    }

    const empresaId = context.activa.id
    const errores: Array<{ hoja: string; fila: number | null; mensaje: string }> = [
      ...analisis.advertencias,
    ]
    const duplicados = resumirDuplicados(analisis.filas)
    const hojas = [...new Set(analisis.filas.map((fila) => fila.origen_hoja).filter(Boolean))]

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      // El Excel es la fuente de verdad de las hojas de inventario: se reemplaza
      // lo que habia en esas hojas y se insertan TODAS las filas, incluso las
      // repetidas. Asi reimportar el mismo archivo no acumula copias.
      let eliminados = 0
      if (hojas.length > 0) {
        const marcadores = hojas.map(() => '?').join(', ')
        const [previos] = await conn.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS total
             FROM inventario_laptops
            WHERE empresa_id = ? AND origen_hoja IN (${marcadores})`,
          [empresaId, ...hojas]
        )
        eliminados = Number((previos[0] as { total: number }).total)

        await conn.query(
          `DELETE FROM inventario_laptops
            WHERE empresa_id = ? AND origen_hoja IN (${marcadores})`,
          [empresaId, ...hojas]
        )
      }

      if (analisis.filas.length > 0) {
        const valores = analisis.filas.map((fila) => [
          empresaId,
          fila.codigo,
          fila.tipo_activo,
          fila.propiedad,
          fila.responsable_actual,
          fila.estado,
          fila.area,
          fila.area_destino,
          fila.procesador,
          fila.marca,
          fila.modelo,
          fila.ram,
          fila.numero_serie,
          fila.disco,
          fila.proveedor,
          fila.observacion,
          fila.origen_hoja,
          fila.origen_seccion,
          fila.origen_fila,
          true,
        ])

        await conn.query(
          `INSERT INTO inventario_laptops
             (empresa_id, codigo, tipo_activo, propiedad, responsable_actual, estado,
              area, area_destino, procesador, marca, modelo, ram, numero_serie,
              disco, proveedor, observacion, origen_hoja, origen_seccion, origen_fila, activo)
           VALUES ?`,
          [valores]
        )
      }

      await conn.commit()

      return NextResponse.json({
        ok: true,
        total: analisis.filas.length,
        creados: analisis.filas.length,
        actualizados: 0,
        eliminados,
        omitidos: 0,
        sin_cambios: 0,
        duplicados,
        almacen_p100: analisis.almacenP100.length,
        errores,
      })
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  } catch (error) {
    console.error('Error en importación de laptops:', error)
    const code = (error as { code?: string }).code
    if (code === 'ER_NO_SUCH_TABLE') {
      return NextResponse.json(
        { error: 'Falta aplicar la migración sql/migraciones/0011_inventario_laptops.sql.' },
        { status: 503 }
      )
    }
    if (code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        {
          error:
            'La base de datos todavía exige códigos únicos. Aplica la migración ' +
            'sql/migraciones/0011_inventario_laptops_duplicados.sql para permitir duplicados.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
