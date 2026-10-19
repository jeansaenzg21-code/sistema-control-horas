import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { esAdministrador, esJefeDeArea } from '@/lib/permisos'
import {
  getProyectoContexto,
  obtenerProyectoRow,
  proyectosDisponibles,
  serializarProyecto,
  type EstadoProyecto,
  type RolProyecto,
} from '@/lib/proyectos'

const ESTADOS = new Set<EstadoProyecto>(['PLANIFICACION', 'EN_CURSO', 'PAUSADO', 'COMPLETADO', 'CANCELADO'])
const ROLES = new Set<RolProyecto>(['LIDER', 'COORDINADOR', 'ESPECIALISTA', 'COLABORADOR'])

function idPositivo(valor: unknown): number | null {
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

function participantesBody(valor: unknown): Array<{ usuario_id: number; rol_proyecto: RolProyecto }> {
  if (!Array.isArray(valor)) return []
  const resultado: Array<{ usuario_id: number; rol_proyecto: RolProyecto }> = []
  const ids = new Set<number>()
  for (const item of valor) {
    const objeto: Record<string, unknown> = typeof item === 'object' && item !== null
      ? item as Record<string, unknown>
      : { usuario_id: item }
    const usuarioId = idPositivo(objeto.usuario_id)
    if (usuarioId == null || ids.has(usuarioId)) continue
    const rol = String(objeto.rol_proyecto ?? 'COLABORADOR').toUpperCase() as RolProyecto
    ids.add(usuarioId)
    resultado.push({ usuario_id: usuarioId, rol_proyecto: ROLES.has(rol) ? rol : 'COLABORADOR' })
  }
  return resultado
}

export async function GET(request: Request) {
  try {
    const context = await getProyectoContexto(request)
    if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
    if (!(await proyectosDisponibles())) {
      return NextResponse.json({ error: 'Falta aplicar la migración de proyectos. Ejecuta sql/proyectos.sql.' }, { status: 503 })
    }

    const admin = esAdministrador(context.user)
    const condiciones = ['p.empresa_id = ?', 'p.activo = TRUE']
    const params: Array<number> = [context.empresaId]
    if (!admin) {
      // Todas las vías de acceso van en el MISMO grupo OR. Si la del jefe de
      // área se añadiera como una condición AND aparte, el bloque de jefe del
      // proyecto seguiría exigiendo participación y la dejaría anulada.
      const vias: string[] = ['p.jefe_id = ?']
      params.push(context.user.id)
      vias.push(`EXISTS (
        SELECT 1 FROM proyecto_participantes acceso
        WHERE acceso.proyecto_id = p.id AND acceso.usuario_id = ?
      )`)
      params.push(context.user.id)
      // El jefe del área tiene que ver los proyectos de SUS clientes: es quien
      // importa y revisa su presupuesto. Sin esta vía, la ficha del cliente le
      // llegaba sin ningún proyecto y el selector quedaba vacío.
      if (context.user.area_id) {
        vias.push(`EXISTS (
          SELECT 1 FROM clientes c
           WHERE c.id = p.cliente_id AND c.area_id = ? AND c.activo = TRUE
        )`)
        params.push(context.user.area_id)
      }
      condiciones.push(`(${vias.join(' OR ')})`)
    }

    // Filtro opcional por cliente, para la ficha del cliente. Se aplica en SQL
    // y no en el cliente: si no, un administrador recibiría los proyectos de
    // todos sus clientes para descartar después los que no le interesan.
    const url = new URL(request.url)
    const clienteIdParam = url.searchParams.get('cliente_id')
    if (clienteIdParam != null && clienteIdParam !== '') {
      const clienteId = Number(clienteIdParam)
      if (!Number.isInteger(clienteId) || clienteId <= 0) {
        return NextResponse.json({ error: 'El cliente no es valido.' }, { status: 400 })
      }
      condiciones.push('p.cliente_id = ?')
      params.push(clienteId)
    }

    const [rows] = await pool.query(
      `SELECT p.id, p.empresa_id, p.cliente_id, c.nombre AS cliente_nombre,
              p.jefe_id, jefe.nombre AS jefe_nombre, p.nombre, p.descripcion, p.estado,
              p.fecha_inicio, p.fecha_fin, p.activo, p.created_at, p.updated_at,
              (SELECT COUNT(*) FROM proyecto_participantes pp WHERE pp.proyecto_id = p.id) AS participantes_count,
              (SELECT GROUP_CONCAT(ar.nombre ORDER BY ar.nombre SEPARATOR ', ')
               FROM proyecto_areas pa INNER JOIN areas ar ON ar.id = pa.area_id
               WHERE pa.proyecto_id = p.id) AS areas
       FROM proyectos p
       LEFT JOIN clientes c ON c.id = p.cliente_id
         AND c.area_id IN (SELECT ar_empresa.id FROM areas ar_empresa WHERE ar_empresa.empresa_id = p.empresa_id)
       INNER JOIN usuarios jefe ON jefe.id = p.jefe_id
       INNER JOIN areas jefe_area ON jefe_area.id = jefe.area_id AND jefe_area.empresa_id = p.empresa_id
       WHERE ${condiciones.join(' AND ')}
       ORDER BY FIELD(p.estado, 'EN_CURSO', 'PLANIFICACION', 'PAUSADO', 'COMPLETADO', 'CANCELADO'), p.updated_at DESC`,
      params
    )
    return NextResponse.json((rows as Array<Record<string, unknown>>).map(serializarProyecto))
  } catch (error) {
    console.error('Error al obtener proyectos:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const context = await getProyectoContexto(request)
    if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
    if (!(await proyectosDisponibles())) {
      return NextResponse.json({ error: 'Falta aplicar la migración de proyectos. Ejecuta sql/proyectos.sql.' }, { status: 503 })
    }

    const admin = esAdministrador(context.user)
    const jefe = esJefeDeArea(context.user)
    if (!admin && !jefe) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const nombre = String(body.nombre ?? '').trim()
    const descripcion = String(body.descripcion ?? '').trim() || null
    const estadoCrudo = String(body.estado ?? 'PLANIFICACION').toUpperCase() as EstadoProyecto
    const clienteId = idPositivo(body.cliente_id)
    if (body.cliente_id != null && body.cliente_id !== '' && clienteId == null) {
      return NextResponse.json({ error: 'El cliente seleccionado no es válido.' }, { status: 400 })
    }
    const fechaInicio = fechaValida(body.fecha_inicio)
    const fechaFin = fechaValida(body.fecha_fin)
    const jefeId = jefe ? context.user.id : idPositivo(body.jefe_id)

    if (!nombre || nombre.length > 200) {
      return NextResponse.json({ error: 'El nombre del proyecto es obligatorio y debe tener hasta 200 caracteres.' }, { status: 400 })
    }
    if (descripcion && descripcion.length > 5000) {
      return NextResponse.json({ error: 'La descripción no puede superar 5000 caracteres.' }, { status: 400 })
    }
    if (!ESTADOS.has(estadoCrudo)) {
      return NextResponse.json({ error: 'El estado del proyecto no es válido.' }, { status: 400 })
    }
    if (jefeId == null) {
      return NextResponse.json({ error: 'Selecciona un jefe de área para el proyecto.' }, { status: 400 })
    }
    if (body.fecha_inicio != null && body.fecha_inicio !== '' && !fechaInicio) {
      return NextResponse.json({ error: 'La fecha de inicio no es válida.' }, { status: 400 })
    }
    if (body.fecha_fin != null && body.fecha_fin !== '' && !fechaFin) {
      return NextResponse.json({ error: 'La fecha de fin no es válida.' }, { status: 400 })
    }
    if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
      return NextResponse.json({ error: 'La fecha de fin no puede ser anterior a la fecha de inicio.' }, { status: 400 })
    }

    const [liderRows] = await pool.query(
      `SELECT u.id
       FROM usuarios u
       INNER JOIN areas ar ON ar.id = u.area_id
       WHERE u.id = ? AND u.rol = 'JEFE_AREA' AND u.activo = TRUE AND ar.activo = TRUE AND ar.empresa_id = ?
       LIMIT 1`,
      [jefeId, context.empresaId]
    )
    if ((liderRows as unknown[]).length === 0) {
      return NextResponse.json({ error: 'El jefe debe ser un perfil Jefe de área activo de la empresa.' }, { status: 400 })
    }

    if (clienteId != null) {
      const [clienteRows] = await pool.query(
        `SELECT c.id FROM clientes c
         INNER JOIN areas ar ON ar.id = c.area_id
         WHERE c.id = ? AND ar.empresa_id = ? AND c.activo = TRUE LIMIT 1`,
        [clienteId, context.empresaId]
      )
      if ((clienteRows as unknown[]).length === 0) {
        return NextResponse.json({ error: 'El cliente no pertenece a la empresa activa.' }, { status: 400 })
      }
    }

    const participantes = participantesBody(body.participantes)
    const indiceLider = participantes.findIndex((participante) => participante.usuario_id === jefeId)
    if (indiceLider >= 0) {
      participantes[indiceLider].rol_proyecto = 'LIDER'
    } else {
      participantes.unshift({ usuario_id: jefeId, rol_proyecto: 'LIDER' })
    }
    for (const participante of participantes) {
      if (participante.usuario_id !== jefeId && participante.rol_proyecto === 'LIDER') {
        participante.rol_proyecto = 'COLABORADOR'
      }
    }
    if (participantes.length === 0) {
      return NextResponse.json({ error: 'Agrega al menos un participante.' }, { status: 400 })
    }

    const ids = participantes.map((participante) => participante.usuario_id)
    const [usuariosRows] = await pool.query(
      `SELECT u.id, u.area_id
       FROM usuarios u
       INNER JOIN areas ar ON ar.id = u.area_id
       WHERE u.id IN (${ids.map(() => '?').join(',')}) AND u.activo = TRUE AND ar.empresa_id = ?`,
      [...ids, context.empresaId]
    )
    const usuarios = usuariosRows as Array<{ id: number; area_id: number }>
    if (usuarios.length !== ids.length) {
      return NextResponse.json({ error: 'Uno o más participantes no están disponibles en la empresa activa.' }, { status: 400 })
    }
    const areaIds = [...new Set(usuarios.map((usuario) => usuario.area_id))]
    const [areasRows] = await pool.query(
      `SELECT id FROM areas WHERE id IN (${areaIds.map(() => '?').join(',')}) AND empresa_id = ? AND activo = TRUE`,
      [...areaIds, context.empresaId]
    )
    if ((areasRows as unknown[]).length !== areaIds.length) {
      return NextResponse.json({ error: 'Una de las áreas participantes no está disponible.' }, { status: 400 })
    }

    const conexion = await pool.getConnection()
    let proyectoId: number
    try {
      await conexion.beginTransaction()
      const [result] = await conexion.query<ResultSetHeader>(
        `INSERT INTO proyectos (empresa_id, cliente_id, jefe_id, nombre, descripcion, estado, fecha_inicio, fecha_fin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [context.empresaId, clienteId, jefeId, nombre, descripcion, estadoCrudo, fechaInicio, fechaFin]
      )
      proyectoId = result.insertId
      for (const areaId of areaIds) {
        await conexion.query('INSERT INTO proyecto_areas (proyecto_id, area_id) VALUES (?, ?)', [proyectoId, areaId])
      }
      for (const participante of participantes) {
        await conexion.query(
          `INSERT INTO proyecto_participantes (proyecto_id, usuario_id, rol_proyecto)
           VALUES (?, ?, ?)`,
          [proyectoId, participante.usuario_id, participante.rol_proyecto]
        )
      }
      await conexion.commit()
    } catch (error) {
      await conexion.rollback()
      throw error
    } finally {
      conexion.release()
    }

    const proyecto = await obtenerProyectoRow(proyectoId, context.empresaId)
    return NextResponse.json({ proyecto: proyecto ? serializarProyecto(proyecto) : null }, { status: 201 })
  } catch (error) {
    console.error('Error al crear proyecto:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
