import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashearPassword, validarPassword } from '@/lib/validacion-password'
import { verificarSetupToken } from '@/lib/setup-token'

export async function POST(request: Request) {
  // El codigo de instalacion es obligatorio. En produccion, si no esta
  // configurado, el endpoint directamente no existe (404), para que no se pueda
  // crear un administrador sin el secreto.
  const sinToken = verificarSetupToken(request)
  if (sinToken) return sinToken

  try {
    const { nombre, correo, usuario, password } = (await request.json().catch(() => ({}))) as {
      nombre?: unknown
      correo?: unknown
      usuario?: unknown
      password?: unknown
    }

    const nombreLimpio = String(nombre ?? '').trim()
    const usuarioLimpio = String(usuario ?? '').trim()
    const correoLimpio = String(correo ?? '').trim()

    if (!nombreLimpio) {
      return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 })
    }
    if (!usuarioLimpio) {
      return NextResponse.json({ error: 'El usuario es obligatorio.' }, { status: 400 })
    }

    // Misma politica de contrasena en todo el sistema.
    const validacion = validarPassword(password)
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 })
    }

    // Creacion ATOMICA.
    //
    // Dos peticiones simultaneas podrian pasar las dos el "if no hay
    // usuarios" y crear dos administradores. Para que eso no pase, todo va en
    // una transaccion y las lecturas se hacen con FOR UPDATE. La primera
    // peticion bloquea y gana; la segunda, al desbloquear, ya ve que existe un
    // usuario y responde con error.
    const conexion = await pool.getConnection()
    try {
      await conexion.beginTransaction()

      const [empresas] = await conexion.query('SELECT id FROM empresa ORDER BY id LIMIT 1 FOR UPDATE')
      if ((empresas as unknown[]).length === 0) {
        await conexion.rollback()
        return NextResponse.json({ error: 'No existe una empresa configurada.' }, { status: 400 })
      }
      const empresaId = Number((empresas as Array<{ id: number }>)[0].id)

      const [areas] = await conexion.query(
        `SELECT id
         FROM areas
         WHERE empresa_id = ? AND nombre = ? AND activo = TRUE
         ORDER BY id
         LIMIT 1`,
        [empresaId, 'Administración']
      )
      if ((areas as unknown[]).length === 0) {
        await conexion.rollback()
        return NextResponse.json(
          { error: 'No existe el área Administración para la empresa configurada.' },
          { status: 400 }
        )
      }
      const areaId = Number((areas as Array<{ id: number }>)[0].id)

      // La lectura con FOR UPDATE sobre `usuarios` bloquea el hueco aunque la
      // tabla este vacia, que es justo el caso que importa.
      const [existe] = await conexion.query('SELECT id FROM usuarios LIMIT 1 FOR UPDATE')
      if ((existe as unknown[]).length > 0) {
        await conexion.rollback()
        return NextResponse.json({ error: 'Ya existe un usuario administrador.' }, { status: 400 })
      }

      const [existeUsuario] = await conexion.query(
        'SELECT id FROM usuarios WHERE usuario = ?',
        [usuarioLimpio]
      )
      if ((existeUsuario as unknown[]).length > 0) {
        await conexion.rollback()
        return NextResponse.json({ error: 'El nombre de usuario ya existe.' }, { status: 400 })
      }

      // Hash con el costo vigente (12) para los hashes nuevos.
      const hash = await hashearPassword(String(password))

      const [result] = await conexion.query(
        `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, activo)
         VALUES (?, ?, ?, ?, 'ADMINISTRACION', ?, TRUE)`,
        [nombreLimpio, correoLimpio, usuarioLimpio, hash, areaId]
      )

      await conexion.commit()
      return NextResponse.json({ ok: true, id: (result as { insertId: number }).insertId })
    } catch (error) {
      try {
        await conexion.rollback()
      } catch {}
      // La unica forma de duplicar es que otra peticion gane la carrera y cree
      // el administrador mientras esta esperaba.
      const codigo = (error as { code?: string }).code
      if (codigo === 'ER_DUP_ENTRY') {
        return NextResponse.json({ error: 'El nombre de usuario ya existe.' }, { status: 400 })
      }
      throw error
    } finally {
      conexion.release()
    }
  } catch (error) {
    console.error('Error al crear administrador:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
