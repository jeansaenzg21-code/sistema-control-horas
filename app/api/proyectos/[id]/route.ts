import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { RowDataPacket } from 'mysql2/promise'
import { esAdministrador } from '@/lib/permisos'
import {
  getProyectoContexto,
  obtenerProyectoRow,
  obtenerParticipantes,
  puedeAccederProyecto,
  puedeEditarProyecto,
  proyectosDisponibles,
  serializarProyecto,
  normalizarFechaSQL,
  type EstadoProyecto,
} from '@/lib/proyectos'

const ESTADOS = new Set<EstadoProyecto>(['PLANIFICACION', 'EN_CURSO', 'PAUSADO', 'COMPLETADO', 'CANCELADO'])

function idValido(valor: unknown): number | null {
  if (valor == null || valor === '') return null
  const id = Number(valor)
  return Number.isInteger(id) && id > 0 ? id : null
}

function fechaValida(valor: unknown): string | null {
  if (valor == null || valor === '') return null
  const fecha = String(valor)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const comprobacion = new Date(Date.UTC(anio, mes - 1, dia))
  if (comprobacion.getUTCFullYear() !== anio || comprobacion.getUTCMonth() !== mes - 1 || comprobacion.getUTCDate() !== dia) return null
  return fecha
}

async function obtenerDetalle(proyectoId: number, empresaId: number) {
  const row = await obtenerProyectoRow(proyectoId, empresaId)
  if (!row) return null
  const [areasRows] = await pool.query(
    `SELECT ar.id, ar.nombre
     FROM proyecto_areas pa
     INNER JOIN areas ar ON ar.id = pa.area_id
     WHERE pa.proyecto_id = ?
       AND ar.empresa_id = (SELECT p.empresa_id FROM proyectos p WHERE p.id = pa.proyecto_id)
     ORDER BY ar.nombre`,
    [proyectoId]
  )
  const [activitiesRows] = await pool.query(
    `SELECT a.id, a.usuario_id, u.nombre AS usuario_nombre, a.descripcion, a.estado,
            a.inicio, a.fin,
             COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, p.fin))
               FROM pausas p WHERE p.actividad_id = a.id AND p.fin IS NOT NULL), 0) AS pausa_segundos,
             CASE
               WHEN a.fin IS NOT NULL THEN TIMESTAMPDIFF(SECOND, a.inicio, a.fin)
               WHEN a.estado = 'PAUSADA' THEN TIMESTAMPDIFF(SECOND, a.inicio, COALESCE(
                 (SELECT MAX(p.inicio) FROM pausas p WHERE p.actividad_id = a.id AND p.fin IS NULL),
                 a.inicio
               ))
               ELSE TIMESTAMPDIFF(SECOND, a.inicio, NOW())
             END AS duracion_bruta_segundos
     FROM actividades a
     INNER JOIN usuarios u ON u.id = a.usuario_id
     INNER JOIN areas ar ON ar.id = u.area_id
     INNER JOIN proyectos pr ON pr.id = a.proyecto_id AND pr.empresa_id = ?
     WHERE a.proyecto_id = ? AND ar.empresa_id = ?
     ORDER BY a.inicio DESC
     LIMIT 100`,
    [empresaId, proyectoId, empresaId]
  )
  const actividades = (activitiesRows as Array<Record<string, unknown>>).map((rowActividad) => ({
    id: Number(rowActividad.id),
    usuario_id: Number(rowActividad.usuario_id),
    usuario_nombre: String(rowActividad.usuario_nombre),
    descripcion: rowActividad.descripcion == null ? null : String(rowActividad.descripcion),
    estado: String(rowActividad.estado),
    inicio: normalizarFechaSQL(rowActividad.inicio) || String(rowActividad.inicio),
    fin: normalizarFechaSQL(rowActividad.fin),
    duracion_segundos: Math.max(0, Number(rowActividad.duracion_bruta_segundos ?? 0) - Number(rowActividad.pausa_segundos ?? 0)),
  }))
  return {
    ...serializarProyecto(row),
    participantes: await obtenerParticipantes(proyectoId),
    areas_detalle: (areasRows as Array<{ id: number; nombre: string }>).map((area) => ({ id: Number(area.id), nombre: String(area.nombre) })),
    actividades,
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await getProyectoContexto(request)
    if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
    if (!(await proyectosDisponibles())) return NextResponse.json({ error: 'Falta aplicar la migración de proyectos.' }, { status: 503 })
    const id = idValido((await params).id)
    if (id == null) return NextResponse.json({ error: 'Proyecto no válido.' }, { status: 400 })
    if (!(await puedeAccederProyecto(context.user, id, context.empresaId))) {
      return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 })
    }
    const detalle = await obtenerDetalle(id, context.empresaId)
    if (!detalle) return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 })
    return NextResponse.json(detalle)
  } catch (error) {
    console.error('Error al obtener proyecto:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await getProyectoContexto(request)
    if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
    if (!(await proyectosDisponibles())) return NextResponse.json({ error: 'Falta aplicar la migración de proyectos.' }, { status: 503 })
    const id = idValido((await params).id)
    if (id == null) return NextResponse.json({ error: 'Proyecto no válido.' }, { status: 400 })
    if (!(await puedeEditarProyecto(context.user, id, context.empresaId))) {
      return NextResponse.json({ error: 'No autorizado para editar este proyecto.' }, { status: 403 })
    }
    const proyectoActual = await obtenerProyectoRow(id, context.empresaId)
    if (!proyectoActual) return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const campos: string[] = []
    const valores: Array<string | number | null> = []
    let jefeParaSincronizar: number | null = null
    if (body.nombre !== undefined) {
      const nombre = String(body.nombre ?? '').trim()
      if (!nombre || nombre.length > 200) return NextResponse.json({ error: 'El nombre no es válido.' }, { status: 400 })
      campos.push('nombre = ?')
      valores.push(nombre)
    }
    if (body.descripcion !== undefined) {
      const descripcion = String(body.descripcion ?? '').trim() || null
      if (descripcion && descripcion.length > 5000) return NextResponse.json({ error: 'La descripción es demasiado larga.' }, { status: 400 })
      campos.push('descripcion = ?')
      valores.push(descripcion)
    }
    if (body.estado !== undefined) {
      const estado = String(body.estado).toUpperCase() as EstadoProyecto
      if (!ESTADOS.has(estado)) return NextResponse.json({ error: 'El estado no es válido.' }, { status: 400 })
      campos.push('estado = ?')
      valores.push(estado)
    }
    if (body.fecha_inicio !== undefined) {
      const fecha = fechaValida(body.fecha_inicio)
      if (body.fecha_inicio && !fecha) return NextResponse.json({ error: 'La fecha de inicio no es válida.' }, { status: 400 })
      campos.push('fecha_inicio = ?')
      valores.push(fecha)
    }
    if (body.fecha_fin !== undefined) {
      const fecha = fechaValida(body.fecha_fin)
      if (body.fecha_fin && !fecha) return NextResponse.json({ error: 'La fecha de fin no es válida.' }, { status: 400 })
      campos.push('fecha_fin = ?')
      valores.push(fecha)
    }
    if (body.cliente_id !== undefined) {
      const clienteId = idValido(body.cliente_id)
      if (body.cliente_id != null && body.cliente_id !== '' && clienteId == null) {
        return NextResponse.json({ error: 'El cliente seleccionado no es válido.' }, { status: 400 })
      }
      if (clienteId != null) {
        const [clienteRows] = await pool.query(
           `SELECT c.id FROM clientes c
            INNER JOIN areas ar ON ar.id = c.area_id
            WHERE c.id = ? AND ar.empresa_id = ? AND c.activo = TRUE`,
          [clienteId, context.empresaId]
        )
        if ((clienteRows as unknown[]).length === 0) return NextResponse.json({ error: 'El cliente no pertenece a la empresa.' }, { status: 400 })
      }
      campos.push('cliente_id = ?')
      valores.push(clienteId)
    }
    if (body.jefe_id !== undefined) {
      if (!esAdministrador(context.user)) return NextResponse.json({ error: 'Sólo administración puede cambiar el jefe del proyecto.' }, { status: 403 })
      const jefeId = idValido(body.jefe_id)
      if (jefeId == null) return NextResponse.json({ error: 'El jefe del proyecto no es válido.' }, { status: 400 })
      const [jefeRows] = await pool.query(
        `SELECT u.id FROM usuarios u INNER JOIN areas ar ON ar.id = u.area_id
         WHERE u.id = ? AND u.rol = 'JEFE_AREA' AND u.activo = TRUE AND ar.activo = TRUE AND ar.empresa_id = ?`,
        [jefeId, context.empresaId]
      )
      if ((jefeRows as unknown[]).length === 0) return NextResponse.json({ error: 'El jefe no es un perfil válido.' }, { status: 400 })
      campos.push('jefe_id = ?')
      valores.push(jefeId)
      jefeParaSincronizar = jefeId === Number(proyectoActual.jefe_id) ? null : jefeId
    }
    const inicioFinal = body.fecha_inicio !== undefined
      ? fechaValida(body.fecha_inicio)
      : normalizarFechaSQL(proyectoActual.fecha_inicio)
    const finFinal = body.fecha_fin !== undefined
      ? fechaValida(body.fecha_fin)
      : normalizarFechaSQL(proyectoActual.fecha_fin)
    if (inicioFinal && finFinal && finFinal < inicioFinal) {
      return NextResponse.json({ error: 'La fecha de fin no puede ser anterior a la fecha de inicio.' }, { status: 400 })
    }
    if (campos.length === 0) return NextResponse.json({ error: 'No hay cambios para guardar.' }, { status: 400 })

    const conexion = await pool.getConnection()
    try {
      await conexion.beginTransaction()
      await conexion.query(`UPDATE proyectos SET ${campos.join(', ')} WHERE id = ? AND empresa_id = ? AND activo = TRUE`, [...valores, id, context.empresaId])
      if (jefeParaSincronizar != null) {
        const [areaRows] = await conexion.query<RowDataPacket[]>(
          'SELECT area_id FROM usuarios WHERE id = ? AND activo = TRUE LIMIT 1',
          [jefeParaSincronizar]
        )
        const areaId = areaRows[0]?.area_id == null ? null : Number(areaRows[0].area_id)
        if (areaId == null) throw new Error('El nuevo jefe no tiene una división activa.')
        await conexion.query(
          `UPDATE proyecto_participantes SET rol_proyecto = 'COLABORADOR'
           WHERE proyecto_id = ? AND usuario_id = ? AND rol_proyecto = 'LIDER'`,
          [id, Number(proyectoActual.jefe_id)]
        )
        await conexion.query(
          `INSERT INTO proyecto_participantes (proyecto_id, usuario_id, rol_proyecto)
           VALUES (?, ?, 'LIDER')
           ON DUPLICATE KEY UPDATE rol_proyecto = 'LIDER'`,
          [id, jefeParaSincronizar]
        )
        await conexion.query('INSERT IGNORE INTO proyecto_areas (proyecto_id, area_id) VALUES (?, ?)', [id, areaId])
      }
      await conexion.commit()
    } catch (error) {
      await conexion.rollback()
      throw error
    } finally {
      conexion.release()
    }
    const detalle = await obtenerDetalle(id, context.empresaId)
    return NextResponse.json({ proyecto: detalle })
  } catch (error) {
    console.error('Error al actualizar proyecto:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await getProyectoContexto(request)
    if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
    if (!esAdministrador(context.user)) return NextResponse.json({ error: 'Sólo administración puede eliminar proyectos.' }, { status: 403 })
    if (!(await proyectosDisponibles())) return NextResponse.json({ error: 'Falta aplicar la migración de proyectos.' }, { status: 503 })
    const id = idValido((await params).id)
    if (id == null) return NextResponse.json({ error: 'Proyecto no válido.' }, { status: 400 })
    const [result] = await pool.query(
      'UPDATE proyectos SET activo = FALSE WHERE id = ? AND empresa_id = ? AND activo = TRUE',
      [id, context.empresaId]
    )
    if (Number((result as { affectedRows: number }).affectedRows) === 0) return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar proyecto:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
