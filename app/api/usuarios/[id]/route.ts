import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'
import { esJefeDeArea } from '@/lib/permisos'

const SELECT_USUARIO = `
  SELECT u.id, u.nombre, COALESCE(u.correo, '') AS correo, u.usuario, u.rol, u.area_id, u.cargo, u.especialidad,
         u.supervisor_id, u.activo, u.created_at,
         a.nombre AS area_nombre,
         a.empresa_id AS empresa_id
  FROM usuarios u
  LEFT JOIN areas a ON a.id = u.area_id
`

const ROLES = {
  personal: 'PERSONAL',
  supervisor: 'SUPERVISOR',
  jefe_area: 'JEFE_AREA',
  admin: 'ADMINISTRACION',
} as const

function rolDesdeCliente(valor: unknown): string | null {
  if (valor == null) return ROLES.personal
  const clave = String(valor).trim().toLowerCase()
  return ROLES[clave as keyof typeof ROLES] ?? null
}

async function getContextoActivo(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return { error: 'No autorizado.', status: 401 } as const
  const context = await getEmpresaContext(user)
  if (!context.activa) return { error: 'No hay una empresa activa.', status: 409 } as const
  return { user, empresaId: context.activa.id } as const
}

async function tieneColumnaJefeArea(): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'areas'
       AND COLUMN_NAME = 'jefe_id'`
  )
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0) > 0
}

async function tieneTablaProyectos(): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('proyectos', 'proyecto_participantes')`
  )
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0) === 2
}

async function soportaRolJefeArea(): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND COLUMN_NAME = 'rol'
     LIMIT 1`
  )
  const fila = (rows as Array<Record<string, unknown>>)[0]
  const tipo = String(fila?.COLUMN_TYPE ?? fila?.column_type ?? Object.values(fila ?? {})[0] ?? '')
  return !tipo || !tipo.toUpperCase().startsWith('ENUM(') || tipo.toUpperCase().includes('JEFE_AREA')
}

async function getUsuarioDeEmpresa(id: number, empresaId: number) {
  const [rows] = await pool.query(
    `${SELECT_USUARIO} WHERE u.id = ? AND a.empresa_id = ?`,
    [id, empresaId]
  )
  return (rows as Array<Record<string, unknown>>)[0] || null
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getContextoActivo(request)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const { id: idParam } = await params
    const id = Number(idParam)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Usuario no válido.' }, { status: 400 })
    }

    const usuarioObjetivo = await getUsuarioDeEmpresa(id, context.empresaId)
    if (!usuarioObjetivo && context.user.id !== id) {
      return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 })
    }
    const adminUsuario = esAdmin(context.user)
    const jefeUsuario = esJefeDeArea(context.user)
    if (!adminUsuario && !jefeUsuario && context.user.id !== id) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    if (jefeUsuario && context.user.id !== id) {
      if (!usuarioObjetivo || String(usuarioObjetivo.rol) !== 'PERSONAL' || Number(usuarioObjetivo.area_id) !== context.user.area_id) {
        return NextResponse.json({ error: 'Sólo puedes administrar colaboradores de tu área.' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { nombre, correo, usuario, password, rol, area_id, cargo, especialidad, activo } = body
    if (!adminUsuario && (rol != null || area_id != null || (jefeUsuario && usuario != null))) {
      return NextResponse.json({ error: 'No puedes modificar tu rol, usuario ni división.' }, { status: 403 })
    }
    const campos: string[] = []
    const valores: unknown[] = []
    let areaJefeParaAsignar: number | null = null
    let rolNuevo: string | null = null

    if (nombre != null) { campos.push('nombre = ?'); valores.push(String(nombre).trim()) }
    if (correo != null) { campos.push('correo = ?'); valores.push(String(correo).trim()) }
    if (usuario != null && (adminUsuario || jefeUsuario)) { campos.push('usuario = ?'); valores.push(String(usuario).trim()) }
    if (rol != null && adminUsuario) {
      rolNuevo = rolDesdeCliente(rol)
      if (!rolNuevo) {
        return NextResponse.json({ error: 'El rol solicitado no es válido.' }, { status: 400 })
      }
      if (rolNuevo === 'JEFE_AREA') {
        const [subordinados] = await pool.query(
          'SELECT COUNT(*) AS total FROM usuarios WHERE supervisor_id = ? AND activo = TRUE',
          [id]
        )
        if (Number((subordinados as Array<{ total: number | string }>)[0]?.total ?? 0) > 0) {
          return NextResponse.json({ error: 'Reasigna sus subordinados antes de convertirlo en jefe de área.' }, { status: 409 })
        }
        if (!(await tieneColumnaJefeArea()) || !(await soportaRolJefeArea())) {
          return NextResponse.json(
            { error: 'Falta aplicar las migraciones de jefe de área.' },
            { status: 503 }
          )
        }
        const areaPropia = Number(usuarioObjetivo?.area_id)
        const areaJefe = area_id != null ? Number(area_id) : areaPropia
        const [areas] = await pool.query(
          'SELECT id, jefe_id FROM areas WHERE id = ? AND empresa_id = ? AND activo = TRUE',
          [areaJefe, context.empresaId]
        )
        const areaSeleccionada = (areas as Array<{ id: number; jefe_id: number | null }>)[0]
        if (!areaSeleccionada) {
          return NextResponse.json({ error: 'La división no pertenece a la empresa activa.' }, { status: 400 })
        }
        if (areaSeleccionada.jefe_id != null && areaSeleccionada.jefe_id !== id) {
          return NextResponse.json({ error: 'La división ya tiene un jefe asignado.' }, { status: 409 })
        }
        areaJefeParaAsignar = areaSeleccionada.id
      }
      campos.push('rol = ?'); valores.push(rolNuevo)
    }
    if (area_id != null && adminUsuario) {
      const nuevoArea = Number(area_id)
      const [areas] = await pool.query(
        'SELECT id FROM areas WHERE id = ? AND empresa_id = ? AND activo = TRUE',
        [nuevoArea, context.empresaId]
      )
      if ((areas as unknown[]).length === 0) {
        return NextResponse.json({ error: 'La división no pertenece a la empresa activa.' }, { status: 400 })
      }
      if (String(usuarioObjetivo?.rol) === 'JEFE_AREA' && await tieneColumnaJefeArea()) {
        const [areaJefe] = await pool.query(
          'SELECT jefe_id FROM areas WHERE id = ? AND empresa_id = ? AND activo = TRUE',
          [nuevoArea, context.empresaId]
        )
        const jefeActual = (areaJefe as Array<{ jefe_id: number | null }>)[0]?.jefe_id
        if (jefeActual != null && jefeActual !== id) {
          return NextResponse.json({ error: 'La división ya tiene un jefe asignado.' }, { status: 409 })
        }
        areaJefeParaAsignar = nuevoArea
      }
      const [areaActual] = await pool.query(
        'SELECT area_id FROM usuarios WHERE id = ? LIMIT 1',
        [id]
      )
      const areaAnterior = (areaActual as Array<{ area_id: number | null }>)[0]?.area_id
      if (areaAnterior != null && Number(areaAnterior) !== nuevoArea && await tieneColumnaJefeArea()) {
        await pool.query('UPDATE areas SET jefe_id = NULL WHERE jefe_id = ?', [id])
      }
      campos.push('area_id = ?'); valores.push(nuevoArea)
    }
    if (cargo != null) { campos.push('cargo = ?'); valores.push(String(cargo).trim() || null) }
    if (especialidad != null) { campos.push('especialidad = ?'); valores.push(especialidad) }
    if (activo != null && (adminUsuario || jefeUsuario)) {
      const activoValor = activo === true || activo === 1 || activo === '1' || activo === 'true'
      campos.push('activo = ?'); valores.push(activoValor)
      if (!activoValor && await tieneColumnaJefeArea()) {
        await pool.query('UPDATE areas SET jefe_id = NULL WHERE jefe_id = ?', [id])
      }
    }
    if (password) {
      const hash = await bcrypt.hash(password, 10)
      campos.push('password_hash = ?'); valores.push(hash)
    }

    const intentaCambiarJefe = String(usuarioObjetivo?.rol) === 'JEFE_AREA'
      && (rolNuevo === 'PERSONAL' || (area_id != null && Number(area_id) !== Number(usuarioObjetivo?.area_id)) || activo === false)
    if (intentaCambiarJefe && await tieneTablaProyectos()) {
      const [proyectos] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM proyectos WHERE jefe_id = ? AND activo = TRUE',
        [id]
      )
      if (Number(proyectos[0]?.total ?? 0) > 0) {
        return NextResponse.json({ error: 'No puedes quitar el jefe de un proyecto activo. Transfiere o archiva el proyecto primero.' }, { status: 409 })
      }
    }

    if (campos.length === 0) {
      return NextResponse.json({ error: 'Sin cambios para guardar.' }, { status: 400 })
    }

    valores.push(id)
    await pool.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, valores)
    if (rolNuevo === 'JEFE_AREA' && areaJefeParaAsignar != null && await tieneColumnaJefeArea()) {
      await pool.query(
        'UPDATE areas SET jefe_id = ? WHERE id = ? AND empresa_id = ?',
        [id, areaJefeParaAsignar, context.empresaId]
      )
    }
    if (rolNuevo && rolNuevo !== 'JEFE_AREA' && String(usuarioObjetivo?.rol) === 'JEFE_AREA' && await tieneColumnaJefeArea()) {
      await pool.query('UPDATE areas SET jefe_id = NULL WHERE jefe_id = ?', [id])
    }
    const [rows] = await pool.query(`${SELECT_USUARIO} WHERE u.id = ?`, [id])
    return NextResponse.json({ usuario: (rows as unknown[])[0] })
  } catch (error) {
    console.error('Error al actualizar usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let conexion: PoolConnection | null = null
  try {
    const context = await getContextoActivo(request)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    const adminUsuario = esAdmin(context.user)
    const jefeUsuario = esJefeDeArea(context.user)
    if (!adminUsuario && !jefeUsuario) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const { id: idParam } = await params
    const id = Number(idParam)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Usuario no válido.' }, { status: 400 })
    }
    if (id === context.user.id) {
      return NextResponse.json({ error: 'No puedes eliminar tu propio usuario.' }, { status: 400 })
    }

    const usuarioObjetivo = await getUsuarioDeEmpresa(id, context.empresaId)
    if (!usuarioObjetivo) {
      return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 })
    }
    if (jefeUsuario && (
      String(usuarioObjetivo.rol) !== 'PERSONAL'
      || Number(usuarioObjetivo.area_id) !== context.user.area_id
    )) {
      return NextResponse.json({ error: 'Sólo puedes administrar colaboradores de tu área.' }, { status: 403 })
    }
    if (String(usuarioObjetivo.rol) === 'ADMINISTRACION' && Boolean(usuarioObjetivo.activo)) {
      const [administradores] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM usuarios u
         INNER JOIN areas ar ON ar.id = u.area_id
         WHERE u.rol = 'ADMINISTRACION'
           AND u.activo = TRUE
           AND ar.empresa_id = ?`,
        [context.empresaId],
      )
      if (Number(administradores[0]?.total ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'No se puede eliminar el único administrador activo de la empresa.' },
          { status: 409 },
        )
      }
    }

    conexion = await pool.getConnection()
    await conexion.beginTransaction()
    const tieneProyectos = await tieneTablaProyectos()
    const proyectosConsulta = tieneProyectos
      ? `((SELECT COUNT(*) FROM proyectos WHERE jefe_id = ? AND activo = TRUE) + (SELECT COUNT(*) FROM proyecto_participantes WHERE usuario_id = ?)) AS proyectos`
      : `0 AS proyectos`
    const parametrosReferencia: Array<number> = [id, id, id, id, id]
    if (tieneProyectos) parametrosReferencia.push(id, id)
    const [referencias] = await conexion.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM actividades WHERE usuario_id = ? OR revisado_por = ?) AS actividades,
         (SELECT COUNT(*) FROM observaciones WHERE usuario_destino_id = ? OR autor_id = ?) AS observaciones,
         (SELECT COUNT(*) FROM usuarios WHERE supervisor_id = ?) AS subordinados,
         ${proyectosConsulta}`,
      parametrosReferencia,
    )
    const referencia = referencias[0]
    const tieneHistorial = Number(referencia?.actividades ?? 0) > 0
      || Number(referencia?.observaciones ?? 0) > 0
      || Number(referencia?.subordinados ?? 0) > 0
      || Number(referencia?.proyectos ?? 0) > 0

    if (tieneHistorial) {
      if (await tieneColumnaJefeArea()) {
        await conexion.query('UPDATE areas SET jefe_id = NULL WHERE jefe_id = ?', [id])
      }
      await conexion.query('UPDATE usuarios SET activo = FALSE WHERE id = ?', [id])
      await conexion.query('DELETE FROM sesiones WHERE usuario_id = ?', [id])
      await conexion.commit()
      conexion.release()
      conexion = null
      return NextResponse.json({
        ok: true,
        desactivado: true,
        message: 'El perfil tiene historial relacionado; se desactivó para conservar sus registros.',
      })
    }

    await conexion.query('DELETE FROM usuarios WHERE id = ?', [id])
    await conexion.commit()
    conexion.release()
    conexion = null
    return NextResponse.json({ ok: true, eliminado: true })
  } catch (error) {
    if (conexion) {
      await conexion.rollback().catch(() => undefined)
    }
    console.error('Error al eliminar usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  } finally {
    if (conexion) conexion.release()
  }
}
