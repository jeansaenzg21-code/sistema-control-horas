import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'
import { esJefeDeArea } from '@/lib/permisos'
import { leerJson } from '@/lib/validacion/leer-json'
import { esquemaCliente } from '@/lib/validacion/clientes'
import { notificarBolsaHoras } from '@/lib/bolsa-alertas'

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

    let query = `SELECT c.id, c.nombre, c.ruc, c.correo, c.telefono, c.direccion,
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
    await Promise.all(
      clientes.map((cliente) => notificarBolsaHoras(cliente, context.empresaId))
    )
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
    const { nombre, ruc, correo, telefono, direccion, area_id, horas_contratadas } = body
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

    const [areaRows] = await pool.query(
      'SELECT id FROM areas WHERE id = ? AND empresa_id = ? AND activo = TRUE',
      [areaId, context.empresaId]
    )
    if ((areaRows as unknown[]).length === 0) {
      return NextResponse.json({ error: 'La divisi��n no pertenece a la empresa activa.' }, { status: 400 })
    }

    const duplicado = await buscarClienteDuplicado(context.empresaId, areaId, nombreLimpio, rucLimpio)
    if (duplicado) {
      return NextResponse.json(
        { error: mensajeClienteDuplicado(duplicado.campo) },
        { status: 409 }
      )
    }

    const [result] = await pool.query(
      `INSERT INTO clientes (nombre, ruc, correo, telefono, direccion, area_id, horas_contratadas)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nombreLimpio,
        rucLimpio,
        correo?.trim() || null,
        telefono?.trim() || null,
        direccion?.trim() || null,
        areaId,
        horas_contratadas || 0,
      ]
    )

    return NextResponse.json({ ok: true, id: (result as { insertId: number }).insertId })
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
    const { id, nombre, ruc, correo, telefono, direccion, area_id, horas_contratadas } = body
    if (!id) return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })

    const [exists] = await pool.query(
      `SELECT c.id, c.area_id, c.nombre, c.ruc FROM clientes c INNER JOIN areas a ON a.id = c.area_id
       WHERE c.id = ? AND a.empresa_id = ?`,
      [id, context.empresaId]
    )
    const clienteExistente = (exists as Array<{
      id: number
      area_id: number
      nombre: string
      ruc: string | null
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
        return NextResponse.json({ error: 'La divisi��n no pertenece a la empresa activa.' }, { status: 400 })
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
        area_id = COALESCE(?, area_id),
        horas_contratadas = COALESCE(?, horas_contratadas)
       WHERE id = ?`,
      [nombre?.trim() || null, ruc?.trim() || null, correo?.trim() || null, telefono?.trim() || null, direccion?.trim() || null, nuevaAreaId, horas_contratadas ?? null, id]
    )

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
