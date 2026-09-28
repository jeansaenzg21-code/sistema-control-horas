// Quién puede tocar un presupuesto.
//
// Reglas (decididas por el negocio):
//
// - Aprobar la importación, activar las bolsas y repartir horas corresponde al
//   LIDER de ese proyecto en `proyecto_participantes`.
// - Ser Jefe de Área NO da permiso por sí solo. Un jefe de área que no participa
//   en el proyecto no aprueba sus presupuestos. Si además es LIDER, sí.
// - Un ADMIN puede gestionarlo, pero si no es el LIDER es una EXCEPCIÓN y queda
//   registrada con responsable, fecha y justificación obligatoria.
// - Sin proyecto vinculado solo el ADMIN puede actuar, y esa es la vía normal
//   para crear el vínculo y designar al Líder antes de activar nada.
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
  | 'APROBAR'
  | 'ACTIVAR_BOLSAS'
  | 'REPARTIR'

const SIN_PROYECTO_MOTIVO =
  'El presupuesto todavía no está vinculado a un proyecto. Vincúlalo y designa al Líder antes de continuar.'

/**
 * Decide sin tocar la base. `esLiderDelProyecto` ya viene resuelto.
 *
 * IMPORTAR es distinto del resto a propósito: cargar el presupuesto del cliente
 * es parte del trabajo del JEFE DE ÁREA, y lo hace incluso antes de que exista un
 * proyecto. La regla del Líder aplica a APROBAR, ACTIVAR_BOLSAS y REPARTIR, que
 * son las que mueven horas contratadas.
 *
 * `accion = 'VINCULAR'` es el único caso válido sin proyecto: ahí lo que hace el
 * ADMIN es crear el vínculo y designar al Líder, que es el paso normal y no una
 * excepción.
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

  // Cargar el presupuesto: el jefe del área del cliente puede, y el admin.
  if (accion === 'IMPORTAR') {
    if (esJefeDelAreaDelCliente) {
      return {
        permitido: true,
        motivo: 'Eres el jefe del área de este cliente.',
        esExcepcion: false,
      }
    }
    if (esAdmin) {
      return { permitido: true, motivo: 'Actúas como administrador.', esExcepcion: false }
    }
    return {
      permitido: false,
      motivo: 'Solo el jefe del área del cliente o el administrador pueden importar su presupuesto.',
      esExcepcion: false,
    }
  }

  if (proyectoId === null) {
    if (accion !== 'VINCULAR') {
      return { permitido: false, motivo: SIN_PROYECTO_MOTIVO, esExcepcion: false }
    }
    if (!esAdmin) {
      return {
        permitido: false,
        motivo:
          'Solo el administrador puede crear el vínculo del presupuesto y designar al Líder del proyecto.',
        esExcepcion: false,
      }
    }
    return {
      permitido: true,
      motivo: 'Creando el vínculo y designando al Líder.',
      esExcepcion: false,
    }
  }

  if (esLiderDelProyecto) {
    return { permitido: true, motivo: 'Eres el Líder del proyecto.', esExcepcion: false }
  }

  if (esAdmin) {
    return {
      permitido: true,
      motivo:
        'Actúas como administrador y no eres el Líder del proyecto. Quedará registrado como excepción.',
      esExcepcion: true,
    }
  }

  return {
    permitido: false,
    motivo:
      'Solo el Líder del proyecto puede aprobar el presupuesto, activar las bolsas o repartir horas.',
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
