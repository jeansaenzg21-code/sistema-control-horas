import { NextResponse } from 'next/server'
import { RowDataPacket } from 'mysql2/promise'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'
import { columnaExiste } from '@/lib/esquema'
import { claveTexto } from '@/lib/actividades/catalogo-excel'

/**
 * Lo que el navegador manda: el archivo ya viene leído y con las secciones
 * resueltas a áreas por lib/actividades/catalogo-excel.ts. El servidor no
 * vuelve a interpretar el Excel, pero tampoco se fía: resuelve cada nombre de
 * área contra las suyas y rechaza lo que no exista.
 */
interface SeccionRecibida {
  area?: string
  crearArea?: boolean
  actividades?: Array<{ codigo?: string | null; nombre?: string }>
}

interface ResultadoArea {
  area: string
  area_id: number
  creadas: number
  actualizadas: number
  desactivadas: number
  conUso: number
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !esAdmin(user)) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    if (!(await columnaExiste('tipos_actividad', 'codigo'))) {
      return NextResponse.json(
        { error: 'Falta preparar la base de datos. Ejecuta sql/actividades_codigo.sql.' },
        { status: 503 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as { secciones?: SeccionRecibida[] }
    const secciones = Array.isArray(body.secciones) ? body.secciones : []
    if (secciones.length === 0) {
      return NextResponse.json({ error: 'El archivo no contiene secciones para importar.' }, { status: 400 })
    }

    const totalActividades = secciones.reduce(
      (total, seccion) => total + (Array.isArray(seccion.actividades) ? seccion.actividades.length : 0),
      0
    )
    if (totalActividades === 0) {
      return NextResponse.json({ error: 'El archivo no contiene actividades para importar.' }, { status: 400 })
    }
    if (totalActividades > 1000) {
      return NextResponse.json(
        { error: 'El archivo supera el máximo de 1000 actividades por importación.' },
        { status: 400 }
      )
    }

    // Se traen también las inactivas: un área desactivada puede seguir teniendo
    // su catálogo, y borrarle las actividades solo porque alguien la desactivó
    // desde Configuración sería una pérdida de datos difícil de explicar.
    const [areasFilas] = await pool.query(
      'SELECT id, nombre, activo FROM areas WHERE empresa_id = ?',
      [context.activa.id]
    )
    const areas = areasFilas as Array<{ id: number; nombre: string; activo: number }>
    const areaPorClave = new Map<string, { id: number; nombre: string; activo: number }>()
    for (const area of areas) areaPorClave.set(claveTexto(area.nombre), area)

    const errores: Array<{ area: string; detalle: string }> = []
    const areasCreadas: string[] = []
    const resultados: ResultadoArea[] = []

    for (const seccion of secciones) {
      const nombreArea = String(seccion.area ?? '').trim()
      if (!nombreArea) {
        errores.push({ area: '(sin nombre)', detalle: 'La sección no tiene área de destino.' })
        continue
      }

      const actividades = Array.isArray(seccion.actividades) ? seccion.actividades : []
      // Una sección sin actividades NUNCA llega a la desactivación. Si llegara,
      // el paso final desactivaría todo el catálogo del área, porque nada
      // estaría en `tocados`: un archivo mal leído, una hoja vacía o un payload
      // recortado convertían un error de lectura en la pérdida del catálogo
      // entero. Ante la duda no se toca nada y se avisa.
      if (actividades.length === 0) {
        errores.push({ area: nombreArea, detalle: 'La sección no trae actividades. Su catálogo no se ha tocado.' })
        continue
      }
      const nombres = actividades.map((actividad) => String(actividad.nombre ?? '').trim())
      if (nombres.some((nombre) => nombre === '')) {
        errores.push({ area: nombreArea, detalle: 'Hay actividades sin nombre; revisa el archivo.' })
        continue
      }

      let area = areaPorClave.get(claveTexto(nombreArea))

      if (!area) {
        if (!seccion.crearArea) {
          errores.push({
            area: nombreArea,
            detalle: `No existe la división "${nombreArea}" en esta empresa. Créala en Configuración o vuelve a leer el archivo.`,
          })
          continue
        }
        if (nombreArea.length > 100) {
          errores.push({ area: nombreArea, detalle: 'El nombre de la división supera los 100 caracteres.' })
          continue
        }
        try {
          const [resultado] = await pool.query('INSERT INTO areas (empresa_id, nombre) VALUES (?, ?)', [
            context.activa.id,
            nombreArea,
          ])
          const nueva = { id: Number((resultado as { insertId: number }).insertId), nombre: nombreArea, activo: 1 }
          areaPorClave.set(claveTexto(nombreArea), nueva)
          areasCreadas.push(nombreArea)
          area = nueva
        } catch (error) {
          const code = (error as { code?: string }).code
          if (code === 'ER_DUP_ENTRY') {
            const [repetida] = await pool.query(
              'SELECT id, nombre, activo FROM areas WHERE empresa_id = ? AND nombre = ? LIMIT 1',
              [context.activa.id, nombreArea]
            )
            const encontrada = (repetida as Array<{ id: number; nombre: string; activo: number }>)[0]
            if (encontrada) {
              areaPorClave.set(claveTexto(encontrada.nombre), encontrada)
              area = encontrada
            } else {
              errores.push({ area: nombreArea, detalle: 'Ya existe una división con ese nombre y no se pudo recuperar.' })
              continue
            }
          } else {
            errores.push({ area: nombreArea, detalle: 'No se pudo crear la división.' })
            continue
          }
        }
      }

      // Un área desactivada sigue recibiendo su catálogo: las actividades se
      // reactivan también, porque si no el área quedaría sin nada que registrar
      // y el fallo aparecería al imputar horas, no al importar.
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()

        const [previasFilas] = await conn.query<RowDataPacket[]>(
          `SELECT ta.id, ta.codigo, ta.nombre,
                  (SELECT COUNT(*) FROM actividades a WHERE a.tipo_actividad_id = ta.id) AS usos
             FROM tipos_actividad ta
            WHERE ta.area_id = ? AND ta.es_general = FALSE`,
          [area.id]
        )
        const previas = previasFilas as unknown as Array<{
          id: number
          codigo: string | null
          nombre: string
          usos: number
        }>
        const porId = new Map(previas.map((tipo) => [tipo.id, tipo]))
        const porCodigo = new Map<string, number>()
        const porNombre = new Map<string, number>()
        for (const tipo of previas) {
          if (tipo.codigo) porCodigo.set(claveTexto(tipo.codigo), tipo.id)
          porNombre.set(claveTexto(tipo.nombre), tipo.id)
        }

        let creadas = 0
        let actualizadas = 0
        let conUso = 0
        const tocados = new Set<number>()

        for (const [indice, actividad] of actividades.entries()) {
          const nombre = nombres[indice]
          const codigo = actividad.codigo ? String(actividad.codigo).trim().toUpperCase().slice(0, 32) : null

          const claveBusqueda = codigo ? claveTexto(codigo) : null
          const existenteId = (claveBusqueda ? porCodigo.get(claveBusqueda) : undefined)
            ?? porNombre.get(claveTexto(nombre))

          if (existenteId !== undefined && porId.has(existenteId)) {
            await conn.query(
              'UPDATE tipos_actividad SET nombre = ?, codigo = ?, activo = TRUE, es_general = FALSE WHERE id = ?',
              [nombre, codigo, existenteId]
            )
            tocados.add(existenteId)
            actualizadas += 1
            if (porId.get(existenteId)!.usos > 0) conUso += 1
          } else {
            const [insertado] = await conn.query(
              'INSERT INTO tipos_actividad (nombre, codigo, area_id, es_general, activo) VALUES (?, ?, ?, FALSE, TRUE)',
              [nombre, codigo, area.id]
            )
            tocados.add(Number((insertado as { insertId: number }).insertId))
            creadas += 1
          }
        }

        // Lo que quede en el área y no venga del archivo se desactiva, no se
        // borra: `actividades.tipo_actividad_id` es ON DELETE RESTRICT y estas
        // filas pueden tener horas imputadas. Desactivarlas saca la opción del
        // desplegable de nuevas horas sin tocar el historial.
        const candidatos = previas.filter((tipo) => !tocados.has(tipo.id)).map((tipo) => tipo.id)
        let desactivadas = 0
        if (candidatos.length > 0) {
          // `activo = TRUE` en el WHERE para que el contador diga cuántas se
          // apagaron de verdad. Sin él, reimportar el mismo archivo informaría
          // otra vez de todas las que ya estaban apagadas, y ese número se
          // lee como "229 actividades se quedaron sin opciones".
          const [desactivado] = await conn.query(
            `UPDATE tipos_actividad SET activo = FALSE
              WHERE activo = TRUE
                AND id IN (${candidatos.map(() => '?').join(', ')})`,
            candidatos
          )
          desactivadas = (desactivado as { affectedRows: number }).affectedRows
          conUso += previas.filter((tipo) => !tocados.has(tipo.id) && tipo.usos > 0).length
        }

        await conn.commit()
        resultados.push({ area: area.nombre, area_id: area.id, creadas, actualizadas, desactivadas, conUso })
      } catch (error) {
        await conn.rollback()
        throw error
      } finally {
        conn.release()
      }
    }

    if (resultados.length === 0 && errores.length > 0) {
      return NextResponse.json({ error: errores[0].detalle, errores }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      total: resultados.reduce((total, item) => total + item.creadas + item.actualizadas, 0),
      creadas: resultados.reduce((total, item) => total + item.creadas, 0),
      actualizadas: resultados.reduce((total, item) => total + item.actualizadas, 0),
      desactivadas: resultados.reduce((total, item) => total + item.desactivadas, 0),
      conUso: resultados.reduce((total, item) => total + item.conUso, 0),
      areasCreadas,
      areas: resultados,
      errores,
    })
  } catch (error) {
    console.error('Error en importación de actividades:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
