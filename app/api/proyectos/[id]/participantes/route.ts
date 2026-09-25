import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getProyectoContexto, proyectosDisponibles, puedeEditarProyecto, type RolProyecto } from '@/lib/proyectos'

const ROLES = new Set<RolProyecto>(['LIDER', 'COORDINADOR', 'ESPECIALISTA', 'COLABORADOR'])

function idValido(valor: unknown): number | null {
  const id = Number(valor)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await getProyectoContexto(request)
    if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
    if (!(await proyectosDisponibles())) return NextResponse.json({ error: 'Falta aplicar la migración de proyectos.' }, { status: 503 })
    const proyectoId = idValido((await params).id)
    if (proyectoId == null) return NextResponse.json({ error: 'Proyecto no válido.' }, { status: 400 })
    if (!(await puedeEditarProyecto(context.user, proyectoId, context.empresaId))) {
      return NextResponse.json({ error: 'No autorizado para modificar participantes.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const usuarioId = idValido(body.usuario_id)
    const rol = String(body.rol_proyecto ?? 'COLABORADOR').toUpperCase() as RolProyecto
    if (usuarioId == null || !ROLES.has(rol)) return NextResponse.json({ error: 'Participante o función no válidos.' }, { status: 400 })
    if (rol === 'LIDER') return NextResponse.json({ error: 'El líder del proyecto se define al crear o editar el proyecto.' }, { status: 400 })

    const [proyectoRows] = await pool.query(
      'SELECT jefe_id FROM proyectos WHERE id = ? AND empresa_id = ? AND activo = TRUE',
      [proyectoId, context.empresaId]
    )
    const proyecto = (proyectoRows as Array<{ jefe_id: number }>)[0]
    if (!proyecto) return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 })
    if (proyecto.jefe_id === usuarioId) return NextResponse.json({ error: 'El jefe del proyecto ya es líder.' }, { status: 409 })

    const [usuarioRows] = await pool.query(
      `SELECT u.id, u.area_id
       FROM usuarios u INNER JOIN areas ar ON ar.id = u.area_id
       WHERE u.id = ? AND u.activo = TRUE AND ar.activo = TRUE AND ar.empresa_id = ?
       LIMIT 1`,
      [usuarioId, context.empresaId]
    )
    const usuario = (usuarioRows as Array<{ id: number; area_id: number }>)[0]
    if (!usuario) return NextResponse.json({ error: 'El participante no pertenece a la empresa activa.' }, { status: 400 })

    const conexion = await pool.getConnection()
    try {
      await conexion.beginTransaction()
      await conexion.query(
        `INSERT INTO proyecto_participantes (proyecto_id, usuario_id, rol_proyecto)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE rol_proyecto = VALUES(rol_proyecto)`,
        [proyectoId, usuarioId, rol]
      )
      await conexion.query(
        'INSERT IGNORE INTO proyecto_areas (proyecto_id, area_id) VALUES (?, ?)',
        [proyectoId, usuario.area_id]
      )
      await conexion.commit()
    } catch (error) {
      await conexion.rollback()
      throw error
    } finally {
      conexion.release()
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al agregar participante:', error)
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
    if (!(await proyectosDisponibles())) return NextResponse.json({ error: 'Falta aplicar la migración de proyectos.' }, { status: 503 })
    const proyectoId = idValido((await params).id)
    if (proyectoId == null) return NextResponse.json({ error: 'Proyecto no válido.' }, { status: 400 })
    if (!(await puedeEditarProyecto(context.user, proyectoId, context.empresaId))) {
      return NextResponse.json({ error: 'No autorizado para modificar participantes.' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const usuarioId = idValido(body.usuario_id)
    if (usuarioId == null) return NextResponse.json({ error: 'Participante no válido.' }, { status: 400 })

    const [result] = await pool.query(
      `DELETE pp FROM proyecto_participantes pp
       INNER JOIN proyectos p ON p.id = pp.proyecto_id
       WHERE pp.proyecto_id = ? AND pp.usuario_id = ? AND p.jefe_id <> ? AND p.empresa_id = ? AND p.activo = TRUE`,
      [proyectoId, usuarioId, usuarioId, context.empresaId]
    )
    if (Number((result as { affectedRows: number }).affectedRows) === 0) {
      return NextResponse.json({ error: 'No se puede quitar al líder del proyecto.' }, { status: 409 })
    }
    await pool.query(
      `DELETE pa FROM proyecto_areas pa
       WHERE pa.proyecto_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM proyecto_participantes pp
           INNER JOIN usuarios u ON u.id = pp.usuario_id
           WHERE pp.proyecto_id = pa.proyecto_id AND u.area_id = pa.area_id
         )`,
      [proyectoId]
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al quitar participante:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
