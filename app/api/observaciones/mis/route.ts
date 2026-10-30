
import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import type { RowDataPacket } from 'mysql2/promise'
import type { EstadoAtencion, TipoObservacion } from '@/lib/observaciones'

interface AccionObservacion {
  codigo: 'RESPONDER' | 'CORREGIR' | 'REENVIO' | 'ATENDER' | 'VER'
  etiqueta: string
  url: string
}

interface MisObservacionesRow extends RowDataPacket {
  id: number
  modulo: 'APROBACIONES' | 'CUMPLIMIENTO'
  actividad_id: number | null
  periodo_anio: number | null
  periodo_mes: number | null
  tipo: TipoObservacion
  contenido: string
  estado_atencion: EstadoAtencion
  parent_id: number | null
  created_at: Date | string
  autor_id: number | null
  autor_nombre: string | null
  actividad_descripcion: string | null
  actividad_estado: string | null
  actividad_inicio: Date | string | null
  tipo_actividad: string | null
  cliente: string | null
  tiene_respuesta: number
}

interface ConteosRow extends RowDataPacket {
  total: number
  pendientes: number
}

function fechaIso(valor: Date | string | null): string | null {
  if (valor == null) return null
  return valor instanceof Date ? valor.toISOString() : String(valor)
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado.' },
        { status: 401 }
      )
    }

    const context = await getEmpresaContext(user)

    if (!context.activa) {
      return NextResponse.json(
        { error: 'No hay una empresa activa.' },
        { status: 409 }
      )
    }

    const { searchParams } = new URL(request.url)

    const estado = searchParams.get('estado')
    const modulo = searchParams.get('modulo')

    if (
      estado &&
      !['ABIERTA', 'ATENDIDAS', 'TODAS'].includes(estado)
    ) {
      return NextResponse.json(
        { error: 'El filtro de estado no es válido.' },
        { status: 400 }
      )
    }

    if (
      modulo &&
      !['APROBACIONES', 'CUMPLIMIENTO', 'TODOS'].includes(modulo)
    ) {
      return NextResponse.json(
        { error: 'El filtro de módulo no es válido.' },
        { status: 400 }
      )
    }

    // Condiciones comunes para las dos consultas.
    const condicionesBase: string[] = [
      'o.empresa_id = ?',
      'o.usuario_destino_id = ?',
      "o.visibilidad = 'TRABAJADOR'",
      "o.modulo IN ('APROBACIONES', 'CUMPLIMIENTO')",
    ]

    const parametrosBase: (number | string)[] = [
      context.activa.id,
      user.id,
    ]

    // Filtro por módulo.
    if (modulo && modulo !== 'TODOS') {
      condicionesBase.push('o.modulo = ?')
      parametrosBase.push(modulo)
    }

    // Condiciones específicas para el listado.
    const condicionesListado = [...condicionesBase]

    if (estado === 'ABIERTA') {
      condicionesListado.push("o.estado_atencion = 'ABIERTA'")
    }

    if (estado === 'ATENDIDAS') {
      condicionesListado.push("o.estado_atencion <> 'ABIERTA'")
    }

    const whereListado = condicionesListado.join(' AND ')
    const whereConteos = condicionesBase.join(' AND ')

    // Cada consulta mysql2 devuelve una tupla:
    // [filas, metadatos].
    const [
      [rows],
      [conteosRows],
    ] = await Promise.all([
      pool.query<MisObservacionesRow[]>(
        `SELECT
          o.id,
          o.modulo,
          o.actividad_id,
          o.periodo_anio,
          o.periodo_mes,
          o.tipo,
          o.contenido,
          o.estado_atencion,
          o.parent_id,
          o.created_at,
          autor.id AS autor_id,
          autor.nombre AS autor_nombre,
          a.descripcion AS actividad_descripcion,
          a.estado AS actividad_estado,
          a.inicio AS actividad_inicio,
          ta.nombre AS tipo_actividad,
          c.nombre AS cliente,
          CASE
            WHEN o.estado_atencion = 'ABIERTA'
              AND o.tipo = 'OBSERVACION'
            THEN EXISTS(
              SELECT 1
              FROM observaciones respuesta
              WHERE respuesta.parent_id = o.id
                AND respuesta.empresa_id = o.empresa_id
                AND respuesta.tipo = 'RESPUESTA'
                AND respuesta.visibilidad = 'TRABAJADOR'
            )
            ELSE 0
          END AS tiene_respuesta
        FROM observaciones o
        LEFT JOIN usuarios autor
          ON autor.id = o.autor_id
        LEFT JOIN actividades a
          ON a.id = o.actividad_id
        LEFT JOIN tipos_actividad ta
          ON ta.id = a.tipo_actividad_id
        LEFT JOIN clientes c
          ON c.id = a.cliente_id
        WHERE ${whereListado}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 200`,
        parametrosBase
      ),

      pool.query<ConteosRow[]>(
        `SELECT
          COUNT(*) AS total,
          COALESCE(
            SUM(o.estado_atencion = 'ABIERTA'),
            0
          ) AS pendientes
        FROM observaciones o
        WHERE ${whereConteos}`,
        parametrosBase
      ),
    ])

    // Convertir los resultados SQL en observaciones.
    const observaciones = rows.map((fila) => {
      const actividadId =
        fila.actividad_id == null
          ? null
          : Number(fila.actividad_id)

      const urlBase = actividadId
        ? `/actividades?actividad=${actividadId}&observacion=${fila.id}`
        : `/actividades?pestana=observaciones&observacion=${fila.id}`

      const urlAccion = (accion: string) =>
        `${urlBase}&accion=${accion}`

      const acciones: AccionObservacion[] = []

      // Acciones del módulo de aprobaciones.
      if (
        fila.modulo === 'APROBACIONES' &&
        fila.tipo === 'OBSERVACION' &&
        fila.estado_atencion === 'ABIERTA' &&
        Number(fila.tiene_respuesta) === 0
      ) {
        acciones.push({
          codigo: 'RESPONDER',
          etiqueta: 'Responder',
          url: urlAccion('responder'),
        })
      }

      if (
        fila.modulo === 'APROBACIONES' &&
        fila.tipo === 'SOLICITUD_CORRECCION' &&
        fila.actividad_estado === 'CORRECCION_SOLICITADA'
      ) {
        acciones.push(
          {
            codigo: 'CORREGIR',
            etiqueta: 'Corregir actividad',
            url: urlAccion('corregir'),
          },
          {
            codigo: 'REENVIO',
            etiqueta: 'Reenviar a aprobación',
            url: urlAccion('reenviar'),
          }
        )
      }

      // Acciones del módulo de cumplimiento.
      if (
        fila.modulo === 'CUMPLIMIENTO' &&
        fila.tipo === 'OBSERVACION' &&
        fila.estado_atencion === 'ABIERTA'
      ) {
        if (Number(fila.tiene_respuesta) === 0) {
          acciones.push({
            codigo: 'RESPONDER',
            etiqueta: 'Responder',
            url: urlAccion('responder'),
          })
        }

        acciones.push({
          codigo: 'ATENDER',
          etiqueta: 'Marcar atendida',
          url: urlAccion('atender'),
        })
      }

      // Acción disponible para todas las observaciones.
      acciones.push({
        codigo: 'VER',
        etiqueta: 'Ver detalle',
        url: urlBase,
      })

      return {
        id: Number(fila.id),
        modulo: fila.modulo,
        tipo: fila.tipo,
        contenido: String(fila.contenido),
        estado_atencion: fila.estado_atencion,

        parent_id:
          fila.parent_id == null
            ? null
            : Number(fila.parent_id),

        periodo: {
          anio:
            fila.periodo_anio == null
              ? null
              : Number(fila.periodo_anio),

          mes:
            fila.periodo_mes == null
              ? null
              : Number(fila.periodo_mes),
        },

        actividad: actividadId
          ? {
              id: actividadId,

              descripcion:
                fila.actividad_descripcion == null
                  ? null
                  : String(fila.actividad_descripcion),

              estado: String(fila.actividad_estado ?? ''),

              inicio: fechaIso(fila.actividad_inicio),

              tipo_actividad:
                fila.tipo_actividad == null
                  ? null
                  : String(fila.tipo_actividad),

              cliente:
                fila.cliente == null
                  ? null
                  : String(fila.cliente),
            }
          : null,

        autor:
          fila.autor_id == null
            ? null
            : {
                id: Number(fila.autor_id),
                nombre: String(fila.autor_nombre ?? ''),
              },

        created_at: fechaIso(fila.created_at) ?? '',

        acciones,
      }
    })

    // La consulta de conteos devuelve una fila.
    const conteos = conteosRows[0]

    return NextResponse.json({
      observaciones,
      conteos: {
        total: Number(conteos?.total ?? 0),
        pendientes: Number(conteos?.pendientes ?? 0),
      },
    })
  } catch (error) {
    console.error(
      'Error al obtener mis observaciones:',
      error
    )

    return NextResponse.json(
      { error: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}
