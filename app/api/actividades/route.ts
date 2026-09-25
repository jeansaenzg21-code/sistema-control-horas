import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { RowDataPacket } from 'mysql2'
import { notifyActivityChange } from '@/lib/events'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { horarioDeHoy, enRangoHorario, minutosAcumuladosHoy, aMinutos } from '@/lib/horarios'
import { esJefeDeArea } from '@/lib/permisos'
import { estructuraProyectosDisponible } from '@/lib/proyectos'

async function tieneColumnaProyecto(): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'actividades'
       AND COLUMN_NAME = 'proyecto_id'`
  )
  return Number(rows[0]?.total ?? 0) > 0
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const { searchParams } = new URL(request.url)
    const usuarioParam = searchParams.get('usuario_id')
    const estado = searchParams.get('estado')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const proyectoParam = searchParams.get('proyecto')
    const tieneProyecto = await tieneColumnaProyecto() && await estructuraProyectosDisponible()
    let proyectoId: number | null = null
    if (proyectoParam != null && proyectoParam !== '') {
      proyectoId = Number(proyectoParam)
      if (!Number.isInteger(proyectoId) || proyectoId <= 0) {
        return NextResponse.json({ error: 'El proyecto indicado no es válido.' }, { status: 400 })
      }
      if (!tieneProyecto) {
        return NextResponse.json({ error: 'La association de actividades con proyectos aún no está disponible.' }, { status: 503 })
      }
    }

    let usuarioId: number | null = null
    if (usuarioParam != null && usuarioParam !== '') {
      usuarioId = Number(usuarioParam)
      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return NextResponse.json({ error: 'El usuario indicado no es válido.' }, { status: 400 })
      }
    }
    if (user.rol === 'PERSONAL') {
      if (usuarioId != null && usuarioId !== user.id) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
      }
      usuarioId = user.id
    } else if (user.rol === 'SUPERVISOR') {
      if (usuarioId != null && usuarioId !== user.id) {
        const [destinos] = await pool.query<RowDataPacket[]>(
          `SELECT u.id
           FROM usuarios u
           INNER JOIN areas ar ON ar.id = u.area_id
           WHERE u.id = ? AND u.supervisor_id = ? AND ar.empresa_id = ?
           LIMIT 1`,
          [usuarioId, user.id, context.activa.id],
        )
        if (destinos.length === 0) {
          return NextResponse.json({ error: 'El colaborador no está asignado a este supervisor.' }, { status: 403 })
        }
      }
    } else if (esJefeDeArea(user)) {
      if (usuarioId != null && usuarioId !== user.id) {
        const [destinos] = await pool.query<RowDataPacket[]>(
          `SELECT u.id
           FROM usuarios u
           INNER JOIN areas ar ON ar.id = u.area_id
           WHERE u.id = ? AND u.area_id = ? AND ar.empresa_id = ?
           LIMIT 1`,
          [usuarioId, user.area_id, context.activa.id],
        )
        if (destinos.length === 0) {
          return NextResponse.json({ error: 'El colaborador no pertenece a tu área.' }, { status: 403 })
        }
      }
    } else if (user.rol !== 'ADMINISTRACION') {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const proyectoCampos = tieneProyecto ? 'a.proyecto_id, pr.nombre AS proyecto_nombre,' : ''
    const proyectoJoin = tieneProyecto ? 'LEFT JOIN proyectos pr ON pr.id = a.proyecto_id AND pr.empresa_id = ar.empresa_id' : ''
    let query = `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
      ${proyectoCampos} a.inicio, a.fin, a.estado, a.revisado_por, a.revisado_en, a.observacion_revision, a.created_at,
      u.nombre AS usuario_nombre, u.cargo, u.especialidad, u.area_id,
      ta.nombre AS tipo_actividad_nombre,
      ar.nombre AS area_nombre,
      c.nombre AS cliente_nombre,
      COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW()))) FROM pausas p WHERE p.actividad_id = a.id), 0) AS pausa_acumulada_segundos,
      CASE
        WHEN a.fin IS NOT NULL THEN TIMESTAMPDIFF(SECOND, a.inicio, a.fin)
        ELSE TIMESTAMPDIFF(SECOND, a.inicio, NOW())
      END AS duracion_segundos
      FROM actividades a
      INNER JOIN usuarios u ON u.id = a.usuario_id
      INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
      INNER JOIN areas ar ON ar.id = u.area_id
      ${proyectoJoin}
      LEFT JOIN clientes c ON c.id = a.cliente_id
      WHERE ar.empresa_id = ?`
    const params: (string | number)[] = [context.activa.id]

    if (usuarioId != null) {
      query += ' AND a.usuario_id = ?'
      params.push(usuarioId)
    } else if (user.rol === 'SUPERVISOR') {
      query += ' AND u.supervisor_id = ?'
      params.push(user.id)
    } else if (esJefeDeArea(user)) {
      query += ' AND u.area_id = ?'
      params.push(user.area_id!)
    }
    if (estado) {
      query += ' AND a.estado = ?'
      params.push(estado)
    }
    if (desde) {
      query += ' AND DATE(a.inicio) >= ?'
      params.push(desde)
    }
    if (hasta) {
      query += ' AND DATE(a.inicio) <= ?'
      params.push(hasta)
    }
    if (proyectoId != null) {
      query += ' AND a.proyecto_id = ?'
      params.push(proyectoId)
    }

    query += ' ORDER BY a.inicio DESC'

    const [rows] = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener actividades:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'El cuerpo de la solicitud no es válido.' }, { status: 400 })
    }
    const { usuario_id, tipo_actividad_id, cliente_id, descripcion, facturable, proyecto_id } = body
    const usuarioObjetivoId = Number(usuario_id)
    const tipoActividadId = Number(tipo_actividad_id)
    const clienteId = cliente_id == null || cliente_id === '' ? null : Number(cliente_id)
    const descripcionTexto = descripcion == null ? null : typeof descripcion === 'string' ? descripcion.trim() || null : undefined
    const tieneProyecto = await tieneColumnaProyecto() && await estructuraProyectosDisponible()
    const proyectoId = proyecto_id == null || proyecto_id === '' ? null : Number(proyecto_id)

    if (descripcionTexto === undefined) {
      return NextResponse.json({ error: 'La descripción no es válida.' }, { status: 400 })
    }
    if (clienteId != null && (!Number.isInteger(clienteId) || clienteId <= 0)) {
      return NextResponse.json({ error: 'El cliente seleccionado no es válido.' }, { status: 400 })
    }
    if (facturable != null && typeof facturable !== 'boolean' && facturable !== 0 && facturable !== 1) {
      return NextResponse.json({ error: 'El valor facturable no es válido.' }, { status: 400 })
    }

    if (proyectoId != null && (!Number.isInteger(proyectoId) || proyectoId <= 0)) {
      return NextResponse.json({ error: 'El proyecto seleccionado no es válido.' }, { status: 400 })
    }
    if (proyectoId != null && !tieneProyecto) {
      return NextResponse.json({ error: 'La asociación de actividades con proyectos aún no está disponible.' }, { status: 503 })
    }

    if (!Number.isInteger(usuarioObjetivoId) || usuarioObjetivoId <= 0 || !Number.isInteger(tipoActividadId) || tipoActividadId <= 0) {
      return NextResponse.json({ error: 'Faltan campos obligatorios.' }, { status: 400 })
    }
    if (user.rol !== 'ADMINISTRACION' && usuarioObjetivoId !== user.id) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const [usuariosValidos] = await pool.query<RowDataPacket[]>(
      `SELECT u.id FROM usuarios u INNER JOIN areas ar ON ar.id = u.area_id
       WHERE u.id = ? AND ar.empresa_id = ? AND u.activo = TRUE`,
      [usuarioObjetivoId, context.activa.id]
    )
    if (usuariosValidos.length === 0) {
      return NextResponse.json({ error: 'El usuario no pertenece a la empresa activa.' }, { status: 400 })
    }

    if (proyectoId != null) {
      const [proyectoValido] = await pool.query<RowDataPacket[]>(
        `SELECT p.id
         FROM proyectos p
         WHERE p.id = ? AND p.empresa_id = ? AND p.activo = TRUE
           AND p.estado IN ('PLANIFICACION', 'EN_CURSO', 'PAUSADO')
           AND (
             p.jefe_id = ?
             OR EXISTS (
               SELECT 1 FROM proyecto_participantes pp
               WHERE pp.proyecto_id = p.id AND pp.usuario_id = ?
             )
           )
         LIMIT 1`,
        [proyectoId, context.activa.id, usuarioObjetivoId, usuarioObjetivoId]
      )
      if (proyectoValido.length === 0) {
        return NextResponse.json({ error: 'El usuario no participa en el proyecto seleccionado.' }, { status: 403 })
      }
    }

    const [tipoValido] = await pool.query<RowDataPacket[]>(
      `SELECT ta.id FROM tipos_actividad ta
       LEFT JOIN areas ar ON ar.id = ta.area_id
       WHERE ta.id = ? AND ta.activo = TRUE
         AND (ta.es_general = TRUE OR ar.empresa_id = ?)${esJefeDeArea(user) ? ' AND (ta.es_general = TRUE OR ta.area_id = ?)' : ''}`,
        esJefeDeArea(user) ? [tipoActividadId, context.activa.id, user.area_id] : [tipoActividadId, context.activa.id]
    )
    if (tipoValido.length === 0) {
      return NextResponse.json({ error: 'El tipo de actividad no pertenece a la empresa activa.' }, { status: 400 })
    }

    if (clienteId != null) {
      if (esJefeDeArea(user) && proyectoId != null) {
        const [cliente] = await pool.query<RowDataPacket[]>(
          `SELECT c.id
           FROM clientes c
           INNER JOIN areas ar ON ar.id = c.area_id
           WHERE c.id = ? AND c.activo = TRUE AND ar.empresa_id = ?
             AND (
               c.area_id = ?
               OR EXISTS (
                 SELECT 1 FROM proyectos p
                 WHERE p.id = ? AND p.empresa_id = ? AND p.activo = TRUE AND p.cliente_id = c.id
               )
             )
           LIMIT 1`,
          [clienteId, context.activa.id, user.area_id, proyectoId, context.activa.id]
        )
        if (cliente.length === 0) {
          return NextResponse.json({ error: 'El cliente seleccionado no pertenece al proyecto o a tu área.' }, { status: 400 })
        }
      } else {
        const [cliente] = await pool.query<RowDataPacket[]>(
          `SELECT c.id FROM clientes c INNER JOIN areas ar ON ar.id = c.area_id
           WHERE c.id = ? AND c.activo = TRUE AND ar.empresa_id = ?${esJefeDeArea(user) ? ' AND c.area_id = ?' : ''}`,
          esJefeDeArea(user) ? [clienteId, context.activa.id, user.area_id] : [clienteId, context.activa.id]
        )
        if (cliente.length === 0) {
          return NextResponse.json({ error: 'El cliente seleccionado no pertenece a la empresa activa.' }, { status: 400 })
        }
      }
    }

    const [existe] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM actividades WHERE usuario_id = ? AND estado IN ('EN_CURSO', 'PAUSADA')`,
      [usuarioObjetivoId]
    )
    if (existe.length > 0) {
      return NextResponse.json({ error: 'Ya tienes una actividad activa. Finaliza o pausa la actual antes de crear una nueva.' }, { status: 409 })
    }

    // Control de horario de trabajo del usuario (si tiene configurado para hoy).
    const horario = await horarioDeHoy(usuarioObjetivoId)
    if (horario) {
      const ahora = new Date()
      if (!enRangoHorario(horario.hora_inicio, horario.hora_fin, ahora)) {
        const inicio = horario.hora_inicio.slice(0, 5)
        const fin = horario.hora_fin.slice(0, 5)
        return NextResponse.json(
          {
            error: `No puede registrar actividades ahora: se encuentra fuera de su horario de trabajo de hoy (${inicio} a ${fin}).`,
            code: 'FUERA_DE_HORARIO',
          },
          { status: 409 }
        )
      }
      const minutosDisponibles = aMinutos(horario.hora_fin) - aMinutos(horario.hora_inicio)
      const acumulados = await minutosAcumuladosHoy(usuarioObjetivoId)
      if (acumulados >= minutosDisponibles) {
        return NextResponse.json(
          {
            error: `Ya completó sus horas laborales de hoy (${Math.floor(minutosDisponibles / 60)} h ${minutosDisponibles % 60} min). No puede iniciar nuevas actividades.`,
            code: 'HORAS_COMPLETADAS',
          },
          { status: 409 }
        )
      }
    }

    const [result] = await pool.query(
      tieneProyecto
        ? `INSERT INTO actividades (usuario_id, cliente_id, tipo_actividad_id, descripcion, facturable, proyecto_id, inicio, estado)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), 'EN_CURSO')`
        : `INSERT INTO actividades (usuario_id, cliente_id, tipo_actividad_id, descripcion, facturable, inicio, estado)
           VALUES (?, ?, ?, ?, ?, NOW(), 'EN_CURSO')`,
      tieneProyecto
        ? [usuarioObjetivoId, clienteId, tipoActividadId, descripcionTexto, facturable ?? null, proyectoId]
        : [usuarioObjetivoId, clienteId, tipoActividadId, descripcionTexto, facturable ?? null]
    )

    const insertId = (result as { insertId: number }).insertId
    const proyectoCampos = tieneProyecto ? 'a.proyecto_id, pr.nombre AS proyecto_nombre,' : ''
    const proyectoJoin = tieneProyecto ? 'LEFT JOIN proyectos pr ON pr.id = a.proyecto_id AND pr.empresa_id = ar.empresa_id' : ''
    const [nueva] = await pool.query<RowDataPacket[]>(
      `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
        ${proyectoCampos} a.inicio, a.fin, a.estado, a.created_at,
        u.nombre AS usuario_nombre, u.cargo, u.especialidad, u.area_id,
        ta.nombre AS tipo_actividad_nombre,
        ar.nombre AS area_nombre,
        c.nombre AS cliente_nombre
       FROM actividades a
       INNER JOIN usuarios u ON u.id = a.usuario_id
       INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
       INNER JOIN areas ar ON ar.id = u.area_id
       ${proyectoJoin}
       LEFT JOIN clientes c ON c.id = a.cliente_id
       WHERE a.id = ?`,
      [insertId]
    )

    notifyActivityChange(usuarioObjetivoId)

    return NextResponse.json({ ok: true, actividad: nueva[0] })
  } catch (error) {
    console.error('Error al crear actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
