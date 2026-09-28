// Lectura de presupuestos para la pantalla de la ficha del cliente.
//
// Los importes y el detalle económico SOLO se devuelven a quien puede verlos. Un
// trabajador ve sus horas asignadas y su saldo, no la propuesta completa.

import type { RowDataPacket } from 'mysql2'

import pool from '@/lib/db'

export type ResumenAsignacion = {
  id: number
  usuarioId: number | null
  usuarioNombre: string | null
  nombreTexto: string | null
  categoria: string | null
  horas: number
  estado: 'CONFIRMADA' | 'PENDIENTE_REVISION' | 'RECHAZADA'
  motivo: string | null
}

export type ResumenServicio = {
  id: number
  origen: 'DETALLADO' | 'CONSOLIDADO' | 'COMPLEMENTARIO'
  nombre: string
  horas: number
  importe: number | null
  fee: number | null
  nota: string | null
  proyectoId: number | null
  asignaciones: ResumenAsignacion[]
}

export type ResumenPresupuesto = {
  id: number
  version: number
  estado: 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'OBSERVADO'
  archivoNombre: string
  archivoHash: string
  creadoEn: string
  revisadoPor: string | null
  totales: {
    horasDetallado: number
    horasConsolidado: number
    /** Lo que falta por confirmar antes de poder aprobar. */
    asignacionesPendientes: number
    observacionesBloqueantes: number
  }
  observaciones: { tipo: string; severidad: string; mensaje: string }[]
  servicios: ResumenServicio[]
}

function extraerObservaciones(analisis: unknown): {
  tipo: string
  severidad: string
  mensaje: string
}[] {
  if (!analisis || typeof analisis !== 'object') return []
  const lista = (analisis as { observaciones?: unknown }).observaciones
  if (!Array.isArray(lista)) return []
  return lista
    .filter((o): o is { tipo: string; severidad: string; mensaje: string } => {
      if (!o || typeof o !== 'object') return false
      const c = o as Record<string, unknown>
      return typeof c.tipo === 'string' && typeof c.severidad === 'string' && typeof c.mensaje === 'string'
    })
    .map((o) => ({ tipo: o.tipo, severidad: o.severidad, mensaje: o.mensaje }))
}

export async function obtenerPresupuestosDeCliente(
  clienteId: number,
  empresaId: number,
  verImportes = false
): Promise<ResumenPresupuesto[]> {
  const [presupuestos] = await pool.query<
    (RowDataPacket & {
      id: number
      version: number
      estado: ResumenPresupuesto['estado']
      archivo_nombre: string
      archivo_hash: string
      analisis: string | null
      creado_en: string
      revisado_por: number | null
      revisado_nombre: string | null
    })[]
  >(
    `SELECT p.id, p.version, p.estado, p.archivo_nombre, p.archivo_hash,
            p.analisis, p.creado_en, p.revisado_por, u.nombre AS revisado_nombre
       FROM presupuestos p
       LEFT JOIN usuarios u ON u.id = p.revisado_por
      WHERE p.cliente_id = ? AND p.empresa_id = ?
      ORDER BY p.version DESC`,
    [clienteId, empresaId]
  )

  if (presupuestos.length === 0) return []

  const ids = presupuestos.map((p) => p.id)

  const [servicios] = await pool.query<
    (RowDataPacket & {
      id: number
      presupuesto_id: number
      origen: ResumenServicio['origen']
      nombre: string
      horas: string | number
      importe: string | number | null
      fee: string | number | null
      nota: string | null
      proyecto_id: number | null
    })[]
  >(
    `SELECT id, presupuesto_id, origen, nombre, horas, importe, fee, nota, proyecto_id
       FROM presupuesto_servicios
      WHERE presupuesto_id IN (${ids.map(() => '?').join(',')})
      ORDER BY (origen = 'CONSOLIDADO'), horas DESC, id`,
    ids
  )

  const [asignaciones] = await pool.query<
    (RowDataPacket & {
      id: number
      servicio_id: number
      usuario_id: number | null
      usuario_nombre: string | null
      nombre_texto: string | null
      categoria: string | null
      horas: string | number
      estado: ResumenAsignacion['estado']
      motivo: string | null
    })[]
  >(
    `SELECT a.id, a.servicio_id, a.usuario_id, u.nombre AS usuario_nombre,
            a.nombre_texto, a.categoria, a.horas, a.estado, a.motivo
       FROM presupuesto_asignaciones a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.servicio_id IN (
        SELECT id FROM presupuesto_servicios
         WHERE presupuesto_id IN (${ids.map(() => '?').join(',')})
      )
      ORDER BY a.servicio_id, a.horas DESC`,
    ids
  )

  const asignacionesPorServicio = new Map<number, ResumenAsignacion[]>()
  for (const a of asignaciones) {
    const lista = asignacionesPorServicio.get(a.servicio_id) ?? []
    lista.push({
      id: a.id,
      usuarioId: a.usuario_id,
      usuarioNombre: a.usuario_nombre,
      nombreTexto: a.nombre_texto,
      categoria: a.categoria,
      horas: Number(a.horas),
      estado: a.estado,
      motivo: a.motivo,
    })
    asignacionesPorServicio.set(a.servicio_id, lista)
  }

  const serviciosPorPresupuesto = new Map<number, ResumenServicio[]>()
  for (const s of servicios) {
    const lista = serviciosPorPresupuesto.get(s.presupuesto_id) ?? []
    lista.push({
      id: s.id,
      origen: s.origen,
      nombre: s.nombre,
      horas: Number(s.horas),
      // El detalle económico no se envía si quien pregunta no puede verlo.
      importe: verImportes ? (s.importe === null ? null : Number(s.importe)) : null,
      fee: verImportes ? (s.fee === null ? null : Number(s.fee)) : null,
      nota: s.nota,
      proyectoId: s.proyecto_id,
      asignaciones: asignacionesPorServicio.get(s.id) ?? [],
    })
    serviciosPorPresupuesto.set(s.presupuesto_id, lista)
  }

  return presupuestos.map((p) => {
    const lista = serviciosPorPresupuesto.get(p.id) ?? []
    let analisis: unknown = null
    try {
      analisis = p.analisis ? JSON.parse(p.analisis) : null
    } catch {
      analisis = null
    }
    const totales = (analisis as { totales?: Record<string, number> } | null)?.totales ?? {}
    const observaciones = extraerObservaciones(analisis)

    return {
      id: p.id,
      version: p.version,
      estado: p.estado,
      archivoNombre: p.archivo_nombre,
      archivoHash: p.archivo_hash,
      creadoEn: String(p.creado_en),
      revisadoPor: p.revisado_nombre,
      totales: {
        horasDetallado: Number(totales.horasDetallado ?? 0),
        horasConsolidado: Number(totales.horasConsolidado ?? 0),
        asignacionesPendientes: lista.reduce(
          (n, s) => n + s.asignaciones.filter((a) => a.estado === 'PENDIENTE_REVISION').length,
          0
        ),
        observacionesBloqueantes: observaciones.filter((o) => o.severidad === 'BLOQUEANTE').length,
      },
      observaciones,
      servicios: lista,
    }
  })
}
