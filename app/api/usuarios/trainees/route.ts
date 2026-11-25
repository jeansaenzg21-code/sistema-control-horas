import { tieneColumnasTrainee } from '@/lib/trainees-esquema'
import { NextResponse } from 'next/server'
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdministrador } from '@/lib/permisos'
import { hashearPassword } from '@/lib/validacion-password'

const HOY = 'DATE(UTC_TIMESTAMP() - INTERVAL 5 HOUR)'
const correoValido = (correo: string) => correo.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status })

async function contexto(request: Request) {
  const usuario = await getUserFromRequest(request)
  if (!usuario || !esAdministrador(usuario)) return null
  const { activa } = await getEmpresaContext(usuario)
  return activa ? { usuario, empresaId: activa.id } : null
}

export async function GET(request: Request) {
  const acceso = await contexto(request)
  if (!acceso) return error('No autorizado.', 403)
  if (!(await tieneColumnasTrainee())) return error('Trainees aún no está habilitado en esta base. Falta aplicar la migración 001-trainees.sql.', 503)
  const areaId = Number(new URL(request.url).searchParams.get('area_id'))
  if (!Number.isInteger(areaId) || areaId <= 0) return error('División inválida.', 400)
  const [filas] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.correo, u.activo, DATE_FORMAT(u.trainee_inicio, '%Y-%m-%d') AS inicio,
            DATE_FORMAT(u.trainee_vence, '%Y-%m-%d') AS vencimiento,
            u.trainee_vence < ${HOY} AS vencido,
            DATE_ADD(u.trainee_inicio, INTERVAL 3 MONTH) <= ${HOY} AS sugerir_conversion
       FROM usuarios u JOIN areas a ON a.id = u.area_id
      WHERE a.empresa_id = ? AND a.id = ? AND u.trainee_inicio IS NOT NULL
      ORDER BY u.trainee_inicio DESC, u.id DESC`,
    [acceso.empresaId, areaId],
  )
  return NextResponse.json(filas, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const acceso = await contexto(request)
  if (!acceso) return error('No autorizado.', 403)
  if (!(await tieneColumnasTrainee())) return error('Trainees aún no está habilitado en esta base. Falta aplicar la migración 001-trainees.sql.', 503)
  const cuerpo = await request.json().catch(() => null)
  if (!cuerpo || typeof cuerpo !== 'object') return error('Solicitud inválida.', 400)
  const { accion } = cuerpo
  const areaId = Number(cuerpo.area_id)
  const usuarioId = Number(cuerpo.usuario_id)
  if (!Number.isInteger(areaId) || areaId <= 0) return error('División inválida.', 400)
  if (accion !== 'alta' && accion !== 'convertir' && accion !== 'baja') return error('Acción inválida.', 400)
  if (accion !== 'alta' && (!Number.isInteger(usuarioId) || usuarioId <= 0)) return error('Cuenta inválida.', 400)

  const texto = (valor: unknown) => typeof valor === 'string' ? valor.trim() : ''
  const correo = texto(cuerpo.correo).toLowerCase()
  const nombre = texto(cuerpo.nombre)
  const dni = texto(cuerpo.dni)
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''
  if (accion !== 'baja' && !correoValido(correo)) return error('Ingresa un correo válido.', 400)
  if (accion === 'alta' && (!password || Buffer.byteLength(password) > 72)) {
    return error('Ingresa una contraseña de hasta 72 bytes.', 400)
  }
  if (accion === 'convertir' && (!nombre || nombre.length > 120 || !/^\d{8}$/.test(dni))) {
    return error('Ingresa el nombre completo y un DNI de ocho dígitos.', 400)
  }
  const hash = accion === 'baja' ? null : await hashearPassword(accion === 'alta' ? password : dni)
  const db = await pool.getConnection()
  let confirmada = false
  try {
    await db.beginTransaction()
    const [areas] = await db.query<RowDataPacket[]>(
      `SELECT id, activo, DATE_FORMAT(${HOY}, '%Y-%m-%d') AS hoy, DATE_FORMAT(DATE_ADD(${HOY}, INTERVAL 3 MONTH), '%Y-%m-%d') AS vencimiento
         FROM areas WHERE id = ? AND empresa_id = ? FOR UPDATE`,
      [areaId, acceso.empresaId],
    )
    const area = areas[0]
    if (!area) return error('La división no pertenece a la empresa activa.', 404)
    if (accion !== 'baja' && !area.activo) return error('La división está inactiva.', 409)
    let cuentaId = usuarioId
    let antes: Record<string, unknown> | null = null
    if (accion !== 'alta') {
      const [filas] = await db.query<RowDataPacket[]>(
        `SELECT correo, activo, DATE_ADD(trainee_inicio, INTERVAL 3 MONTH) <= ${HOY} AS puede_convertir
           FROM usuarios WHERE id = ? AND area_id = ? AND trainee_inicio IS NOT NULL FOR UPDATE`,
        [usuarioId, areaId],
      )
      const cuenta = filas[0]
      if (!cuenta) return error('La cuenta trainee no está en esta división.', 404)
      antes = { correo: cuenta.correo, activo: Boolean(cuenta.activo) }
      if (accion === 'convertir' && (!cuenta.puede_convertir || !cuenta.activo)) return error('La cuenta debe seguir habilitada y haber cumplido tres meses.', 409)
      if (accion === 'convertir' && correo === cuenta.correo) return error('Ingresa el nuevo correo oficial del practicante.', 400)
      if (accion === 'baja' && !cuenta.activo) return NextResponse.json({ ok: true })
    }
    if (accion !== 'baja') {
      const [duplicados] = await db.query<RowDataPacket[]>(
        'SELECT id FROM usuarios WHERE (usuario = ? OR correo = ?) AND id <> ? LIMIT 1',
        [correo, correo, accion === 'alta' ? 0 : usuarioId],
      )
      if (duplicados.length) return error('Ese correo ya está asociado a una cuenta.', 409)
    }
    if (accion === 'alta') {
      const [creado] = await db.query<ResultSetHeader>(
        `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, cargo, activo, trainee_inicio, trainee_vence)
         VALUES ('', ?, ?, ?, 'PERSONAL', ?, 'TRAINEE', TRUE, ?, ?)`,
        [correo, correo, hash, areaId, area.hoy, area.vencimiento],
      )
      cuentaId = creado.insertId
    } else if (accion === 'convertir') {
      await db.query(
        `UPDATE usuarios SET nombre = ?, correo = ?, usuario = ?, password_hash = ?,
           cargo = 'PRACTICANTE', trainee_inicio = NULL, trainee_vence = NULL
         WHERE id = ?`,
        [nombre, correo, correo, hash, usuarioId],
      )
    } else {
      await db.query('UPDATE usuarios SET activo = FALSE WHERE id = ?', [usuarioId])
    }
    if (accion !== 'alta') await db.query('DELETE FROM sesiones WHERE usuario_id = ?', [usuarioId])
    const despues = accion === 'baja' ? { activo: false } : accion === 'alta' ? { correo, vencimiento: area.vencimiento } : { correo, cargo: 'PRACTICANTE' }
    await db.query(
      'INSERT INTO auditoria (empresa_id, usuario_id, accion, entidad, entidad_id, antes, despues) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [acceso.empresaId, acceso.usuario.id, 'TRAINEE_' + accion.toUpperCase(), 'usuario', cuentaId, antes ? JSON.stringify(antes) : null, JSON.stringify(despues)],
    )
    await db.commit()
    confirmada = true
    return NextResponse.json({ ok: true, id: cuentaId })
  } catch (fallo) {
    if ((fallo as { code?: string }).code === 'ER_DUP_ENTRY') return error('Ese correo ya está asociado a una cuenta.', 409)
    console.error('Error al gestionar trainee:', fallo)
    return error('No se pudo guardar el cambio.', 500)
  } finally {
    try { if (!confirmada) await db.rollback() } finally { db.release() }
  }
}
