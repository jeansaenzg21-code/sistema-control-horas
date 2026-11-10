import type { RowDataPacket, ResultSetHeader } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import pool from '@/lib/db'
import { invalidarEsquema, tablaExiste } from '@/lib/esquema'
import { descendientes, ErrorPlanificacion, validarGrafo } from '@/lib/planificacion/modelo'
import { estadoPlanificado, progresoPlanificado } from '@/lib/planificacion/fechas'
import type { ConfiguracionCronograma, EntradaTareaCronograma, TareaCronograma } from '@/lib/planificacion/modelo'
export type { ConfiguracionCronograma, EntradaTareaCronograma, TareaCronograma } from '@/lib/planificacion/modelo'

const TABLA = 'cliente_cronograma_tareas'
const CONFIG = 'cliente_cronograma_config'
const globalPlan = globalThis as unknown as { __editorPlanV2?: Promise<void> }

/** Ampliación compatible y repetible. No toca presupuestos ni actividades operativas. */
export async function asegurarEsquemaPlanificacion(): Promise<void> {
  if (!globalPlan.__editorPlanV2) globalPlan.__editorPlanV2 = (async () => {
    // Lock de esquema entre workers: evita dos ALTER simultáneos en el primer acceso.
    const db = await pool.getConnection()
    let bloqueado = false
    try {
      const [lock] = await db.query<RowDataPacket[]>("SELECT GET_LOCK('pc_editor_plan_v2', 30) AS ok")
      if (Number(lock[0].ok) !== 1) throw new Error('No se pudo bloquear el esquema de planificación.')
      bloqueado = true
      await db.query(`CREATE TABLE IF NOT EXISTS ${TABLA} (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        cliente_id INT UNSIGNED NOT NULL, servicio_id INT UNSIGNED NULL, servicio_nombre VARCHAR(200) NULL,
        etapa VARCHAR(120) NULL, nombre VARCHAR(200) NOT NULL,
        fecha_inicio DATE NULL, fecha_fin DATE NULL, horas DECIMAL(10,2) NOT NULL DEFAULT 0,
        progreso TINYINT UNSIGNED NOT NULL DEFAULT 0, notas VARCHAR(500) NULL,
        orden INT NOT NULL DEFAULT 0, creado_por INT UNSIGNED NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_cct_cliente_fecha (cliente_id, fecha_inicio),
        CONSTRAINT fk_cct_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
      const [columnas] = await db.query<RowDataPacket[]>(`SHOW COLUMNS FROM ${TABLA}`)
      const existentes = new Map(columnas.map(c => [String(c.Field), c]))
      const nuevas: Record<string, string> = {
        servicio_id: 'INT UNSIGNED NULL', servicio_nombre: 'VARCHAR(200) NULL',
        padre_id: 'INT UNSIGNED NULL', responsable_id: 'INT UNSIGNED NULL',
        estado: 'VARCHAR(20) NULL', dependencias: 'JSON NULL',
        revision: 'INT UNSIGNED NOT NULL DEFAULT 0', clave_creacion: 'VARCHAR(36) NULL',
      }
      const cambios = Object.entries(nuevas).filter(([c]) => !existentes.has(c)).map(([c, tipo]) => `ADD COLUMN ${c} ${tipo}`)
      for (const c of ['fecha_inicio', 'fecha_fin']) if (existentes.get(c)?.Null === 'NO') cambios.push(`MODIFY COLUMN ${c} DATE NULL`)
      if (cambios.length) await db.query(`ALTER TABLE ${TABLA} ${cambios.join(', ')}`)
      const [indices] = await db.query<RowDataPacket[]>(`SHOW INDEX FROM ${TABLA} WHERE Key_name = 'uq_cct_creacion'`)
      if (!indices.length) await db.query(`ALTER TABLE ${TABLA} ADD UNIQUE KEY uq_cct_creacion (cliente_id, clave_creacion)`)
      await db.query(`CREATE TABLE IF NOT EXISTS ${CONFIG} (
        cliente_id INT UNSIGNED NOT NULL PRIMARY KEY, fecha_inicio DATE NOT NULL,
        meses TINYINT UNSIGNED NOT NULL DEFAULT 6, creado_por INT UNSIGNED NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_ccc_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
      invalidarEsquema()
    } finally {
      if (bloqueado) await db.query("SELECT RELEASE_LOCK('pc_editor_plan_v2')")
      db.release()
    }
  })().catch(error => { globalPlan.__editorPlanV2 = undefined; throw error })
  return globalPlan.__editorPlanV2
}

function convertir(f: RowDataPacket): TareaCronograma {
  const fechaInicio = f.inicio ?? null, fechaFin = f.fin ?? null
  return {
    id: Number(f.id), servicioId: f.servicio_id == null ? null : Number(f.servicio_id), servicioNombre: f.servicio_nombre,
    padreId: f.padre_id == null ? null : Number(f.padre_id), nombre: f.nombre, etapa: f.etapa,
    fechaInicio, fechaFin, horas: Number(f.horas),
    progreso: progresoPlanificado(fechaInicio, fechaFin),
    estado: estadoPlanificado(fechaInicio, fechaFin),
    responsableId: f.responsable_id == null ? null : Number(f.responsable_id),
    dependencias: typeof f.dependencias === 'string' ? JSON.parse(f.dependencias) : (f.dependencias ?? []),
    notas: f.notas, orden: Number(f.orden), revision: Number(f.revision),
  }
}
async function leer(db: PoolConnection | typeof pool, clienteId: number): Promise<TareaCronograma[]> {
  const [filas] = await db.query<RowDataPacket[]>(`SELECT *, DATE_FORMAT(fecha_inicio, '%Y-%m-%d') inicio,
    DATE_FORMAT(fecha_fin, '%Y-%m-%d') fin FROM ${TABLA} WHERE cliente_id=? ORDER BY orden,id`, [clienteId])
  return filas.map(convertir)
}
export async function listarCronogramaCliente(clienteId: number) {
  if (!(await tablaExiste(TABLA))) return []
  await asegurarEsquemaPlanificacion()
  return leer(pool, clienteId)
}

type ContextoAuditoria = { usuarioId: number; empresaId: number; ip: string | null }
async function transaccion<T>(clienteId: number, trabajo: (db: PoolConnection, tareas: TareaCronograma[]) => Promise<T>): Promise<T> {
  await asegurarEsquemaPlanificacion()
  const db = await pool.getConnection()
  try {
    await db.beginTransaction()
    // Serializa el grafo completo por cliente, incluidas creación y eliminación.
    await db.query('SELECT id FROM clientes WHERE id=? FOR UPDATE', [clienteId])
    const resultado = await trabajo(db, await leer(db, clienteId))
    await db.commit()
    return resultado
  } catch (error) { await db.rollback(); throw error } finally { db.release() }
}
async function auditar(db: PoolConnection, contexto: ContextoAuditoria, clienteId: number, accion: string, antes: unknown, despues: unknown) {
  await db.query(`INSERT INTO auditoria (empresa_id,usuario_id,accion,entidad,entidad_id,antes,despues,ip)
    VALUES (?,?,?,'cliente_cronograma_tareas',?,?,?,?)`,
  [contexto.empresaId, contexto.usuarioId, accion, clienteId, JSON.stringify(antes), JSON.stringify(despues), contexto.ip])
}
async function validarReferencias(db: PoolConnection, clienteId: number, t: EntradaTareaCronograma) {
  if (t.servicioId !== null) {
    const [s] = await db.query<RowDataPacket[]>(`SELECT s.nombre FROM presupuesto_servicios s JOIN presupuestos p ON p.id=s.presupuesto_id
      WHERE s.id=? AND p.cliente_id=? AND s.origen<>'CONSOLIDADO'`, [t.servicioId, clienteId])
    if (!s.length) throw new ErrorPlanificacion('El servicio no pertenece a este cliente.')
    t.servicioNombre = String(s[0].nombre)
  } else t.servicioNombre = null
  if (t.responsableId !== null) {
    const [u] = await db.query<RowDataPacket[]>(`SELECT u.id FROM usuarios u JOIN areas a ON a.id=u.area_id
      JOIN clientes c ON c.id=? JOIN areas ca ON ca.id=c.area_id
      WHERE u.id=? AND u.activo=TRUE AND a.empresa_id=ca.empresa_id AND u.rol IN ('PERSONAL','SUPERVISOR','JEFE_AREA')`, [clienteId, t.responsableId])
    if (!u.length) throw new ErrorPlanificacion('El responsable debe ser personal activo de esta empresa.')
  }
}
const campos = 'servicio_id=?,servicio_nombre=?,padre_id=?,nombre=?,etapa=?,fecha_inicio=?,fecha_fin=?,horas=?,progreso=?,estado=?,responsable_id=?,dependencias=?,notas=?,orden=?'
function valores(t: TareaCronograma) {
  return [t.servicioId, t.servicioNombre, t.padreId, t.nombre, t.etapa, t.fechaInicio, t.fechaFin, t.horas, t.progreso, t.estado, t.responsableId, JSON.stringify(t.dependencias), t.notas, t.orden]
}

export async function crearTareasCronograma(clienteId: number, entradas: EntradaTareaCronograma[], contexto: ContextoAuditoria) {
  return transaccion(clienteId, async (db, tareas) => {
    let orden = Math.max(0, ...tareas.map(t => t.orden))
    const ids: number[] = []
    const nuevas: TareaCronograma[] = []
    for (const entrada of entradas) {
      if (entrada.claveCreacion) {
        const [previas] = await db.query<RowDataPacket[]>(`SELECT id FROM ${TABLA} WHERE cliente_id=? AND clave_creacion=?`, [clienteId, entrada.claveCreacion])
        if (previas.length) { ids.push(Number(previas[0].id)); continue }
      }
      await validarReferencias(db, clienteId, entrada)
      const tarea: TareaCronograma = { ...entrada, id: -1, orden: ++orden, revision: 0 }
      validarGrafo([...tareas, ...nuevas, tarea])
      const [r] = await db.query<ResultSetHeader>(`INSERT INTO ${TABLA} SET cliente_id=?,${campos},creado_por=?,clave_creacion=?`, [clienteId, ...valores(tarea), contexto.usuarioId, entrada.claveCreacion ?? null])
      tarea.id = r.insertId
      ids.push(tarea.id); nuevas.push(tarea)
    }
    if (nuevas.length) await auditar(db, contexto, clienteId, 'CRONOGRAMA_CREAR', null, nuevas)
    return { ids, tareas: await leer(db, clienteId) }
  })
}

export async function actualizarTareaCronograma(clienteId: number, id: number, entrada: EntradaTareaCronograma, revision: number, antesDe: number | null | undefined, contexto: ContextoAuditoria) {
  return transaccion(clienteId, async (db, tareas) => {
    const anterior = tareas.find(t => t.id === id)
    if (!anterior) throw new ErrorPlanificacion('La actividad ya no existe.', 404)
    if (anterior.revision !== revision) throw new ErrorPlanificacion('Otra sesión modificó esta actividad. Recarga el cronograma antes de volver a editar.', 409)
    await validarReferencias(db, clienteId, entrada)
    const nueva = { ...anterior, ...entrada, revision: anterior.revision + 1 }
    const hijos = descendientes(tareas, id)
    let resultado = tareas.map(t => t.id === id ? nueva : hijos.has(t.id) && t.servicioId !== nueva.servicioId
      ? { ...t, servicioId: nueva.servicioId, servicioNombre: nueva.servicioNombre, revision: t.revision + 1 } : t)
    if (antesDe !== undefined || anterior.padreId !== nueva.padreId || anterior.servicioId !== nueva.servicioId) {
      const hermanos = resultado.filter(t => t.id !== id && t.padreId === nueva.padreId && t.servicioId === nueva.servicioId)
      const posicion = antesDe == null ? hermanos.length : hermanos.findIndex(t => t.id === antesDe)
      if (posicion < 0) throw new ErrorPlanificacion('El destino de ordenación ya no está disponible.')
      hermanos.splice(posicion, 0, nueva)
      const ordenes = new Map(hermanos.map((t, i) => [t.id, i + 1]))
      resultado = resultado.map(t => ordenes.has(t.id) ? { ...t, orden: ordenes.get(t.id)!, revision: t.id === id ? t.revision : t.revision + 1 } : t)
    }
    validarGrafo(resultado)
    for (const t of resultado) if (t !== tareas.find(x => x.id === t.id)) {
      await db.query(`UPDATE ${TABLA} SET ${campos},revision=? WHERE id=? AND cliente_id=?`, [...valores(t), t.revision, t.id, clienteId])
    }
    await auditar(db, contexto, clienteId, 'CRONOGRAMA_ACTUALIZAR', anterior, resultado.find(t => t.id === id))
    return leer(db, clienteId)
  })
}

/** Elimina solo la elegida: promueve sus hijos y retira los enlaces entrantes. */
export async function eliminarTareaCronograma(clienteId: number, id: number, revision: number, contexto: ContextoAuditoria) {
  return transaccion(clienteId, async (db, tareas) => {
    const anterior = tareas.find(t => t.id === id)
    if (!anterior) return tareas // Reintento de una eliminación ya confirmada.
    if (anterior.revision !== revision) throw new ErrorPlanificacion('La actividad cambió en otra sesión. Recarga antes de eliminar.', 409)
    for (const t of tareas) if (t.padreId === id || t.dependencias.includes(id)) {
      await db.query(`UPDATE ${TABLA} SET padre_id=?,dependencias=?,revision=revision+1 WHERE id=? AND cliente_id=?`,
        [t.padreId === id ? anterior.padreId : t.padreId, JSON.stringify(t.dependencias.filter(d => d !== id)), t.id, clienteId])
    }
    await db.query(`DELETE FROM ${TABLA} WHERE id=? AND cliente_id=?`, [id, clienteId])
    await auditar(db, contexto, clienteId, 'CRONOGRAMA_ELIMINAR', anterior, null)
    return leer(db, clienteId)
  })
}

export async function leerConfiguracionCronograma(clienteId: number): Promise<ConfiguracionCronograma | null> {
  if (!(await tablaExiste(CONFIG))) return null
  const [filas] = await pool.query<RowDataPacket[]>(`SELECT DATE_FORMAT(fecha_inicio,'%Y-%m-%d') inicio,meses FROM ${CONFIG} WHERE cliente_id=?`, [clienteId])
  return filas[0] ? { fechaInicio: String(filas[0].inicio), meses: Number(filas[0].meses) } : null
}
export async function guardarConfiguracionCronograma(clienteId: number, config: ConfiguracionCronograma, contexto: ContextoAuditoria) {
  return transaccion(clienteId, async db => {
    await db.query(`INSERT INTO ${CONFIG} (cliente_id,fecha_inicio,meses,creado_por) VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE fecha_inicio=VALUES(fecha_inicio),meses=VALUES(meses)`, [clienteId, config.fechaInicio, config.meses, contexto.usuarioId])
    await auditar(db, contexto, clienteId, 'CRONOGRAMA_CONFIGURAR', null, config)
    return config
  })
}
