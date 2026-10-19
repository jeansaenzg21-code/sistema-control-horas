// Quién puede tocar un presupuesto.
//
// Reglas (decididas por el negocio):
//
// - El presupuesto cuelga del CLIENTE, no del proyecto (ver cabecera de
//   sql/presupuestos.sql). El vínculo con proyecto es opcional: sirve para
//   organizar y para medir desviaciones, no para dar de alta el alcance.
// - El JEFE DEL ÁREA del cliente puede hacer todo lo que afecte a su cliente:
//   importar, aprobar, activar bolsas y repartir horas. Es quien responde por el
//   alcance contratado, y cargar el Excel ya ES la decisión de aprobarse: por eso
//   el presupuesto entra APROBADO y con sus bolsas activas al importar.
// - El LIDER de un proyecto vinculado también puede, para el presupuesto que
//   cuelgue de él.
// - Un ADMIN puede gestionarlo; si no es el jefe del área ni el líder del
//   proyecto, es una EXCEPCIÓN y queda registrada con responsable, fecha y
//   justificación obligatoria.
//
// Esto es una validación OPERATIVA: que lo registrado en el sistema coincida con
// lo contratado y con las horas correctamente imputadas. NO es la aceptación
// comercial del presupuesto por parte del cliente, que es otro proceso y queda
// fuera del sistema.
//
// La decisión está separada de la base de datos (`decidirGestion`) para poder
// probar la matriz de permisos completa sin tocar MySQL.

import type { RowDataPacket } from 'mysql2'

import pool from '@/lib/db'
import { esAdministrador, type UsuarioConPermisos } from '@/lib/permisos'

export type DecisionPermiso = {
  permitido: boolean
  /** Para mostrar en la interfaz y devolver en la API. */
  motivo: string
  /** Es una excepción del ADMIN: hay que pedir justificación escrita. */
  esExcepcion: boolean
}

export type AccionPresupuesto =
  | 'IMPORTAR'
  | 'VINCULAR'
  /** Confirmar o repartir las horas de una bolsa entre personas. */
  | 'DISTRIBUIR'
  | 'APROBAR'
  | 'ACTIVAR_BOLSAS'
  | 'REPARTIR'

const SIN_PROYECTO_MOTIVO =
  'El presupuesto todavía no está vinculado a un proyecto. Vincúlalo y designa al Líder antes de continuar.'

/**
 * Decide sin tocar la base. `esLiderDelProyecto` ya viene resuelto.
 *
 * El presupuesto pertenece al cliente, así que la figura que manda es el JEFE
 * DEL ÁREA de ese cliente: puede actuar aunque el presupuesto todavía no tenga
 * proyecto asociado. El LIDER del proyecto sigue teniendo permiso sobre el
 * presupuesto que cuelgue de él, y el ADMIN sobre todos.
 *
 * `accion = 'VINCULAR'` es el único caso restringido al ADMIN cuando no hay
 * proyecto: ahí lo que se hace es crear el vínculo y designar al Líder.
 */
export function decidirGestion(params: {
  accion: AccionPresupuesto
  esAdmin: boolean
  esLiderDelProyecto: boolean
  proyectoId: number | null
  /** El usuario es jefe del área a la que pertenece ESTE cliente. */
  esJefeDelAreaDelCliente?: boolean
}): DecisionPermiso {
  const { accion, esAdmin, esLiderDelProyecto, proyectoId, esJefeDelAreaDelCliente = false } = params

  // El jefe del área del cliente manda sobre su presupuesto, con o sin proyecto.
  if (esJefeDelAreaDelCliente) {
    return {
      permitido: true,
      motivo: 'Eres el jefe del área de este cliente.',
      esExcepcion: false,
    }
  }

  if (esAdmin) {
    return {
      permitido: true,
      motivo: esLiderDelProyecto
        ? 'Eres el Líder del proyecto y actúas como administrador.'
        : 'Actúas como administrador.',
      esExcepcion: false,
    }
  }

  if (proyectoId !== null && esLiderDelProyecto) {
    return { permitido: true, motivo: 'Eres el Líder del proyecto.', esExcepcion: false }
  }

  if (proyectoId === null) {
    return {
      permitido: false,
      motivo:
        accion === 'VINCULAR'
          ? 'Solo el administrador o el jefe del área del cliente pueden crear el vínculo con el proyecto.'
          : SIN_PROYECTO_MOTIVO,
      esExcepcion: false,
    }
  }

  return {
    permitido: false,
    motivo:
      'Solo el jefe del área de este cliente o el Líder del proyecto pueden aprobar el presupuesto, activar las bolsas o repartir horas.',
    esExcepcion: false,
  }
}

/** ¿Es este usuario el LIDER de este proyecto? */
export async function esLiderDeProyecto(proyectoId: number, usuarioId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM proyecto_participantes
      WHERE proyecto_id = ? AND usuario_id = ? AND rol_proyecto = 'LIDER'`,
    [proyectoId, usuarioId]
  )
  return rows.length > 0
}

export type ResultadoPermiso = DecisionPermiso & {
  proyectoId: number | null
  usuarioId: number
}

/**
 * Resuelve el permiso contra la base. El proyecto se toma del presupuesto, o se
 * pasa a mano cuando todavía no está vinculado.
 */
export async function resolverPermiso(params: {
  presupuestoId: number
  usuario: UsuarioConPermisos & { id: number }
  accion: AccionPresupuesto
  proyectoIdForzado?: number | null
  /** Área a la que pertenece el cliente, para el jefe de área al importar. */
  areaIdDelCliente?: number | null
}): Promise<ResultadoPermiso> {
  const { presupuestoId, usuario, accion, proyectoIdForzado, areaIdDelCliente = null } = params

  let proyectoId = proyectoIdForzado
  if (proyectoId === undefined) {
    const [rows] = await pool.query<(RowDataPacket & { proyecto_id: number | null })[]>(
      `SELECT s.proyecto_id
         FROM presupuestos p
         LEFT JOIN presupuesto_servicios s
           ON s.presupuesto_id = p.id AND s.proyecto_id IS NOT NULL
        WHERE p.id = ?
        LIMIT 1`,
      [presupuestoId]
    )
    proyectoId = rows[0]?.proyecto_id ?? null
  }

  const esAdmin = esAdministrador(usuario)
  const esLider = proyectoId === null ? false : await esLiderDeProyecto(proyectoId, usuario.id)
  const esJefeDelAreaDelCliente =
    !esAdmin && areaIdDelCliente !== null && usuario.area_id === areaIdDelCliente

  return {
    ...decidirGestion({
      accion,
      esAdmin,
      esLiderDelProyecto: esLider,
      proyectoId,
      esJefeDelAreaDelCliente,
    }),
    proyectoId,
    usuarioId: usuario.id,
  }
}
