import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'

import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdministrador, esJefeDeArea, esSocio } from '@/lib/permisos'
import pool from '@/lib/db'

export const runtime = 'nodejs'

/**
 * Cartera de clientes: una fila por cliente con los agregados que la pantalla
 * necesita, más las alertas reales.
 *
 * Reglas que se respetan aquí y que no se pueden relajar:
 *
 * - `horasContratadas` son las bolsas ACTIVAS (`clientes.horas_contratadas`).
 *   Un presupuesto en revisión NO suma contrato: son horas propuestas.
 * - `horasPorAprobar` son actividades en PENDIENTE_APROBACION. Van aparte
 *   porque ya están dentro de `horasConsumidas`: sumarlas otra vez en el total
 *   de la cartera las contaría dos veces.
 * - El estado del cliente se DERIVA de esos números, no se guarda ni se inventa.
 * - Las horas se calculan con el mismo criterio que el resto del sistema:
 *   segundos transcurridos menos pausas, en horas.
 */

type FilaCliente = RowDataPacket & {
  id: number
  nombre: string
  area_id: number
  area_nombre: string
  ruc: string | null
  correo: string | null
  telefono: string | null
  direccion: string | null
  horas_contratadas: string
  horas_bolsas_activas: string
  horas_propuestas: string
  horas_consumidas: string
  horas_por_aprobar: string
  presupuesto_estado: string | null
  presupuesto_versiones: number
  ultima_actividad: string | null
}

type ClienteCartera = {
  id: number
  nombre: string
  area_id: number
  area_nombre: string
  ruc: string | null
  correo: string | null
  telefono: string | null
  direccion: string | null
  horasContratadas: number
  /** Horas del Excel pendientes de aprobar. No son contrato. */
  horasPropuestas: number
  horasConsumidas: number
  horasPorAprobar: number
  horasDisponibles: number
  horasExcedidas: number
  desviacion: number
  desviacionPorcentaje: number | null
  servicios: string[]
  /** Bolsas reales, aunque `servicios` venga sin nombres repetidos. */
  serviciosConteo: number
  estado: 'EN_CURSO' | 'EN_RIESGO' | 'PENDIENTE' | 'SIN_PRESUPUESTO'
  ultimaActividad: string | null
  /**
   * Lo que dice la columna desnormalizada `clientes.horas_contratadas`. Se
   * devuelve solo para poder detectar la deriva: si difiere de
   * `horasContratadas`, alguien escribio el campo a mano.
   */
  horasContratadasCampo: number
}

type Alerta = {
  id: string
  clienteId: number
  clienteNombre: string
  tipo: 'desviacion' | 'pendiente' | 'informativa'
  titulo: string
  descripcion: string
  dato: string
  cuando: string | null
}

function n(v: unknown): number {
  return Math.round(Number(v ?? 0) * 100) / 100
}

const FORMAT = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 })
const fmt = (valor: number) => `${FORMAT.format(valor)} h`

/** Horas de una actividad: transcurrido menos pausas, en horas. */
const HORAS_ACTIVIDAD = `GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, a.fin) -
  COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, a.fin)))
             FROM pausas p WHERE p.actividad_id = a.id), 0))`

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }
    // La cartera la consultan los tres roles que administran clientes: el admin
    // de la empresa, el jefe de su área (que ve la suya) y el socio, que la ve
    // entera sin poder tocarla. El filtro por área se aplica más abajo, solo al
    // jefe: por eso no basta con pedir `veTodaLaEmpresa`.
    if (!esAdministrador(user) && !esJefeDeArea(user) && !esSocio(user)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    const params: (string | number)[] = [context.activa.id]
    let filtroArea = ''
    if (esJefeDeArea(user) && user.area_id) {
      filtroArea = ' AND c.area_id = ?'
      params.push(user.area_id)
    }

    // Una consulta por cliente, con los agregados ya resueltos. Se evita el N+1
    // de la versión anterior: el jefe de área con 40 clientes hacía 40 viajes.
    const [filas] = await pool.query<FilaCliente[]>(
      `SELECT c.id, c.nombre, c.area_id, a.nombre AS area_nombre,
              c.ruc, c.correo, c.telefono, c.direccion,
              c.horas_contratadas,
              -- Fuente de verdad: las bolsas ACTIVAS. La columna
              -- clientes.horas_contratadas es un campo desnormalizado que ademas
              -- escribe el formulario de alta y edicion, asi que puede quedar
              -- desfasado respecto de la realidad. Los consolidados nunca
              -- cuentan como bolsa.
              COALESCE((SELECT SUM(s.horas)
                          FROM presupuesto_servicios s
                          JOIN presupuestos p2 ON p2.id = s.presupuesto_id
                         WHERE p2.cliente_id = c.id AND s.activo = TRUE
                           AND s.origen <> 'CONSOLIDADO'), 0)
                AS horas_bolsas_activas,
              -- Lo que el Excel propone y aún no está aprobado. Es la cifra que
              -- diferencia a un cliente que tiene presupuesto del que no tiene
              -- nada, cuando todavía no se ha activado ninguna bolsa.
              COALESCE((SELECT SUM(s.horas)
                          FROM presupuesto_servicios s
                          JOIN presupuestos p2 ON p2.id = s.presupuesto_id
                         WHERE p2.cliente_id = c.id AND s.activo = FALSE
                           AND s.origen <> 'CONSOLIDADO'), 0)
                AS horas_propuestas,
              COALESCE((SELECT SUM(${HORAS_ACTIVIDAD})
                          FROM actividades a
                         WHERE a.cliente_id = c.id AND a.fin IS NOT NULL
                           AND a.estado IN ('PENDIENTE_APROBACION','APROBADA')), 0) / 3600
                AS horas_consumidas,
              COALESCE((SELECT SUM(${HORAS_ACTIVIDAD})
                          FROM actividades a
                         WHERE a.cliente_id = c.id AND a.fin IS NOT NULL
                           AND a.estado = 'PENDIENTE_APROBACION'), 0) / 3600
                AS horas_por_aprobar,
              (SELECT p.estado FROM presupuestos p
                WHERE p.cliente_id = c.id
                ORDER BY (p.estado = 'APROBADO') DESC, p.version DESC
                LIMIT 1) AS presupuesto_estado,
              (SELECT COUNT(*) FROM presupuestos p
                WHERE p.cliente_id = c.id) AS presupuesto_versiones,
              (SELECT MAX(a.fin) FROM actividades a
                WHERE a.cliente_id = c.id AND a.fin IS NOT NULL) AS ultima_actividad
         FROM clientes c
         INNER JOIN areas a ON a.id = c.area_id
        WHERE c.activo = TRUE AND a.empresa_id = ?${filtroArea}
        ORDER BY c.nombre`,
      params
    )

    const ids = filas.map((f) => f.id)

    // Servicios: nombres de las bolsas activas; si el cliente no tiene ninguna
    // activada todavía, se listan las detalladas Proposed para que se vea qué
    // se está por aprobar, marcado como propuesta más adelante.
    const serviciosPorCliente = new Map<number, { nombre: string; activo: boolean }[]>()
    if (ids.length) {
      const [servicios] = await pool.query<
        (RowDataPacket & { presupuesto_id: number; cliente_id: number; nombre: string; activo: number; origen: string })[]
      >(
        `SELECT s.presupuesto_id, p.cliente_id, s.nombre, s.activo, s.origen
           FROM presupuesto_servicios s
           JOIN presupuestos p ON p.id = s.presupuesto_id
          WHERE p.cliente_id IN (${ids.map(() => '?').join(',')})
            AND s.origen = 'DETALLADO'
          ORDER BY s.nombre`,
        ids
      )
      for (const s of servicios) {
        const lista = serviciosPorCliente.get(s.cliente_id) ?? []
        lista.push({ nombre: s.nombre, activo: s.activo === 1 })
        serviciosPorCliente.set(s.cliente_id, lista)
      }
    }

    const clientes: ClienteCartera[] = filas.map((f) => {
      // Se usan las bolsas activas, no el campo desnormalizado. Asi la pantalla
      // nunca muestra horas contratadas que nadie ha aprobado.
      const contratadas = n(f.horas_bolsas_activas)
      const consumidas = n(f.horas_consumidas)
      const porAprobar = n(f.horas_por_aprobar)
      const excedidas = Math.max(0, consumidas - contratadas)
      const desviacion = n(consumidas - contratadas)
      const presupuestoAprobado = f.presupuesto_estado === 'APROBADO'
      const tienePresupuesto = (f.presupuesto_versiones ?? 0) > 0

      // Estado derivado SOLO del presupuesto, sin mirar proyectos. El cliente
      // se gestiona con su Excel: sin presupuesto no hay nada que gestionar;
      // con presupuesto sin aprobar hay algo que decidir; en riesgo es que ya se
      // pasó de lo contratado.
      let estado: ClienteCartera['estado'] = 'EN_CURSO'
      if (!tienePresupuesto) estado = 'SIN_PRESUPUESTO'
      else if (excedidas > 0) estado = 'EN_RIESGO'
      else if (!presupuestoAprobado) estado = 'PENDIENTE'

      // Se devuelven nombres SIN repetir. Un presupuesto puede traer varias
      // filas del mismo servicio (una por categoría, por ejemplo: BATERIAS
      // ETNA tiene tres bolsas Detailed de "FORTALECIMIENTO DEL CONTROL
      // INTERNO"). En la tabla de cartera se pintan como etiquetas, y tres
      // etiquetas idénticas no dicen nada. El detalle de cada bolsa con sus
      // horas se conserva en la vista de gestión integral.
      const nombres = (serviciosPorCliente.get(f.id) ?? []).map((s) => s.nombre)
      const servicios = [...new Set(nombres)]

      return {
        id: f.id,
        nombre: f.nombre,
        area_id: f.area_id,
        area_nombre: f.area_nombre,
        ruc: f.ruc,
        correo: f.correo,
        telefono: f.telefono,
        direccion: f.direccion,
        horasContratadas: contratadas,
        horasPropuestas: n(f.horas_propuestas),
        horasConsumidas: consumidas,
        horasPorAprobar: porAprobar,
        horasDisponibles: Math.max(0, contratadas - consumidas),
        horasExcedidas: excedidas,
        desviacion,
        desviacionPorcentaje:
          desviacion === 0 || contratadas <= 0 ? null : Math.round((desviacion / contratadas) * 1000) / 10,
        servicios,
        /** Cuántas bolsas hay en realidad, aunque `servicios` venga sin repetir. */
        serviciosConteo: nombres.length,
        estado,
        ultimaActividad: f.ultima_actividad ? String(f.ultima_actividad).slice(0, 16) : null,
        horasContratadasCampo: n(f.horas_contratadas),
      }
    })

    // --- alertas: se derivan de los mismos números, no se almacenan ----------
    const alertas: Alerta[] = []
    for (const c of clientes) {
      if (c.horasExcedidas > 0) {
        alertas.push({
          id: `exceso-${c.id}`,
          clienteId: c.id,
          clienteNombre: c.nombre,
          tipo: 'desviacion',
          titulo: 'Exceso de horas contratadas',
          descripcion:
            'Se han registrado más horas de las que hay contratadas. Necesita una ampliación aprobada del presupuesto.',
          dato: `+${fmt(c.horasExcedidas)}`,
          cuando: c.ultimaActividad,
        })
      }
      if (c.horasPorAprobar > 0) {
        alertas.push({
          id: `aprobar-${c.id}`,
          clienteId: c.id,
          clienteNombre: c.nombre,
          tipo: 'pendiente',
          titulo: 'Horas pendientes de aprobación',
          descripcion: 'Registros enviados que todavía no ha revisado quien administra el área.',
          dato: fmt(c.horasPorAprobar),
          cuando: c.ultimaActividad,
        })
      }
      if (c.estado === 'SIN_PRESUPUESTO') {
        alertas.push({
          id: `sinpresupuesto-${c.id}`,
          clienteId: c.id,
          clienteNombre: c.nombre,
          tipo: 'informativa',
          titulo: 'Cliente sin presupuesto',
          descripcion: 'No tiene ningún presupuesto importado, así que no hay horas que gestionar.',
          dato: '0 h',
          cuando: null,
        })
      } else if (c.estado === 'PENDIENTE' && c.servicios.length > 0) {
        alertas.push({
          id: `presupuesto-${c.id}`,
          clienteId: c.id,
          clienteNombre: c.nombre,
          tipo: 'informativa',
          titulo: 'Presupuesto sin aprobar',
          descripcion: `Hay ${c.serviciosConteo} servicios cargados que todavía no cuentan como horas contratadas.`,
          dato: fmt(c.horasContratadas),
          cuando: null,
        })
      }
    }

    // La más urgente primero, que es como las lee el usuario.
    const peso = { desviacion: 0, pendiente: 1, informativa: 2 } as const
    alertas.sort((a, b) => peso[a.tipo] - peso[b.tipo] || a.clienteNombre.localeCompare(b.clienteNombre, 'es'))

    const totales = {
      clientes: clientes.length,
      contratadas: n(clientes.reduce((t, c) => t + c.horasContratadas, 0)),
      consumidas: n(clientes.reduce((t, c) => t + c.horasConsumidas, 0)),
      disponibles: n(clientes.reduce((t, c) => t + c.horasDisponibles, 0)),
      excedidas: n(clientes.reduce((t, c) => t + c.horasExcedidas, 0)),
      porAprobar: n(clientes.reduce((t, c) => t + c.horasPorAprobar, 0)),
    }

    return NextResponse.json({ totales, clientes, alertas })
  } catch (error) {
    console.error('Error al cargar la cartera de clientes:', error)
    return NextResponse.json({ error: 'No se pudo cargar la cartera.' }, { status: 500 })
  }
}
