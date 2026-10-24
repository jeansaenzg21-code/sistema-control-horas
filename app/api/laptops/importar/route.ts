import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { puedeVerGestionLaptops } from '@/lib/permisos'
import { analizarExcelLaptops, type AnalisisLaptops, type FilaLaptop } from '@/lib/laptops/excel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024

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

    // El Excel repite LP-091 (asignada y disponible). Se conserva la primera
    // aparición y se reporta la segunda: el código es la clave del inventario.
    const vistos = new Map<string, FilaLaptop>()
    const filasUnicas: FilaLaptop[] = []
    for (const fila of analisis.filas) {
      const clave = fila.codigo.trim().toUpperCase()
      const previa = vistos.get(clave)
      if (previa) {
        errores.push({
          hoja: fila.origen_hoja,
          fila: fila.origen_fila,
          mensaje: `Código duplicado ${fila.codigo}; se conserva la primera aparición (${previa.origen_hoja}, fila ${previa.origen_fila}).`,
        })
        continue
      }
      vistos.set(clave, fila)
      filasUnicas.push(fila)
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      let creados = 0
      let actualizados = 0
      let sinCambios = 0

      for (const fila of filasUnicas) {
        const [resultado] = await conn.query(
          `INSERT INTO inventario_laptops
             (empresa_id, codigo, tipo_activo, propiedad, responsable_actual, estado,
              area, area_destino, procesador, marca, modelo, ram, numero_serie,
              disco, proveedor, observacion, origen_hoja, origen_seccion, origen_fila, activo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
           ON DUPLICATE KEY UPDATE
             tipo_activo = VALUES(tipo_activo),
             propiedad = VALUES(propiedad),
             responsable_actual = VALUES(responsable_actual),
             estado = VALUES(estado),
             area = VALUES(area),
             area_destino = VALUES(area_destino),
             procesador = VALUES(procesador),
             marca = VALUES(marca),
             modelo = VALUES(modelo),
             ram = VALUES(ram),
             numero_serie = VALUES(numero_serie),
             disco = VALUES(disco),
             proveedor = VALUES(proveedor),
             observacion = VALUES(observacion),
             origen_hoja = VALUES(origen_hoja),
             origen_seccion = VALUES(origen_seccion),
             origen_fila = VALUES(origen_fila),
             activo = TRUE`,
          [
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
          ]
        )

        const afectadas = Number((resultado as { affectedRows: number }).affectedRows)
        if (afectadas === 1) creados++
        else if (afectadas === 2) actualizados++
        else sinCambios++
      }

      const duplicados = analisis.filas.length - filasUnicas.length
      const omitidos = sinCambios + duplicados
      const resumen = {
        ...analisis.resumen,
        creados,
        actualizados,
        sin_cambios: sinCambios,
        omitidos,
        duplicados,
        almacen_p100: analisis.almacenP100.length,
      }

      await conn.commit()

      return NextResponse.json({
        ok: true,
        total: analisis.filas.length,
        creados,
        actualizados,
        omitidos,
        sin_cambios: sinCambios,
        duplicados: resumen.duplicados,
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
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
