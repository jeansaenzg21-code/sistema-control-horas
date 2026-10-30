import { NextResponse } from 'next/server'
import { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esJefeDeArea } from '@/lib/permisos'

/**
 * Servicios (bolsas de horas) de un cliente, para elegirlos al registrar una
 * actividad.
 *
 * El servicio cuelga del cliente a DOS saltos:
 *   clientes -> presupuestos -> presupuesto_servicios
 * porque el presupuesto pertenece al cliente que contrata, no al proyecto
 * (ver cabecera de sql/presupuestos.sql). Por eso `cliente_id` es obligatorio y
 * no opcional: sin cliente no hay forma de saber de qué presupuesto salir.
 *
 * Solo se devuelven las bolsas REALES: `activo = TRUE` y origen DETALLADO o
 * COMPLEMENTARIO. El origen CONSOLIDADO queda fuera a proposito: por regla del
 * modulo nunca genera bolsa (si contara, el detalle de Santa Rosa daria 542 h en
 * lugar de 270 h), asi que imputar horas ahi no descuenta de nada.
 *
 * A QUIEN SE LE MUESTRA QUE:
 *
 * - Todo el mundo MENOS el ADMINISTRADOR ve únicamente los servicios que tiene
 *   ASIGNADOS con horas confirmadas. Es la regla que pidio el negocio: no
 *   ofrecer a alguien una bolsa que no es suya, para que no pueda imputar horas
 *   en el trabajo de otro. Incluye al JEFE DE AREA, que tampoco ve las bolsas de
 *   los demas. Su labor de repartir horas no se ve afectada: eso se hace desde la
 *   ficha del cliente (`GET /api/clientes/[id]/gestion`), que devuelve todas las
 *   bolsas del cliente. Aqui solo se decide que puede registrar en su propio
 *   nombre.
 *
 * - El ADMINISTRACION ve todas las bolsas activas del cliente, sin filtro. Es el
 *   unico perfil que gestiona sobre toda la empresa y no tiene asignaciones
 *   propias, asi que filtrarlo lo dejaria sin poder registrar nada.
 *
 * Cuando la lista sale vacia se le dice por que: `sinAsignaciones` distingue
 * "este cliente no tiene bolsas activas" de "las tiene, pero ninguna es tuya".
 * Sin esa distincion el formulario parece roto.
 */
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
    const clienteParam = searchParams.get('cliente_id')
    const clienteId = clienteParam == null || clienteParam === '' ? Number.NaN : Number(clienteParam)
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return NextResponse.json({ error: 'El cliente indicado no es válido.' }, { status: 400 })
    }

    const areaJefe = esJefeDeArea(user) ? user.area_id : null
    // Solo el ADMINISTRACION ve el conjunto. Cualquier otro perfil, incluido el
    // jefe de area, queda acotado a las bolsas que tiene asignadas.
    const rol = String(user.rol).toUpperCase()
    const veTodasLasBolsas = rol === 'ADMINISTRACION' || rol === 'ADMIN'

    // Solo se guarda una bolsa CONFIRMADA con dueño. Las PENDIENTE_REVISION del
    // Excel llegan con `usuario_id = NULL` ("Trainee", categorías sueltas), así
    // que no las puede reclamar nadie todavía: contarlas sería inventar el dueño.
    const filtroAsignacion = veTodasLasBolsas
      ? ''
      : `AND ((c.es_outsourcing = TRUE AND s.nombre = 'Outsourcing contable') OR EXISTS (SELECT 1 FROM presupuesto_asignaciones pa
                       WHERE pa.servicio_id = s.id
                         AND pa.usuario_id = ?
                         AND pa.estado = 'CONFIRMADA'))`

    // `s.horas` son las horas del SERVICIO entero, no de la persona: sirven para
    // el encabezado del presupuesto, no para saber si uno se está pasando. Las
    // horas de cada uno viven en `presupuesto_asignaciones`, y solo las
    // CONFIRMADAS cuentan.
    //
    // El consumo usa exactamente la misma formula que lib/presupuestos/gestion.ts
    // (diferencia de segundos menos las pausas) y los mismos estados, para que la
    // barra diga lo mismo que la ficha del cliente. Se excluyen las actividades en
    // curso (fin IS NULL) porque todavía no se sabe cuánto van a durar.
    const [rows] = await pool.query<
      (RowDataPacket & {
        id: number
        nombre: string
        origen: string
        horas: string | number
        presupuesto_id: number
        proyecto_id: number | null
        proyecto_nombre: string | null
        mis_horas_contratadas: string | number
        mis_horas_consumidas: string | number
      })[]
    >(
      `SELECT s.id, s.nombre, s.origen, s.horas, s.presupuesto_id, s.proyecto_id,
              pr.nombre AS proyecto_nombre,
              COALESCE((SELECT SUM(asig.horas)
                          FROM presupuesto_asignaciones asig
                         WHERE asig.servicio_id = s.id
                           AND asig.usuario_id = ?
                           AND asig.estado = 'CONFIRMADA'), 0) AS mis_horas_contratadas,
              COALESCE((SELECT SUM(GREATEST(0, TIMESTAMPDIFF(SECOND, act.inicio, act.fin)) -
                             COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, act.fin)))
                                         FROM pausas p WHERE p.actividad_id = act.id), 0))
                          FROM actividades act
                         WHERE act.presupuesto_servicio_id = s.id
                           AND act.usuario_id = ?
                           AND act.fin IS NOT NULL
                           AND act.estado IN ('PENDIENTE_APROBACION', 'APROBADA')), 0) / 3600 AS mis_horas_consumidas
       FROM presupuesto_servicios s
       INNER JOIN presupuestos p ON p.id = s.presupuesto_id
       INNER JOIN clientes c ON c.id = p.cliente_id
       INNER JOIN areas ar ON ar.id = c.area_id
       LEFT JOIN proyectos pr ON pr.id = s.proyecto_id
       WHERE ar.empresa_id = ?
         AND c.id = ?
         AND c.activo = TRUE
         AND s.activo = TRUE
         AND s.origen IN ('DETALLADO', 'COMPLEMENTARIO')${areaJefe != null ? ' AND c.area_id = ?' : ''}
         ${filtroAsignacion}
       ORDER BY s.nombre`,
      [
        user.id,
        user.id,
        context.activa.id,
        clienteId,
        ...(areaJefe != null ? [areaJefe] : []),
          ...(!veTodasLasBolsas ? [user.id] : []),
      ]
    )

    // Solo tiene sentido preguntar cuando la lista salio vacia: si hay resultados,
    // el usuario ya ve a quien pertenece cada uno.
    let sinAsignaciones = false
    if (rows.length === 0) {
      const [bolsas] = await pool.query<(RowDataPacket & { total: number })[]>(
        `SELECT COUNT(*) AS total
           FROM presupuesto_servicios s
           INNER JOIN presupuestos p ON p.id = s.presupuesto_id
           INNER JOIN clientes c ON c.id = p.cliente_id
           INNER JOIN areas ar ON ar.id = c.area_id
          WHERE ar.empresa_id = ? AND c.id = ? AND c.activo = TRUE
            AND s.activo = TRUE AND s.origen IN ('DETALLADO', 'COMPLEMENTARIO')`,
        [context.activa.id, clienteId]
      )
      sinAsignaciones = Number(bolsas[0]?.total ?? 0) > 0
    }

    return NextResponse.json({ servicios: rows, sinAsignaciones })
  } catch (error) {
    console.error('Error al obtener servicios:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
