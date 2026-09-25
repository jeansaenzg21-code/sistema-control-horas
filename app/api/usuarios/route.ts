import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'
import { esJefeDeArea } from '@/lib/permisos'

const SELECT_USUARIOS = `
  SELECT u.id, u.nombre, u.correo, u.usuario, u.rol, u.area_id, u.cargo, u.especialidad,
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

async function getContextoActivo(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return { error: 'No autorizado.', status: 401 } as const
  const context = await getEmpresaContext(user)
  if (!context.activa) return { error: 'No hay una empresa activa.', status: 409 } as const
  return { user, empresaId: context.activa.id } as const
}

export async function GET(request: Request) {
  try {
    const context = await getContextoActivo(request)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    let query = `${SELECT_USUARIOS} WHERE a.empresa_id = ?`
    const params: number[] = [context.empresaId]
    if (esJefeDeArea(context.user) && context.user.area_id != null) {
      query += ' AND u.area_id = ?'
      params.push(context.user.area_id)
    }
    query += ' ORDER BY u.nombre'
    const [rows] = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener usuarios:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
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

    const body = await request.json()
    const { nombre, correo, usuario, password, rol, area_id, cargo, especialidad, supervisor_id } = body
    const nombreLimpio = String(nombre ?? '').trim()
    const usuarioLimpio = String(usuario ?? '').trim()
    const correoLimpio = String(correo ?? '').trim()
    const cargoLimpio = String(cargo ?? especialidad ?? '').trim() || null
    const especialidadLimpia = especialidad == null ? null : String(especialidad).trim() || null
    const rolDb = rolDesdeCliente(rol)

    if (!nombreLimpio || !usuarioLimpio) {
      return NextResponse.json({ error: 'Nombre y usuario son obligatorios.' }, { status: 400 })
    }
    if (!password) {
      return NextResponse.json({ error: 'La contraseña es obligatoria.' }, { status: 400 })
    }
    if (!rolDb) {
      return NextResponse.json({ error: 'El rol solicitado no es válido.' }, { status: 400 })
    }
    if (jefeUsuario && rolDb !== 'PERSONAL') {
      return NextResponse.json({ error: 'El jefe de área sólo puede crear colaboradores.' }, { status: 403 })
    }
    if (jefeUsuario && (!area_id || Number(area_id) !== context.user.area_id)) {
      return NextResponse.json({ error: 'Sólo puedes crear usuarios en tu área.' }, { status: 403 })
    }
    if (rolDb === 'JEFE_AREA' && !area_id) {
      return NextResponse.json({ error: 'Debes seleccionar la división del jefe de área.' }, { status: 400 })
    }
    if (rolDb === 'JEFE_AREA' && !(await tieneColumnaJefeArea())) {
      return NextResponse.json(
        { error: 'Falta aplicar la migración de jefe de área. Ejecuta sql/areas_jefe.sql.' },
        { status: 503 }
      )
    }
    if (rolDb === 'JEFE_AREA' && !(await soportaRolJefeArea())) {
      return NextResponse.json(
        { error: 'Falta habilitar el rol JEFE_AREA. Ejecuta sql/jefes_area.sql.' },
        { status: 503 }
      )
    }

    const [areaRows] = await pool.query(
      'SELECT id FROM areas WHERE empresa_id = ? AND activo = TRUE ORDER BY id',
      [context.empresaId]
    )
    const areas = areaRows as Array<{ id: number }>
    const areaSolicitada = area_id ? Number(area_id) : areas[0]?.id
    if (!areaSolicitada || !areas.some((area) => area.id === areaSolicitada)) {
      return NextResponse.json({ error: 'La división indicada no pertenece a la empresa activa.' }, { status: 400 })
    }

    const [existe] = await pool.query(
      'SELECT id FROM usuarios WHERE usuario = ? OR (? <> "" AND correo = ?)',
      [usuarioLimpio, correoLimpio, correoLimpio]
    )
    if ((existe as unknown[]).length > 0) {
      return NextResponse.json({ error: 'El usuario o correo ya existe.' }, { status: 400 })
    }

    const hash = await bcrypt.hash(password, 10)
    let id: number

    if (rolDb === 'JEFE_AREA') {
      const conexion = await pool.getConnection()
      try {
        await conexion.beginTransaction()
        const [areaJefe] = await conexion.query<RowDataPacket[]>(
          'SELECT jefe_id FROM areas WHERE id = ? AND empresa_id = ? AND activo = TRUE FOR UPDATE',
          [areaSolicitada, context.empresaId]
        )
        if (areaJefe[0]?.jefe_id != null) {
          await conexion.rollback()
          return NextResponse.json({ error: 'La división ya tiene un jefe asignado.' }, { status: 409 })
        }
        const [result] = await conexion.query<ResultSetHeader>(
          `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, cargo, especialidad, supervisor_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            nombreLimpio,
            correoLimpio,
            usuarioLimpio,
            hash,
            rolDb,
            areaSolicitada,
            cargoLimpio,
            especialidadLimpia,
            rolDb === 'JEFE_AREA' ? null : supervisor_id || null,
          ]
        )
        id = result.insertId
        await conexion.query('UPDATE areas SET jefe_id = ? WHERE id = ?', [id, areaSolicitada])
        await conexion.commit()
      } catch (error) {
        await conexion.rollback()
        throw error
      } finally {
        conexion.release()
      }
    } else {
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, cargo, especialidad, supervisor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nombreLimpio,
          correoLimpio,
          usuarioLimpio,
          hash,
          rolDb,
          areaSolicitada,
          cargoLimpio,
          especialidadLimpia,
          supervisor_id || null,
        ]
      )
      id = result.insertId
    }

    const [rows] = await pool.query(`${SELECT_USUARIOS} WHERE u.id = ?`, [id])
    return NextResponse.json({ usuario: (rows as unknown[])[0] })
  } catch (error) {
    console.error('Error al crear usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
