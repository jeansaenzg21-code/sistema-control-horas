import pool from './db'
import { evaluarBolsaHoras } from './bolsa-horas'
import { formatoHoras } from './utils'
import { notificarAdministradoresEmpresa } from './notificaciones'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'

export interface ClienteBolsa {
  id: number
  nombre: string
  horas_contratadas: number | string
  horas_consumidas: number | string
}

export async function notificarBolsaHoras(cliente: ClienteBolsa, empresaId: number): Promise<boolean> {
  const evaluacion = evaluarBolsaHoras(cliente.horas_contratadas, cliente.horas_consumidas)
  if (evaluacion.estado === 'normal') return false

  const url = `/clientes#cliente-${cliente.id}`
  const titulo = evaluacion.estado === 'agotada'
    ? 'Bolsa de horas agotada'
    : 'Bolsa de horas por agotarse'
  const detalle = evaluacion.estado === 'agotada'
    ? `${cliente.nombre} agotó su bolsa y presenta ${formatoHoras(Math.abs(evaluacion.restantes))} de exceso. Revisa adicionales o facturación extraordinaria.`
    : `${cliente.nombre} tiene ${formatoHoras(evaluacion.restantes)} disponibles (${Math.max(0, Math.round(evaluacion.porcentajeRestante))}% de la bolsa). Revisa una ampliación o facturación extraordinaria.`

  const creadas = await notificarAdministradoresEmpresa(
    empresaId,
    'cliente_bolsa',
    titulo,
    detalle,
    url,
    `cliente-bolsa:${cliente.id}:${evaluacion.estado}`,
  )
  return creadas > 0
}

/** Revisa una cartera completa con una consulta de administradores y escrituras por lote. */
export async function notificarBolsasHorasLote(clientes: ClienteBolsa[], empresaId: number): Promise<number> {
  const alertas = clientes.flatMap((cliente) => {
    const evaluacion = evaluarBolsaHoras(cliente.horas_contratadas, cliente.horas_consumidas)
    if (evaluacion.estado === 'normal') return []
    const agotada = evaluacion.estado === 'agotada'
    return [{
      cliente,
      tipo: 'cliente_bolsa',
      titulo: agotada ? 'Bolsa de horas agotada' : 'Bolsa de horas por agotarse',
      mensaje: agotada
        ? `${cliente.nombre} agotó su bolsa y presenta ${formatoHoras(Math.abs(evaluacion.restantes))} de exceso. Revisa adicionales o facturación extraordinaria.`
        : `${cliente.nombre} tiene ${formatoHoras(evaluacion.restantes)} disponibles (${Math.max(0, Math.round(evaluacion.porcentajeRestante))}% de la bolsa). Revisa una ampliación o facturación extraordinaria.`,
      clave: `cliente-bolsa:${cliente.id}:${evaluacion.estado}`,
    }]
  })
  if (!alertas.length) return 0

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id FROM usuarios u
      JOIN areas ar ON ar.id = u.area_id
     WHERE u.rol = 'ADMINISTRACION' AND u.activo = TRUE AND ar.empresa_id = ?`,
    [empresaId],
  )
  const administradores = rows as Array<{ id: number }>
  if (!administradores.length) return 0

  const filas = alertas.flatMap((alerta) => administradores.map((admin) => [
    admin.id, empresaId, alerta.tipo, alerta.titulo, alerta.mensaje,
    `/clientes#cliente-${alerta.cliente.id}`, alerta.clave,
  ]))
  let creadas = 0
  const tamanoLote = 500
  for (let inicio = 0; inicio < filas.length; inicio += tamanoLote) {
    const lote = filas.slice(inicio, inicio + tamanoLote)
    const valores = lote.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')
    const [resultado] = await pool.query<ResultSetHeader>(
      `INSERT INTO notificaciones (usuario_id, empresa_id, tipo, titulo, mensaje, url, clave_deduplicacion)
       VALUES ${valores} ON DUPLICATE KEY UPDATE id = id`,
      lote.flat(),
    )
    creadas += resultado.affectedRows
  }
  return creadas
}

export async function notificarBolsaHorasPorId(clienteId: number, empresaId: number): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT c.id, c.nombre, c.horas_contratadas,
       COALESCE(SUM(GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, a.fin) -
         COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, a.fin)))
           FROM pausas p WHERE p.actividad_id = a.id), 0))), 0) / 3600 AS horas_consumidas
     FROM clientes c
     INNER JOIN areas ar ON ar.id = c.area_id
     LEFT JOIN actividades a ON a.cliente_id = c.id AND a.fin IS NOT NULL
       AND a.estado IN ('PENDIENTE_APROBACION', 'APROBADA')
     WHERE c.id = ? AND c.activo = TRUE AND ar.empresa_id = ?
     GROUP BY c.id, c.nombre, c.horas_contratadas`,
    [clienteId, empresaId]
  )
  const clientes = rows as ClienteBolsa[]
  if (clientes.length === 0) return false
  return notificarBolsaHoras(clientes[0], empresaId)
}
