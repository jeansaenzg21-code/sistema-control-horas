// Persistencia del presupuesto importado.
//
// Reglas que este archivo respeta y que no son opcionales:
//
// 1. Importar dos veces el MISMO archivo no duplica nada. Se calcula el SHA-256 y
//    se busca por (empresa, cliente, hash). Si existe, se rehace su contenido.
// 2. Los consolidados se guardan con `origen = 'CONSOLIDADO'` y nunca cuentan
//    como bolsa. Sin esto, importar el Excel daría 542 h en vez de 270.
// 3. Una persona solo se vincula si su nombre coincide de forma EXACTA con un
//    usuario. 'Trainee', 'Junior' o una fila sin nombre se guardan con
//    `usuario_id = NULL` y estado PENDIENTE_REVISION. Nunca se reparten por
//    parecido ni se adivina.
// 4. Todo va en una transacción: o queda el presupuesto entero, o no queda nada.

import { createHash } from 'node:crypto'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'

import pool from '@/lib/db'
import type { AnalisisPresupuesto } from './importar-excel'

export type ResultadoGuardado = {
  presupuestoId: number
  version: number
  /** El archivo ya estaba importado: se rehizo su contenido. */
  yaExistia: boolean
  serviciosDetallados: number
  serviciosConsolidados: number
  asignacionesConfirmadas: number
  asignacionesPendientes: number
  observacionesBloqueantes: number
}

function sha256(datos: Buffer): string {
  return createHash('sha256').update(datos).digest('hex')
}

/** Sin acentos, sin mayúsculas y sin espacios dobles, para comparar. */
function normalizar(s: string | null): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Mapa nombre normalizado -> ids de usuario de la empresa. */
type IndiceUsuarios = Map<string, number[]>

async function cargarUsuarios(empresaId: number): Promise<IndiceUsuarios> {
  const [rows] = await pool.query<(RowDataPacket & { id: number; nombre: string })[]>(
    `SELECT u.id, u.nombre
       FROM usuarios u
       INNER JOIN areas a ON a.id = u.area_id
      WHERE a.empresa_id = ? AND u.activo = TRUE`,
    [empresaId]
  )
  const indice: IndiceUsuarios = new Map()
  for (const u of rows) {
    const clave = normalizar(u.nombre)
    if (!clave) continue
    if (!indice.has(clave)) indice.set(clave, [])
    indice.get(clave)!.push(u.id)
  }
  return indice
}

/**
 * Resuelve el nombre del Excel a un usuario de la empresa.
 *
 * Devuelve `usuario_id = NULL` cuando no se puede atribuir con certeza: cero
 * coincidencias, más de una, o un nombre que en realidad es una categoría. En ese
 * caso la asignación queda PENDIENTE_REVIEW y el Líder la confirma a mano.
 */
function resolverUsuario(
  nombre: string | null,
  indice: IndiceUsuarios
): { id: number | null; motivo: string | null } {
  if (!nombre) {
    return { id: null, motivo: 'La fila del Excel no indica a quién se asignan las horas.' }
  }
  const encontrados = indice.get(normalizar(nombre)) ?? []
  if (encontrados.length === 1) return { id: encontrados[0], motivo: null }
  if (encontrados.length === 0) {
    return { id: null, motivo: `"${nombre}" no coincide exactamente con ningún usuario de la empresa.` }
  }
  return {
    id: null,
    motivo: `"${nombre}" coincide con ${encontrados.length} usuarios. No se puede atribuir sin que el Líder elija.`,
  }
}

export async function guardarAnalisis(params: {
  empresaId: number
  clienteId: number
  usuarioId: number
  nombreArchivo: string
  archivo: Buffer
  analisis: AnalisisPresupuesto
}): Promise<ResultadoGuardado> {
  const { empresaId, clienteId, usuarioId, nombreArchivo, archivo, analisis } = params
  const hash = sha256(archivo)
  const indiceUsuarios = await cargarUsuarios(empresaId)

  const conexion = await pool.getConnection()
  try {
    await conexion.beginTransaction()

    const [existentes] = await conexion.query<(RowDataPacket & { id: number; version: number })[]>(
      'SELECT id, version FROM presupuestos WHERE empresa_id = ? AND cliente_id = ? AND archivo_hash = ? FOR UPDATE',
      [empresaId, clienteId, hash]
    )

    let presupuestoId: number
    let version: number
    let yaExistia: boolean

    if (existentes.length > 0) {
      presupuestoId = existentes[0].id
      version = existentes[0].version
      yaExistia = true
      await conexion.query(
        `UPDATE presupuestos
            SET analisis = ?, archivo_bytes = ?, archivo_nombre = ?,
                estado = 'BORRADOR', creado_por = ?
          WHERE id = ?`,
        [JSON.stringify(analisis), archivo, nombreArchivo, usuarioId, presupuestoId]
      )
      // Las asignaciones y servicios cuelgan por CASCADE: se van con el servicio.
      await conexion.query('DELETE FROM presupuesto_servicios WHERE presupuesto_id = ?', [presupuestoId])
      await conexion.query('DELETE FROM presupuesto_planificacion WHERE presupuesto_id = ?', [
        presupuestoId,
      ])
    } else {
      const [maximo] = await conexion.query<(RowDataPacket & { v: number | null })[]>(
        'SELECT MAX(version) AS v FROM presupuestos WHERE empresa_id = ? AND cliente_id = ?',
        [empresaId, clienteId]
      )
      version = Number(maximo[0]?.v ?? 0) + 1
      // Un INSERT devuelve un ResultSetHeader con `insertId`, no una lista de filas.
      const [nuevo] = await conexion.query<ResultSetHeader>(
        `INSERT INTO presupuestos
           (empresa_id, cliente_id, version, estado, archivo_nombre, archivo_hash,
            archivo_bytes, analisis, creado_por)
         VALUES (?, ?, ?, 'BORRADOR', ?, ?, ?, ?, ?)`,
        [
          empresaId,
          clienteId,
          version,
          nombreArchivo,
          hash,
          archivo,
          JSON.stringify(analisis),
          usuarioId,
        ]
      )
      presupuestoId = nuevo.insertId
      yaExistia = false
    }

    let confirmadas = 0
    let pendientes = 0
    let detallados = 0
    let consolidados = 0

    for (const servicio of analisis.servicios) {
      const [res] = await conexion.query<ResultSetHeader>(
        `INSERT INTO presupuesto_servicios
           (presupuesto_id, origen, nombre, horas, moneda, importe, fee, fila_origen, nota)
         VALUES (?, ?, ?, ?, 'USD', ?, ?, ?, ?)`,
        [
          presupuestoId,
          servicio.origen,
          servicio.nombre,
          servicio.horasTotales,
          servicio.importeTotal,
          servicio.fee,
          servicio.filaInicio,
          servicio.nota,
        ]
      )
      if (servicio.origen === 'CONSOLIDADO') consolidados += 1
      else detallados += 1

      for (const asignacion of servicio.asignaciones) {
        const { id: usuarioAsignado, motivo } = resolverUsuario(
          asignacion.nombreTexto,
          indiceUsuarios
        )
        if (usuarioAsignado === null) {
          pendientes += 1
        } else {
          confirmadas += 1
        }
        await conexion.query(
          `INSERT INTO presupuesto_asignaciones
             (servicio_id, usuario_id, nombre_texto, categoria, horas, estado, motivo, fila_origen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            res.insertId,
            usuarioAsignado,
            asignacion.nombreTexto,
            asignacion.categoria,
            asignacion.horas,
            usuarioAsignado === null ? 'PENDIENTE_REVISION' : 'CONFIRMADA',
            usuarioAsignado === null ? (motivo ?? asignacion.motivo) : null,
            asignacion.filaOrigen,
          ]
        )
      }
    }

    for (const sub of analisis.planificacion) {
      await conexion.query(
        `INSERT INTO presupuesto_planificacion
           (presupuesto_id, etapa, subetapa, horas, semana_inicio, semana_fin, mes, fila_origen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          presupuestoId,
          sub.etapa,
          sub.subetapa,
          sub.horas,
          sub.semanaInicio,
          sub.semanaFin,
          sub.mes,
          sub.filaOrigen,
        ]
      )
    }

    const bloqueantes = analisis.observaciones.filter((o) => o.severidad === 'BLOQUEANTE')
    await conexion.query(
      `INSERT INTO presupuesto_cambios (presupuesto_id, tipo, detalle, justificacion, usuario_id)
       VALUES (?, 'IMPORTACION', ?, ?, ?)`,
      [
        presupuestoId,
        JSON.stringify({
          archivo: nombreArchivo,
          hash,
          totales: analisis.totales,
          observaciones: analisis.observaciones.length,
        }),
        yaExistia
          ? 'Reimportacion del mismo documento: se rehizo el contenido sin duplicar.'
          : 'Importacion inicial del documento.',
        usuarioId,
      ]
    )

    await conexion.commit()

    return {
      presupuestoId,
      version,
      yaExistia,
      serviciosDetallados: detallados,
      serviciosConsolidados: consolidados,
      asignacionesConfirmadas: confirmadas,
      asignacionesPendientes: pendientes,
      observacionesBloqueantes: bloqueantes.length,
    }
  } catch (error) {
    await conexion.rollback()
    throw error
  } finally {
    conexion.release()
  }
}
