import pool from './db'
import { evaluarBolsaHoras } from './bolsa-horas'
import { formatoHoras } from './utils'
import { notificarAdministradoresEmpresa } from './notificaciones'

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
