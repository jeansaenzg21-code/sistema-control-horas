import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'
import { esAdministrador, esJefeDeArea } from '@/lib/permisos'
import { leerJson } from '@/lib/validacion/leer-json'
import { esquemaCliente } from '@/lib/validacion/clientes'
import { notificarBolsasHorasLote } from '@/lib/bolsa-alertas'

async function getContextoActivo(request: Request) {
  const user = await getUserFromRequest(request)
  if (!user) return { error: 'No autorizado.', status: 401 } as const
  const context = await getEmpresaContext(user)
  if (!context.activa) return { error: 'No hay una empresa activa.', status: 409 } as const
  return { user, empresaId: context.activa.id } as const
}

function normalizarNombreCliente(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ')
}

function normalizarRucCliente(ruc: string): string {
  return ruc.trim().toUpperCase().replace(/[\s.-]/g, '')
}

async function buscarClienteDuplicado(
  empresaId: number,
  areaId: number,
  nombre: string | null,
  ruc: string | null,
  excluirId?: number,
): Promise<{ campo: 'nombre' | 'ruc' } | null> {
  const nombreNormalizado = nombre ? normalizarNombreCliente(nombre) : ''
  if (nombreNormalizado) {
    const [porNombre] = await pool.query(
      `SELECT c.id FROM clientes c
       INNER JOIN areas a ON a.id = c.area_id
       WHERE a.empresa_id = ? AND c.area_id = ? AND c.activo = TRUE
         AND LOWER(REGEXP_REPLACE(TRIM(c.nombre), '[[:space:]]+', ' ')) = LOWER(?)
         ${excluirId ? 'AND c.id <> ?' : ''}
       LIMIT 1`,
      excluirId
        ? [empresaId, areaId, nombreNormalizado, excluirId]
        : [empresaId, areaId, nombreNormalizado]
    )
    if ((porNombre as unknown[]).length > 0) return { campo: 'nombre' }
  }

  const rucNormalizado = ruc ? normalizarRucCliente(ruc) : ''
  if (rucNormalizado) {
    const [porRuc] = await pool.query(
      `SELECT c.id FROM clientes c
       INNER JOIN areas a ON a.id = c.area_id
       WHERE a.empresa_id = ? AND c.activo = TRUE
         AND c.ruc IS NOT NULL AND TRIM(c.ruc) <> ''
         AND REPLACE(REPLACE(REPLACE(UPPER(TRIM(c.ruc)), '.', ''), '-', ''), ' ', '') = ?
         ${excluirId ? 'AND c.id <> ?' : ''}
       LIMIT 1`,
      excluirId
        ? [empresaId, rucNormalizado, excluirId]
        : [empresaId, rucNormalizado]
    )
    if ((porRuc as unknown[]).length > 0) return { campo: 'ruc' }
  }

  return null
}

function mensajeClienteDuplicado(campo: 'nombre' | 'ruc'): string {
  return campo === 'nombre'
    ? 'Ya existe un cliente con ese nombre en esta división.'
    : 'Ya existe un cliente con ese RUC en esta empresa.'
}

export async function GET(request: Request) {
  try {
    const context = await getContextoActivo(request)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const { searchParams } = new URL(request.url)
    const areaId = searchParams.get('area_id')

    // El selector de actividades incluye clientes asignados por presupuesto y
    // clientes de outsourcing donde la persona figura como encargado/asistente.
    const soloAsignados = searchParams.get('solo_asignados') === '1' && !esAdministrador(context.user)
    const usuarioIndividual = !esAdministrador(context.user) && !esJefeDeArea(context.user) && context.user.rol !== 'socio'

    let query = `SELECT c.id, c.nombre, c.ruc, c.correo, c.telefono, c.direccion, c.encargado, c.asistente, c.es_outsourcing, c.encargado_usuario_id,
       c.area_id, c.horas_contratadas,
       COALESCE((SELECT SUM(GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, a.fin) -
         COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, a.fin)))
           FROM pausas p WHERE p.actividad_id = a.id), 0)))
         FROM actividades a WHERE a.cliente_id = c.id AND a.fin IS NOT NULL
           AND a.estado IN ('PENDIENTE_APROBACION', 'APROBADA')), 0) / 3600 AS horas_consumidas,
       c.activo, c.created_at,
      a.nombre AS area_nombre
      FROM clientes c
      INNER JOIN areas a ON a.id = c.area_id
      WHERE c.activo = TRUE AND a.empresa_id = ?`
    const params: (string | number)[] = [context.empresaId]

    const presupuestoAsignado = `EXISTS (
      SELECT 1 FROM presupuestos p
      JOIN presupuesto_servicios s ON s.presupuesto_id = p.id
      JOIN presupuesto_asignaciones pa ON pa.servicio_id = s.id
      WHERE p.cliente_id = c.id AND pa.usuario_id = ?
        AND pa.estado = 'CONFIRMADA' AND s.activo = TRUE
        AND s.origen IN ('DETALLADO', 'COMPLEMENTARIO')
    )`
    const personalCliente = `c.es_outsourcing = TRUE AND EXISTS (
      SELECT 1 FROM clientes_asignaciones ca
       WHERE ca.cliente_id = c.id AND ca.usuario_id = ? AND ca.activo = TRUE
    )`
    if (soloAsignados) {
      query += ` AND (${personalCliente} OR ${presupuestoAsignado})`
      params.push(context.user.id, context.user.id)
    } else if (usuarioIndividual) {
      query += ` AND (${personalCliente})`
      params.push(context.user.id)
    }

    const areaJefe = esJefeDeArea(context.user) ? context.user.area_id : null
    if (areaId) {
      const parsedAreaId = Number(areaId)
      if (!Number.isInteger(parsedAreaId) || parsedAreaId <= 0) {
        return NextResponse.json({ error: 'La división indicada no es válida.' }, { status: 400 })
      }
      if (areaJefe != null && parsedAreaId !== areaJefe) {
        return NextResponse.json({ error: 'Sólo puedes consultar clientes de tu área.' }, { status: 403 })
      }
      query += ' AND c.area_id = ?'
      params.push(parsedAreaId)
    } else if (areaJefe != null) {
      query += ' AND c.area_id = ?'
      params.push(areaJefe)
    }

    query += ' ORDER BY c.nombre'

    const [rows] = await pool.query(query, params)
    const clientes = rows as Array<{
      id: number
      nombre: string
      horas_contratadas: number | string
      horas_consumidas: number | string
    }>
    await notificarBolsasHorasLote(clientes, context.empresaId)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al obtener clientes:', error)
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

    const lectura = await leerJson(request, esquemaCliente)
    if (!lectura.ok) return lectura.response
    const body = lectura.data
    const { nombre, ruc, correo, telefono, direccion, encargado, asistente, area_id, horas_contratadas } = body
    const outsourcing = body.es_outsourcing === true
    const encargadoUsuarioId = body.encargado_usuario_id == null || body.encargado_usuario_id === '' ? null : Number(body.encargado_usuario_id)
    const asistentesUsuarioIds = Array.isArray(body.asistentes_usuario_ids) ? [...new Set(body.asistentes_usuario_ids.map(Number))] : []
    const nombreLimpio = normalizarNombreCliente(String(nombre ?? ''))
    const rucLimpio = ruc?.trim() || null
    const areaId = Number(area_id)
    if (!nombreLimpio) {
      return NextResponse.json({ error: 'El nombre del cliente es obligatorio.' }, { status: 400 })
    }
    if (!Number.isInteger(areaId) || areaId <= 0) {
      return NextResponse.json({ error: 'La división es obligatoria.' }, { status: 400 })
    }
    if (jefeUsuario && areaId !== context.user.area_id) {
      return NextResponse.json({ error: 'Sólo puedes crear clientes en tu área.' }, { status: 403 })
    }
    if ((encargado || asistente || encargadoUsuarioId || asistentesUsuarioIds.length) && !outsourcing) {
      return NextResponse.json({ error: 'Encargados y asistentes solo aplican a clientes de outsourcing.' }, { status: 400 })
    }
    if (encargadoUsuarioId != null) {
      if (!Number.isInteger(encargadoUsuarioId) || (!jefeUsuario && !adminUsuario)) return NextResponse.json({ error: 'Solo el jefe de área puede asignar el encargado.' }, { status: 403 })
      const [usuarios] = await pool.query('SELECT id FROM usuarios WHERE id = ? AND area_id = ? AND activo = TRUE', [encargadoUsuarioId, areaId])
      if (!(usuarios as unknown[]).length) return NextResponse.json({ error: 'El encargado debe ser un usuario activo de la misma área.' }, { status: 400 })
    }
    if (asistentesUsuarioIds.length) {
      if (!jefeUsuario && !adminUsuario) return NextResponse.json({ error: 'Solo el jefe de área puede asignar asistentes.' }, { status: 403 })
      if (asistentesUsuarioIds.some((id) => !Number.isInteger(id) || id <= 0)) return NextResponse.json({ error: 'La lista de asistentes no es válida.' }, { status: 400 })
      const [asistentesActivos] = await pool.query(`SELECT u.id FROM usuarios u JOIN areas a ON a.id = u.area_id JOIN areas area_cliente ON area_cliente.id = ? AND area_cliente.empresa_id = a.empresa_id WHERE u.id IN (${asistentesUsuarioIds.map(() => '?').join(',')}) AND u.activo = TRUE AND u.rol IN ('PERSONAL','SUPERVISOR','JEFE_AREA')`, [areaId, ...asistentesUsuarioIds])
      if ((asistentesActivos as unknown[]).length !== asistentesUsuarioIds.length) return NextResponse.json({ error: 'Los asistentes deben ser integrantes activos de un área de la empresa.' }, { status: 400 })
    }

    const [areaRows] = await pool.query(
      'SELECT id FROM areas WHERE id = ? AND empresa_id = ? AND activo = TRUE',
      [areaId, context.empresaId]
    )
    if ((areaRows as unknown[]).length === 0) {
      return NextResponse.json({ error: 'La división no pertenece a la empresa activa.' }, { status: 400 })
    }

    const duplicado = await buscarClienteDuplicado(context.empresaId, areaId, nombreLimpio, rucLimpio)
    if (duplicado) {
      return NextResponse.json(
        { error: mensajeClienteDuplicado(duplicado.campo) },
        { status: 409 }
      )
    }

    const [result] = await pool.query(
      `INSERT INTO clientes (nombre, ruc, correo, telefono, direccion, encargado, asistente, es_outsourcing, encargado_usuario_id, area_id, horas_contratadas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombreLimpio,
        rucLimpio,
        correo?.trim() || null,
        telefono?.trim() || null,
        direccion?.trim() || null,
        encargado?.trim() || null,
        asistente?.trim() || null,
        outsourcing,
        encargadoUsuarioId,
        areaId,
        horas_contratadas || 0,
      ]
    )

    const clienteId = (result as { insertId: number }).insertId
    if (encargadoUsuarioId != null) await pool.query(`INSERT INTO clientes_asignaciones (cliente_id, usuario_id, funcion, creado_por) VALUES (?, ?, 'ENCARGADO', ?)`, [clienteId, encargadoUsuarioId, context.user.id])
    if (asistentesUsuarioIds.length) {
      const valores = asistentesUsuarioIds.map(() => "(?, ?, 'ASISTENTE', ?)").join(', ')
      await pool.query(
        `INSERT INTO clientes_asignaciones (cliente_id, usuario_id, funcion, creado_por) VALUES ${valores}`,
        asistentesUsuarioIds.flatMap((asistenteId) => [clienteId, asistenteId, context.user.id]),
      )
    }
    return NextResponse.json({ ok: true, id: clienteId })
  } catch (error) {
    console.error('Error al crear cliente:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
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

    const lectura = await leerJson(request, esquemaCliente)
    if (!lectura.ok) return lectura.response
    const body = lectura.data
    const { id, nombre, ruc, correo, telefono, direccion, encargado, asistente, area_id, horas_contratadas } = body
    if (!id) return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    if ((encargado || asistente) && body.es_outsourcing !== true) {
      return NextResponse.json({ error: 'Encargado y asistente solo aplican a clientes de outsourcing.' }, { status: 400 })
    }

    const [exists] = await pool.query(
      `SELECT c.id, c.area_id, c.nombre, c.ruc, c.es_outsourcing, c.encargado_usuario_id, c.encargado, c.asistente FROM clientes c INNER JOIN areas a ON a.id = c.area_id
       WHERE c.id = ? AND a.empresa_id = ?`,
      [id, context.empresaId]
    )
    const clienteExistente = (exists as Array<{
      id: number
      area_id: number
      nombre: string
      ruc: string | null
      es_outsourcing: number | boolean
      encargado_usuario_id: number | null
      encargado: string | null
      asistente: string | null
    }>)[0]
    if (!clienteExistente) {
      return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 })
    }
    if (jefeUsuario && Number(clienteExistente.area_id) !== context.user.area_id) {
      return NextResponse.json({ error: 'Sólo puedes modificar clientes de tu área.' }, { status: 403 })
    }

    let nuevaAreaId: number | null = null
    if (area_id != null) {
      nuevaAreaId = Number(area_id)
      if (jefeUsuario && nuevaAreaId !== context.user.area_id) {
        return NextResponse.json({ error: 'No puedes mover clientes fuera de tu área.' }, { status: 403 })
      }
      const [areaRows] = await pool.query(
        'SELECT id FROM areas WHERE id = ? AND empresa_id = ? AND activo = TRUE',
        [nuevaAreaId, context.empresaId]
      )
      if ((areaRows as unknown[]).length === 0) {
        return NextResponse.json({ error: 'La división no pertenece a la empresa activa.' }, { status: 400 })
      }
    }

    const nombreEfectivo = nombre != null && String(nombre).trim()
      ? String(nombre)
      : clienteExistente.nombre
    const rucEfectivo = ruc != null && String(ruc).trim()
      ? String(ruc)
      : clienteExistente.ruc
    const areaEfectiva = nuevaAreaId ?? Number(clienteExistente.area_id)
    const nombreCambia = normalizarNombreCliente(nombreEfectivo)
      !== normalizarNombreCliente(clienteExistente.nombre)
    const rucCambia = Boolean(rucEfectivo)
      && normalizarRucCliente(String(rucEfectivo))
        !== normalizarRucCliente(String(clienteExistente.ruc ?? ''))
    const areaCambia = areaEfectiva !== Number(clienteExistente.area_id)

    if (nombreCambia || rucCambia || areaCambia) {
      const duplicado = await buscarClienteDuplicado(
        context.empresaId,
        areaEfectiva,
        nombreCambia || areaCambia ? nombreEfectivo : null,
        rucCambia ? rucEfectivo : null,
        Number(id)
      )
      if (duplicado) {
        return NextResponse.json(
          { error: mensajeClienteDuplicado(duplicado.campo) },
          { status: 409 }
        )
      }
    }

    await pool.query(
      `UPDATE clientes SET
        nombre = COALESCE(?, nombre),
        ruc = COALESCE(?, ruc),
        correo = COALESCE(?, correo),
        telefono = COALESCE(?, telefono),
        direccion = COALESCE(?, direccion),
        encargado = COALESCE(?, encargado),
        asistente = COALESCE(?, asistente),
        area_id = COALESCE(?, area_id),
        horas_contratadas = COALESCE(?, horas_contratadas)
       WHERE id = ?`,
      [nombre?.trim() || null, ruc?.trim() || null, correo?.trim() || null, telefono?.trim() || null, direccion?.trim() || null, encargado?.trim() || null, asistente?.trim() || null, nuevaAreaId, horas_contratadas ?? null, id]
    )

    if (Object.prototype.hasOwnProperty.call(body, 'es_outsourcing') || Object.prototype.hasOwnProperty.call(body, 'encargado_usuario_id') || Array.isArray(body.asistentes_usuario_ids)) {
      const outsourcing = body.es_outsourcing == null ? Boolean(clienteExistente.es_outsourcing) : body.es_outsourcing === true
      const asignaEncargado = Object.prototype.hasOwnProperty.call(body, 'encargado_usuario_id')
      const encargadoId = !outsourcing ? null : asignaEncargado
        ? (body.encargado_usuario_id == null || body.encargado_usuario_id === '' ? null : Number(body.encargado_usuario_id))
        : clienteExistente.encargado_usuario_id
      const areaDestino = nuevaAreaId ?? Number(clienteExistente.area_id)
      if (asignaEncargado && encargadoId != null) {
        if (!jefeUsuario && !adminUsuario) return NextResponse.json({ error: 'Solo el jefe de área puede asignar encargados.' }, { status: 403 })
        const [usuarios] = await pool.query('SELECT id FROM usuarios WHERE id = ? AND area_id = ? AND activo = TRUE', [encargadoId, areaDestino])
        if (!(usuarios as unknown[]).length) return NextResponse.json({ error: 'El encargado debe ser un usuario activo de la misma área.' }, { status: 400 })
      }
      const encargadoNombre = Object.prototype.hasOwnProperty.call(body, 'encargado') ? encargado?.trim() || null : clienteExistente.encargado
      const asistenteNombre = Object.prototype.hasOwnProperty.call(body, 'asistente') ? asistente?.trim() || null : clienteExistente.asistente
      await pool.query('UPDATE clientes SET es_outsourcing = ?, encargado_usuario_id = ?, encargado = ?, asistente = ? WHERE id = ?', [outsourcing, encargadoId, outsourcing ? encargadoNombre : null, outsourcing ? asistenteNombre : null, id])
      if (asignaEncargado || !outsourcing) {
        await pool.query("UPDATE clientes_asignaciones SET activo = FALSE WHERE cliente_id = ? AND funcion = 'ENCARGADO'", [id])
        if (encargadoId != null) await pool.query("INSERT INTO clientes_asignaciones (cliente_id, usuario_id, funcion, creado_por) VALUES (?, ?, 'ENCARGADO', ?) ON DUPLICATE KEY UPDATE activo = TRUE, creado_por = VALUES(creado_por)", [id, encargadoId, context.user.id])
      }
      if (Array.isArray(body.asistentes_usuario_ids)) {
        const asistentes = [...new Set(body.asistentes_usuario_ids.map(Number))]
        if (asistentes.length && (!jefeUsuario && !adminUsuario)) return NextResponse.json({ error: 'Solo el jefe de área puede asignar asistentes.' }, { status: 403 })
        if (asistentes.some((asistenteId) => !Number.isInteger(asistenteId) || asistenteId <= 0)) return NextResponse.json({ error: 'La lista de asistentes no es válida.' }, { status: 400 })
        if (asistentes.length) {
          const [usuariosActivos] = await pool.query(`SELECT u.id FROM usuarios u JOIN areas a ON a.id = u.area_id JOIN areas area_cliente ON area_cliente.id = ? AND area_cliente.empresa_id = a.empresa_id WHERE u.id IN (${asistentes.map(() => '?').join(',')}) AND u.activo = TRUE AND u.rol IN ('PERSONAL','SUPERVISOR','JEFE_AREA')`, [areaDestino, ...asistentes])
          if ((usuariosActivos as unknown[]).length !== asistentes.length) return NextResponse.json({ error: 'Los asistentes deben ser integrantes activos de un área de la empresa.' }, { status: 400 })
        }
        await pool.query("UPDATE clientes_asignaciones SET activo = FALSE WHERE cliente_id = ? AND funcion = 'ASISTENTE'", [id])
        if (asistentes.length) {
          const valores = asistentes.map(() => "(?, ?, 'ASISTENTE', ?)").join(', ')
          await pool.query(
            `INSERT INTO clientes_asignaciones (cliente_id, usuario_id, funcion, creado_por) VALUES ${valores} ON DUPLICATE KEY UPDATE activo = TRUE, creado_por = VALUES(creado_por)`,
            asistentes.flatMap((asistenteId) => [id, asistenteId, context.user.id]),
          )
        }
      }
      if (!outsourcing) await pool.query("UPDATE clientes_asignaciones SET activo = FALSE WHERE cliente_id = ? AND funcion = 'ASISTENTE'", [id])
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al actualizar cliente:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
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

    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })
    const [result] = await pool.query(
      `UPDATE clientes c INNER JOIN areas a ON a.id = c.area_id
       SET c.activo = FALSE
       WHERE c.id = ? AND a.empresa_id = ?${jefeUsuario ? ' AND c.area_id = ?' : ''}`,
      jefeUsuario ? [id, context.empresaId, context.user.area_id] : [id, context.empresaId]
    )
    if ((result as { affectedRows: number }).affectedRows === 0) {
      return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar cliente:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
