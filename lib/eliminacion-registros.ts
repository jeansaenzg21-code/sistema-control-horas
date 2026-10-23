import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { tablaExiste } from './esquema'

async function eliminarObservaciones(
  conexion: PoolConnection,
  condicion: string,
  parametros: unknown[]
): Promise<void> {
  const [filas] = await conexion.query<RowDataPacket[]>(
    `SELECT id FROM observaciones WHERE ${condicion}`,
    parametros
  )
  const ids = filas.map((fila) => Number(fila.id))
  if (ids.length === 0) return

  const marcadores = ids.map(() => '?').join(', ')
  await conexion.query(
    `UPDATE observaciones SET parent_id = NULL WHERE parent_id IN (${marcadores})`,
    ids
  )
  await conexion.query(`DELETE FROM observaciones WHERE id IN (${marcadores})`, ids)
}

export async function eliminarUsuarioCompleto(
  conexion: PoolConnection,
  usuarioId: number,
  adminId: number
): Promise<void> {
  await eliminarObservaciones(
    conexion,
    `usuario_destino_id = ? OR autor_id = ?
       OR actividad_id IN (SELECT id FROM actividades WHERE usuario_id = ?)`,
    [usuarioId, usuarioId, usuarioId]
  )

  if (await tablaExiste('proyectos')) {
    await conexion.query('UPDATE proyectos SET jefe_id = ? WHERE jefe_id = ?', [adminId, usuarioId])
  }

  if (await tablaExiste('presupuestos')) {
    await conexion.query('UPDATE presupuestos SET creado_por = ? WHERE creado_por = ?', [adminId, usuarioId])
    await conexion.query('UPDATE presupuesto_cambios SET usuario_id = ? WHERE usuario_id = ?', [adminId, usuarioId])
    await conexion.query('UPDATE presupuesto_asignaciones SET usuario_id = NULL WHERE usuario_id = ?', [usuarioId])
    await conexion.query('UPDATE presupuesto_desviaciones SET usuario_id = NULL WHERE usuario_id = ?', [usuarioId])
    await conexion.query('UPDATE presupuesto_desviaciones SET resuelto_por = NULL WHERE resuelto_por = ?', [usuarioId])
  }

  if (await tablaExiste('proyecto_participantes')) {
    await conexion.query('DELETE FROM proyecto_participantes WHERE usuario_id = ?', [usuarioId])
  }

  await conexion.query('UPDATE actividades SET revisado_por = NULL WHERE revisado_por = ?', [usuarioId])
  await conexion.query('DELETE FROM actividades WHERE usuario_id = ?', [usuarioId])

  if (await tablaExiste('intentos_login')) {
    const [cuenta] = await conexion.query<RowDataPacket[]>(
      'SELECT usuario FROM usuarios WHERE id = ? LIMIT 1',
      [usuarioId]
    )
    const nombreUsuario = String(cuenta[0]?.usuario ?? '').toLowerCase()
    if (nombreUsuario) {
      await conexion.query('DELETE FROM intentos_login WHERE usuario = ?', [nombreUsuario])
    }
  }

  await conexion.query('DELETE FROM usuarios WHERE id = ?', [usuarioId])
}

export async function eliminarAreaCompleta(
  conexion: PoolConnection,
  areaId: number,
  empresaId: number,
  adminId: number
): Promise<void> {
  const [usuarios] = await conexion.query<RowDataPacket[]>(
    'SELECT id FROM usuarios WHERE area_id = ?',
    [areaId]
  )
  const [clientes] = await conexion.query<RowDataPacket[]>(
    'SELECT id FROM clientes WHERE area_id = ?',
    [areaId]
  )
  const [tipos] = await conexion.query<RowDataPacket[]>(
    'SELECT id FROM tipos_actividad WHERE area_id = ? AND es_general = FALSE',
    [areaId]
  )

  const idsClientes = clientes.map((fila) => Number(fila.id))
  const proyectoIds = new Set<number>()

  if (await tablaExiste('proyecto_areas')) {
    const [porArea] = await conexion.query<RowDataPacket[]>(
      'SELECT proyecto_id FROM proyecto_areas WHERE area_id = ?',
      [areaId]
    )
    for (const fila of porArea) proyectoIds.add(Number(fila.proyecto_id))
  }

  if (idsClientes.length > 0 && await tablaExiste('proyectos')) {
    const marcadores = idsClientes.map(() => '?').join(', ')
    const [porCliente] = await conexion.query<RowDataPacket[]>(
      `SELECT id FROM proyectos WHERE cliente_id IN (${marcadores})`,
      idsClientes
    )
    for (const fila of porCliente) proyectoIds.add(Number(fila.id))
  }

  for (const usuario of usuarios) {
    await eliminarUsuarioCompleto(conexion, Number(usuario.id), adminId)
  }

  const condiciones: string[] = []
  const parametros: unknown[] = []

  if (idsClientes.length > 0) {
    condiciones.push(`cliente_id IN (${idsClientes.map(() => '?').join(', ')})`)
    parametros.push(...idsClientes)
  }
  if (tipos.length > 0) {
    const idsTipos = tipos.map((fila) => Number(fila.id))
    condiciones.push(`tipo_actividad_id IN (${idsTipos.map(() => '?').join(', ')})`)
    parametros.push(...idsTipos)
  }
  if (proyectoIds.size > 0) {
    const idsProyectos = Array.from(proyectoIds)
    condiciones.push(`proyecto_id IN (${idsProyectos.map(() => '?').join(', ')})`)
    parametros.push(...idsProyectos)
  }

  if (condiciones.length > 0) {
    const condicion = condiciones.join(' OR ')
    await eliminarObservaciones(
      conexion,
      `actividad_id IN (SELECT id FROM actividades WHERE ${condicion})`,
      parametros
    )
    await conexion.query(`DELETE FROM actividades WHERE ${condicion}`, parametros)
  }

  if (await tablaExiste('proyecto_areas')) {
    await conexion.query('DELETE FROM proyecto_areas WHERE area_id = ?', [areaId])
  }

  if (await tablaExiste('proyectos')) {
    for (const proyectoId of proyectoIds) {
      let exclusivo = true
      if (await tablaExiste('proyecto_areas')) {
        const [otros] = await conexion.query<RowDataPacket[]>(
          'SELECT COUNT(*) AS total FROM proyecto_areas WHERE proyecto_id = ? AND area_id <> ?',
          [proyectoId, areaId]
        )
        exclusivo = Number(otros[0]?.total ?? 0) === 0
      }
      if (exclusivo) {
        await conexion.query('DELETE FROM proyectos WHERE id = ?', [proyectoId])
      }
    }
  }

  if (idsClientes.length > 0) {
    if (await tablaExiste('presupuestos')) {
      const marcadores = idsClientes.map(() => '?').join(', ')
      await conexion.query(`DELETE FROM presupuestos WHERE cliente_id IN (${marcadores})`, idsClientes)
    }
    await conexion.query('DELETE FROM clientes WHERE area_id = ?', [areaId])
  }

  await conexion.query('DELETE FROM tipos_actividad WHERE area_id = ? AND es_general = FALSE', [areaId])
  await conexion.query('DELETE FROM usuarios WHERE area_id = ?', [areaId])
  await conexion.query('DELETE FROM areas WHERE id = ? AND empresa_id = ?', [areaId, empresaId])
}
