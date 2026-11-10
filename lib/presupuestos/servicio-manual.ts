import type { RowDataPacket, ResultSetHeader } from 'mysql2'
import type { z } from 'zod'
import pool from '@/lib/db'
import { recalcularHorasContratadas } from './activar'
import { asegurarEsquemaPlanificacion } from './cronograma-cliente'
import { ErrorPlanificacion } from '@/lib/planificacion/modelo'

import { esquemaServicioManual } from './servicio-manual-validacion'
export { esquemaServicioManual } from './servicio-manual-validacion'

export async function crearServicioManual(clienteId: number, entrada: z.infer<typeof esquemaServicioManual>, contexto: { empresaId: number; usuarioId: number; ip: string | null }) {
  const datos = esquemaServicioManual.parse(entrada)
  const db = await pool.getConnection()
  try {
    await db.beginTransaction()
    await db.query('SELECT id FROM clientes WHERE id=? FOR UPDATE', [clienteId])
    // La auditoría y el alta se confirman juntas; un reintento recupera el mismo servicio.
    const [previos] = await db.query<RowDataPacket[]>(`SELECT despues FROM auditoria WHERE empresa_id=? AND entidad='clientes' AND entidad_id=?
      AND accion='SERVICIO_PRESUPUESTO_CREAR' AND JSON_UNQUOTE(JSON_EXTRACT(despues,'$.clave'))=? LIMIT 1`, [contexto.empresaId, clienteId, datos.clave])
    if (previos.length) {
      const previo = typeof previos[0].despues === 'string' ? JSON.parse(previos[0].despues) : previos[0].despues
      await db.commit()
      return { servicioId: Number(previo.servicioId), horasContratadas: Number(previo.horasContratadas) }
    }
    const [presupuestos] = await db.query<RowDataPacket[]>(`SELECT id FROM presupuestos WHERE cliente_id=? AND empresa_id=?
      ORDER BY (estado='APROBADO') DESC,(estado='EN_REVISION') DESC,version DESC FOR UPDATE`, [clienteId, contexto.empresaId])
    if (Number(presupuestos[0]?.id) !== datos.presupuestoId) throw new ErrorPlanificacion('El presupuesto vigente cambió. Actualiza la ficha antes de añadir el servicio.', 409)
    const [duplicados] = await db.query<RowDataPacket[]>('SELECT id FROM presupuesto_servicios WHERE presupuesto_id=? AND nombre=?', [datos.presupuestoId, datos.nombre])
    if (duplicados.length) throw new ErrorPlanificacion('Ya existe un servicio con ese nombre en el presupuesto.', 409)
    const ids = datos.participantes.map(p => p.usuarioId)
    const [personal] = await db.query<RowDataPacket[]>(`SELECT u.id,u.nombre,u.cargo FROM usuarios u JOIN areas a ON a.id=u.area_id
      WHERE u.id IN (${ids.map(() => '?').join(',')}) AND a.empresa_id=?
      AND u.area_id=(SELECT area_id FROM clientes WHERE id=?)
      AND u.activo=TRUE AND u.rol IN ('PERSONAL','SUPERVISOR','JEFE_AREA')`, [...ids, contexto.empresaId, clienteId])
    if (personal.length !== ids.length) throw new ErrorPlanificacion('Los participantes deben ser personal activo del área del cliente.')
    const [r] = await db.query<ResultSetHeader>(`INSERT INTO presupuesto_servicios (presupuesto_id,origen,nombre,horas,activo,nota)
      VALUES (?,'COMPLEMENTARIO',?,?,1,'Servicio añadido desde Planificación')`, [datos.presupuestoId, datos.nombre, datos.horas])
    for (const p of datos.participantes) {
      const u = personal.find(u => Number(u.id) === p.usuarioId)!
      await db.query(`INSERT INTO presupuesto_asignaciones (servicio_id,usuario_id,nombre_texto,categoria,horas,estado)
        VALUES (?,?,?,?,?,'CONFIRMADA')`, [r.insertId, p.usuarioId, u.nombre, u.cargo, p.horas])
    }
    const horasContratadas = await recalcularHorasContratadas(db, clienteId)
    await db.query(`INSERT INTO auditoria (empresa_id,usuario_id,accion,entidad,entidad_id,despues,ip)
      VALUES (?,?,'SERVICIO_PRESUPUESTO_CREAR','clientes',?,?,?)`,
    [contexto.empresaId, contexto.usuarioId, clienteId, JSON.stringify({ ...datos, servicioId: r.insertId, horasContratadas }), contexto.ip])
    await db.commit()
    return { servicioId: r.insertId, horasContratadas }
  } catch (error) { await db.rollback(); throw error } finally { db.release() }
}

/** Elimina un servicio del presupuesto vigente y sus actividades planificadas. */
export async function eliminarServicioPresupuesto(clienteId: number, presupuestoId: number, servicioId: number, contexto: { empresaId: number; usuarioId: number; ip: string | null }) {
  await asegurarEsquemaPlanificacion()
  const db = await pool.getConnection()
  try {
    await db.beginTransaction()
    await db.query('SELECT id FROM clientes WHERE id=? FOR UPDATE', [clienteId])
    const [vigentes] = await db.query<RowDataPacket[]>(`SELECT id FROM presupuestos WHERE cliente_id=? AND empresa_id=?
      ORDER BY (estado='APROBADO') DESC,(estado='EN_REVISION') DESC,version DESC FOR UPDATE`, [clienteId, contexto.empresaId])
    if (Number(vigentes[0]?.id) !== presupuestoId) throw new ErrorPlanificacion('El presupuesto vigente cambió. Actualiza la ficha antes de eliminar el servicio.', 409)
    const [servicios] = await db.query<RowDataPacket[]>(`SELECT id,nombre,origen FROM presupuesto_servicios
      WHERE id=? AND presupuesto_id=? FOR UPDATE`, [servicioId, presupuestoId])
    if (!servicios.length) throw new ErrorPlanificacion('El servicio ya no existe en el presupuesto vigente.', 404)
    const servicio = servicios[0]
    if (servicio.origen === 'CONSOLIDADO') throw new ErrorPlanificacion('El servicio consolidado es una referencia y no se puede eliminar.', 400)
    const [actividades] = await db.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM actividades WHERE presupuesto_servicio_id=?', [servicioId])
    const registradas = Number(actividades[0]?.total ?? 0)
    if (registradas > 0) throw new ErrorPlanificacion(`No se puede eliminar «${servicio.nombre}»: tiene ${registradas} actividad(es) con horas registradas.`, 409)
    const [tareas] = await db.query<RowDataPacket[]>('SELECT id FROM cliente_cronograma_tareas WHERE cliente_id=? AND servicio_id=?', [clienteId, servicioId])
    const ids = tareas.map(t => Number(t.id))
    if (ids.length) {
      // Las dependencias de otros servicios no deben quedar apuntando a tareas eliminadas.
      const eliminadas = new Set(ids)
      const [otras] = await db.query<RowDataPacket[]>(`SELECT id,dependencias FROM cliente_cronograma_tareas
        WHERE cliente_id=? AND (servicio_id IS NULL OR servicio_id<>?)`, [clienteId, servicioId])
      for (const t of otras) {
        const dependencias = typeof t.dependencias === 'string' ? JSON.parse(t.dependencias) : (t.dependencias ?? [])
        if (!Array.isArray(dependencias) || !dependencias.some((d: number) => eliminadas.has(Number(d)))) continue
        const filtradas = dependencias.filter((d: number) => !eliminadas.has(Number(d)))
        await db.query('UPDATE cliente_cronograma_tareas SET dependencias=?,revision=revision+1 WHERE id=? AND cliente_id=?', [JSON.stringify(filtradas), t.id, clienteId])
      }
      await db.query('DELETE FROM cliente_cronograma_tareas WHERE cliente_id=? AND servicio_id=?', [clienteId, servicioId])
    }
    const [cliente] = await db.query<RowDataPacket[]>('SELECT horas_contratadas FROM clientes WHERE id=?', [clienteId])
    await db.query('DELETE FROM presupuesto_servicios WHERE id=? AND presupuesto_id=?', [servicioId, presupuestoId])
    const horasContratadas = await recalcularHorasContratadas(db, clienteId)
    await db.query(`INSERT INTO auditoria (empresa_id,usuario_id,accion,entidad,entidad_id,antes,despues,ip)
      VALUES (?,?,'SERVICIO_PRESUPUESTO_ELIMINAR','clientes',?,?,?,?)`,
    [contexto.empresaId, contexto.usuarioId, clienteId,
      JSON.stringify({ servicioId, nombre: servicio.nombre, origen: servicio.origen, tareasEliminadas: ids.length, horasContratadasAntes: Number(cliente[0]?.horas_contratadas ?? 0) }),
      JSON.stringify({ horasContratadas }), contexto.ip])
    await db.commit()
    return { ok: true, tareasEliminadas: ids.length, horasContratadas }
  } catch (error) { await db.rollback(); throw error } finally { db.release() }
}
