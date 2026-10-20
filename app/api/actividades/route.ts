import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { RowDataPacket } from 'mysql2'
import { notifyActivityChange } from '@/lib/events'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { horarioDeHoy, enRangoHorario, minutosAcumuladosHoy, aMinutos } from '@/lib/horarios'
import { esAdministrador, esJefeDeArea, esPersonal, esSocio, esSupervisor } from '@/lib/permisos'
import { leerJson } from '@/lib/validacion/leer-json'
import { esquemaActividad } from '@/lib/validacion/actividades'
import { crearActividad } from '@/lib/services/actividades'
import { estructuraProyectosDisponible } from '@/lib/proyectos'
import {
  buscarPorIdOperacion,
  columnaIdOperacionDisponible,
  normalizarIdOperacion,
  validarMarcaTiempoCliente,
} from '@/lib/operaciones-moviles'
import { columnaExiste } from '@/lib/esquema'

/**
 * Devuelve el dia siguiente a una fecha 'YYYY-MM-DD'.
 *
 * Sirve para convertir el filtro inclusivo `hasta` en un rango semiabierto
 * (`inicio < diaSiguiente 00:00:00`), que es lo que permite aprovechar el indice
 * de `inicio`. Devuelve null si el formato no es el esperado, para no inventar
 * una fecha: el endpoint responde 400 en ese caso, en lugar de aplicar un rango
 * silenciosamente incorrecto.
 */
function siguienteDia(fecha: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const d = new Date(`${fecha}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Comprobacion cacheada del esquema: son 2 consultas a information_schema por
// peticion sin cache, y con 200 usuarios son 400 consultas por minuto que no
// aportan nada. Ver lib/esquema.ts.
async function tieneColumnaProyecto(): Promise<boolean> {
  return columnaExiste('actividades', 'proyecto_id')
}

// La imputacion de una actividad a una bolsa de horas (`presupuesto_servicio_id`)
// se added en la migracion de presupuestos como columna nullable. Se comprueba
// igual que la del proyecto: si la base no la tiene todavia, la ruta sigue
// funcionando sin imputacion en lugar de romperse.
async function tieneColumnaServicio(): Promise<boolean> {
  return columnaExiste('actividades', 'presupuesto_servicio_id')
}

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
    const usuarioParam = searchParams.get('usuario_id')
    const estado = searchParams.get('estado')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const proyectoParam = searchParams.get('proyecto')
    const tieneProyecto = await tieneColumnaProyecto() && await estructuraProyectosDisponible()
    let proyectoId: number | null = null
    if (proyectoParam != null && proyectoParam !== '') {
      proyectoId = Number(proyectoParam)
      if (!Number.isInteger(proyectoId) || proyectoId <= 0) {
        return NextResponse.json({ error: 'El proyecto indicado no es válido.' }, { status: 400 })
      }
      if (!tieneProyecto) {
        return NextResponse.json({ error: 'La association de actividades con proyectos aún no está disponible.' }, { status: 503 })
      }
    }

    let usuarioId: number | null = null
    if (usuarioParam != null && usuarioParam !== '') {
      usuarioId = Number(usuarioParam)
      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return NextResponse.json({ error: 'El usuario indicado no es válido.' }, { status: 400 })
      }
    }
    if (esPersonal(user)) {
      if (usuarioId != null && usuarioId !== user.id) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
      }
      usuarioId = user.id
    } else if (esSupervisor(user)) {
      if (usuarioId != null && usuarioId !== user.id) {
        const [destinos] = await pool.query<RowDataPacket[]>(
          `SELECT u.id
           FROM usuarios u
           INNER JOIN areas ar ON ar.id = u.area_id
           WHERE u.id = ? AND u.supervisor_id = ? AND ar.empresa_id = ?
           LIMIT 1`,
          [usuarioId, user.id, context.activa.id],
        )
        if (destinos.length === 0) {
          return NextResponse.json({ error: 'El colaborador no está asignado a este supervisor.' }, { status: 403 })
        }
      }
    } else if (esJefeDeArea(user)) {
      if (usuarioId != null && usuarioId !== user.id) {
        const [destinos] = await pool.query<RowDataPacket[]>(
          `SELECT u.id
           FROM usuarios u
           INNER JOIN areas ar ON ar.id = u.area_id
           WHERE u.id = ? AND u.area_id = ? AND ar.empresa_id = ?
           LIMIT 1`,
          [usuarioId, user.area_id, context.activa.id],
        )
        if (destinos.length === 0) {
          return NextResponse.json({ error: 'El colaborador no pertenece a tu área.' }, { status: 403 })
        }
      }
    } else if (esAdministrador(user) || esSocio(user)) {
      // Lectura completa de la empresa, sin narrowing por usuario ni por área.
      // El SOCIO entra por aquí: puede revisar todos los registros pero no
      // tocar ninguno, y la escritura ya está cerrada en lib/auth.ts.
    } else {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    // Las pausas se preagregan en una sola lectura y se unen por actividad.
    // Antes era una subconsulta correlacionada: dependia de `actividades` y se
    // ejecutaba una vez por cada fila devuelta, obligando a MySQL a resolver un
    // subarbol por registro. Con el LEFT JOIN se calcula una sola vez.
    const proyectoCampos = tieneProyecto ? 'a.proyecto_id, pr.nombre AS proyecto_nombre,' : ''
    const proyectoJoin = tieneProyecto ? 'LEFT JOIN proyectos pr ON pr.id = a.proyecto_id AND pr.empresa_id = ar.empresa_id' : ''
    const tieneServicio = await tieneColumnaServicio()
    const servicioCampos = tieneServicio ? 'a.presupuesto_servicio_id, ps.nombre AS presupuesto_servicio_nombre,' : ''
    const servicioJoin = tieneServicio ? 'LEFT JOIN presupuesto_servicios ps ON ps.id = a.presupuesto_servicio_id' : ''
    let query = `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
      ${proyectoCampos} ${servicioCampos} a.inicio, a.fin, a.estado, a.revisado_por, a.revisado_en, a.observacion_revision, a.created_at,
      u.nombre AS usuario_nombre, u.cargo, u.especialidad, u.area_id,
      ta.nombre AS tipo_actividad_nombre,
      ar.nombre AS area_nombre,
      c.nombre AS cliente_nombre,
      COALESCE(pa.segundos, 0) AS pausa_acumulada_segundos,
      CASE
        WHEN a.fin IS NOT NULL THEN TIMESTAMPDIFF(SECOND, a.inicio, a.fin)
        ELSE TIMESTAMPDIFF(SECOND, a.inicio, NOW())
      END AS duracion_segundos
      FROM actividades a
      INNER JOIN usuarios u ON u.id = a.usuario_id
      INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
      INNER JOIN areas ar ON ar.id = u.area_id
      ${proyectoJoin}
      ${servicioJoin}
      LEFT JOIN clientes c ON c.id = a.cliente_id
      LEFT JOIN (
        SELECT p.actividad_id,
               SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW()))) AS segundos
        FROM pausas p
        GROUP BY p.actividad_id
      ) pa ON pa.actividad_id = a.id
      WHERE ar.empresa_id = ?`
    const params: (string | number)[] = [context.activa.id]

    // Filtro por division. Es lo que necesita /reportes para no traer la tabla
    // entera y recortarla en el navegador. Solo lo aplica quien puede ver varias
    // areas (admin, socio y supervisor): para un jefe o un trabajador el recorte
    // por area ya lo hace su propio caso de abajo, y obligar a mandar el
    // parametro permitiria saltarselo pidiendo `area_id` de otra division.
    const areaParam = searchParams.get('area_id')
    let areaPedida: number | null = null
    if (areaParam != null && areaParam !== '') {
      const n = Number(areaParam)
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json({ error: 'La división indicada no es válida.' }, { status: 400 })
      }
      areaPedida = n
    }

    if (usuarioId != null) {
      query += ' AND a.usuario_id = ?'
      params.push(usuarioId)
    } else if (esSupervisor(user)) {
      query += ' AND u.supervisor_id = ?'
      params.push(user.id)
    } else if (esJefeDeArea(user)) {
      query += ' AND u.area_id = ?'
      params.push(user.area_id!)
    }
    if (areaPedida != null && usuarioId == null && !esJefeDeArea(user)) {
      const [areaValida] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM areas WHERE id = ? AND empresa_id = ?',
        [areaPedida, context.activa.id]
      )
      if (areaValida.length === 0) {
        return NextResponse.json({ error: 'La división no pertenece a la empresa activa.' }, { status: 400 })
      }
      query += ' AND u.area_id = ?'
      params.push(areaPedida)
    }
    if (estado) {
      query += ' AND a.estado = ?'
      params.push(estado)
    }
    if (desde) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
        return NextResponse.json({ error: 'La fecha inicial no es válida.' }, { status: 400 })
      }
      query += ' AND a.inicio >= ?'
      params.push(`${desde} 00:00:00`)
    }
    if (hasta) {
      // Rango semiabierto en vez de DATE(a.inicio) <= ?. Envolver la columna
      // indexada en DATE() impide que MySQL use el indice: medido sobre 50 000
      // actividades, la version con DATE() leia 50 254 filas y ordenaba todo
      // (Sort_scan=1); con el rango lee 127 y no ordena nada (Sort_scan=0).
      // El dia final sigue entrando completo porque se compara contra el dia
      // siguiente a las 00:00:00.
      const diaSiguiente = siguienteDia(hasta)
      if (diaSiguiente === null) {
        return NextResponse.json({ error: 'La fecha final no es válida.' }, { status: 400 })
      }
      query += ' AND a.inicio < ?'
      params.push(`${diaSiguiente} 00:00:00`)
    }
    if (proyectoId != null) {
      query += ' AND a.proyecto_id = ?'
      params.push(proyectoId)
    }

    query += ' ORDER BY a.inicio DESC, a.id DESC'

    // PAGINACION.
    //
    // Antes esta ruta no tenia limite: el administrador recibia la tabla
    // COMPLETA de la empresa. Medido sobre 50 000 actividades, eso son 50 139
    // filas y 28 MB en una sola respuesta, con p95 de 2,6 s. Con unos pocos
    // administradores abriendo el panel a la vez, el proceso de Node se queda
    // sin memoria en un VPS de 1 GB antes de que MySQL suffer nada.
    //
    // La forma de la respuesta NO cambia: sigue siendo un array de filas, para
    // que ningun consumidor existente se rompa. El total y el offset viajan en
    // cabeceras (`X-Total`, `X-Offset`, `X-Limite`) para que la interfaz pueda
    // saber si hay mas sin pedir una segunda vez todo.
    //
    // `limite=0` con `todo=1` se reserva para exportaciones explicitas y esta
    // acotado: no es una puerta abierta para volver a la situation anterior.
    const LIMITE_POR_DEFECTO = 200
    const LIMITE_MAXIMO = 1000
    const LIMITE_EXPORTACION = 5000

    const limiteBruto = searchParams.get('limite')
    const offsetBruto = searchParams.get('offset')
    const quiereTodo = searchParams.get('todo') === '1'

    let limite = LIMITE_POR_DEFECTO
    if (limiteBruto != null && limiteBruto !== '') {
      const n = Number(limiteBruto)
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json({ error: 'El límite no es válido.' }, { status: 400 })
      }
      limite = n === 0 ? (quiereTodo ? LIMITE_EXPORTACION : LIMITE_POR_DEFECTO) : Math.min(n, LIMITE_MAXIMO)
    } else if (quiereTodo) {
      limite = LIMITE_EXPORTACION
    }

    let offset = 0
    if (offsetBruto != null && offsetBruto !== '') {
      const n = Number(offsetBruto)
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json({ error: 'El desplazamiento no es válido.' }, { status: 400 })
      }
      offset = n
    }

    // El total se cuenta con la misma consulta pero sin paginar, para no
    // inventar un numero: solo se pide si hay mas paginas que leer.
    let total: number | null = null
    if (offset > 0) {
      try {
        const [cuenta] = await pool.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS total FROM (${query}) AS cuenta`,
          params
        )
        total = Number(cuenta[0]?.total ?? 0)
      } catch {
        // Si el conteo falla no se rompe la pagina que el usuario esta viendo.
        total = null
      }
    }

    const paginada = `${query} LIMIT ${limite} OFFSET ${offset}`
    const [rows] = await pool.query(paginada, params)

    const cabeceras = new Headers()
    cabeceras.set('X-Limite', String(limite))
    cabeceras.set('X-Offset', String(offset))
    if (total !== null) cabeceras.set('X-Total', String(total))

    return new NextResponse(JSON.stringify(rows), {
      status: 200,
      headers: { ...Object.fromEntries(cabeceras), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error al obtener actividades:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const lectura = await leerJson(request, esquemaActividad)
    if (!lectura.ok) return lectura.response
    const body = lectura.data as Record<string, unknown>

    const respuesta = await crearActividad(user, context, body)
    return respuesta
  } catch (error) {
    console.error('Error al crear actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
