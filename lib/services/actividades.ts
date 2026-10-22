import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { RowDataPacket } from 'mysql2'
import type { EmpresaContext, SessionUser } from '@/lib/auth'
import { esAdministrador, esJefeDeArea } from '@/lib/permisos'
import { estructuraProyectosDisponible } from '@/lib/proyectos'
import {
  buscarPorIdOperacion,
  columnaIdOperacionDisponible,
  normalizarIdOperacion,
  validarMarcaTiempoCliente,
} from '@/lib/operaciones-moviles'
import { columnaExiste } from '@/lib/esquema'
import { notifyActivityChange } from '@/lib/events'
import { notificarRevisoresActividad } from '@/lib/notificaciones'
import { notificarBolsaHorasPorId } from '@/lib/bolsa-alertas'

async function tieneColumnaProyecto(): Promise<boolean> {
  return (await columnaExiste('actividades', 'proyecto_id')) && (await estructuraProyectosDisponible())
}

async function tieneColumnaServicio(): Promise<boolean> {
  return await columnaExiste('actividades', 'presupuesto_servicio_id')
}

export async function crearActividad(
  user: SessionUser,
  context: EmpresaContext,
  body: Record<string, unknown>
): Promise<NextResponse> {
  try {
    const { usuario_id, tipo_actividad_id, cliente_id, descripcion, facturable, proyecto_id, presupuesto_servicio_id, inicio, fin, id_operacion } = body
    const usuarioObjetivoId = Number(usuario_id)
    const tipoActividadId = Number(tipo_actividad_id)
    const clienteId = cliente_id == null || cliente_id === '' ? null : Number(cliente_id)
    const descripcionTexto = descripcion == null ? null : typeof descripcion === 'string' ? descripcion.trim() || null : undefined
    const tieneProyecto = await tieneColumnaProyecto() && await estructuraProyectosDisponible()
    const proyectoId = proyecto_id == null || proyecto_id === '' ? null : Number(proyecto_id)
    const tieneServicio = await tieneColumnaServicio()
    const servicioId = presupuesto_servicio_id == null || presupuesto_servicio_id === '' ? null : Number(presupuesto_servicio_id)
    const idOperacion = normalizarIdOperacion(id_operacion)
    const marcaInicio = validarMarcaTiempoCliente(inicio, 'hora de inicio')
    const marcaFin = validarMarcaTiempoCliente(fin, 'hora de finalización')

    if (marcaInicio !== null && !marcaInicio.ok) {
      return NextResponse.json({ error: marcaInicio.error }, { status: 400 })
    }
    if (marcaFin !== null && !marcaFin.ok) {
      return NextResponse.json({ error: marcaFin.error }, { status: 400 })
    }

    // Un registro con hora de fin es un bloque ya trabajado (se anota al
    // terminar la jornada). Nace cerrado y pasa directo a aprobación; no se
    // convierte en la actividad en curso de nadie. Sin `fin` se mantiene el
    // comportamiento clásico del cronómetro.
    const inicioCliente = marcaInicio !== null && marcaInicio.ok ? marcaInicio.fecha : null
    const finCliente = marcaFin !== null && marcaFin.ok ? marcaFin.fecha : null
    const esBloqueCerrado = finCliente !== null

    if (esBloqueCerrado && !inicioCliente) {
      return NextResponse.json(
        { error: 'Indica la hora de inicio del bloque de trabajo.' },
        { status: 400 }
      )
    }
    if (inicioCliente && finCliente && finCliente.getTime() <= inicioCliente.getTime()) {
      return NextResponse.json(
        { error: 'La hora de fin no puede ser anterior a la hora de inicio.' },
        { status: 400 }
      )
    }

    if (descripcionTexto === undefined) {
      return NextResponse.json({ error: 'La descripción no es válida.' }, { status: 400 })
    }
    if (clienteId != null && (!Number.isInteger(clienteId) || clienteId <= 0)) {
      return NextResponse.json({ error: 'El cliente seleccionado no es válido.' }, { status: 400 })
    }
    if (facturable != null && typeof facturable !== 'boolean' && facturable !== 0 && facturable !== 1) {
      return NextResponse.json({ error: 'El valor facturable no es válido.' }, { status: 400 })
    }

    if (proyectoId != null && (!Number.isInteger(proyectoId) || proyectoId <= 0)) {
      return NextResponse.json({ error: 'El proyecto seleccionado no es válido.' }, { status: 400 })
    }
    if (proyectoId != null && !tieneProyecto) {
      return NextResponse.json({ error: 'La asociación de actividades con proyectos aún no está disponible.' }, { status: 503 })
    }

    if (servicioId != null && (!Number.isInteger(servicioId) || servicioId <= 0)) {
      return NextResponse.json({ error: 'El servicio seleccionado no es válido.' }, { status: 400 })
    }
    if (servicioId != null && !tieneServicio) {
      return NextResponse.json({ error: 'La imputación de actividades a servicios aún no está disponible.' }, { status: 503 })
    }
    // El servicio cuelga del cliente a dos saltos (cliente -> presupuesto ->
    // servicio), asi que sin cliente no se puede comprobar de que bolsa se
    // trata. No se deduce el cliente en silencio: se pide explicitamente.
    if (servicioId != null && clienteId == null) {
      return NextResponse.json({ error: 'Elige el cliente del servicio para imputar las horas.' }, { status: 400 })
    }

    if (!Number.isInteger(usuarioObjetivoId) || usuarioObjetivoId <= 0 || !Number.isInteger(tipoActividadId) || tipoActividadId <= 0) {
      return NextResponse.json({ error: 'Faltan campos obligatorios.' }, { status: 400 })
    }
    if (!esAdministrador(user) && usuarioObjetivoId !== user.id) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }

    // La comprobacion de idempotencia NO se hace aqui. Esta fuera de la
    // transaccion, asi que dos peticiones identicas podrian pasar las dos y
    // crear dos filas. Se resuelve dentro de la transaccion, con el usuario
    // bloqueado y antes de mirar la actividad activa.

    const [usuariosValidos] = await pool.query<RowDataPacket[]>(
      `SELECT u.id FROM usuarios u INNER JOIN areas ar ON ar.id = u.area_id
       WHERE u.id = ? AND ar.empresa_id = ? AND u.activo = TRUE`,
      [usuarioObjetivoId, context.activa!.id]
    )
    if (usuariosValidos.length === 0) {
      return NextResponse.json({ error: 'El usuario no pertenece a la empresa activa.' }, { status: 400 })
    }

    if (proyectoId != null) {
      const [proyectoValido] = await pool.query<RowDataPacket[]>(
        `SELECT p.id
         FROM proyectos p
         WHERE p.id = ? AND p.empresa_id = ? AND p.activo = TRUE
           AND p.estado IN ('PLANIFICACION', 'EN_CURSO', 'PAUSADO')
           AND (
             p.jefe_id = ?
             OR EXISTS (
               SELECT 1 FROM proyecto_participantes pp
               WHERE pp.proyecto_id = p.id AND pp.usuario_id = ?
             )
           )
         LIMIT 1`,
        [proyectoId, context.activa!.id, usuarioObjetivoId, usuarioObjetivoId]
      )
      if (proyectoValido.length === 0) {
        return NextResponse.json({ error: 'El usuario no participa en el proyecto seleccionado.' }, { status: 403 })
      }
    }

    if (servicioId != null) {
      // Se comprueba la pertenencia real, no solo que el id exista: el servicio
      // tiene que ser del cliente indicado, de la empresa activa y ser una bolsa
      // viva. Sin esto, un id valido de otro cliente pasaria el alta y las horas
      // se imputarian donde no toca.
      const [servicioValido] = await pool.query<RowDataPacket[]>(
        `SELECT s.id
         FROM presupuesto_servicios s
         INNER JOIN presupuestos p ON p.id = s.presupuesto_id
         INNER JOIN clientes c ON c.id = p.cliente_id
         INNER JOIN areas ar ON ar.id = c.area_id
         WHERE s.id = ?
           AND p.cliente_id = ?
           AND ar.empresa_id = ?
           AND c.activo = TRUE
           AND s.activo = TRUE
           AND s.origen IN ('DETALLADO', 'COMPLEMENTARIO')
         LIMIT 1`,
        [servicioId, clienteId, context.activa!.id]
      )
      if (servicioValido.length === 0) {
        return NextResponse.json({ error: 'El servicio seleccionado no es una bolsa activa de ese cliente.' }, { status: 400 })
      }
    }

// Misma regla que el desplegable de app/api/tipos-actividad: el usuario ve su
// catálogo propio y, solo si no tiene ninguno, las cinco generales. Se ancla al
// área del usuario OBJETIVO, no a la de quien hace la petición, porque el
// administrador puede registrarle horas a alguien y son las suyas las que
// cuentan.
const [tipoValido] = await pool.query<RowDataPacket[]>(
  `SELECT ta.id
     FROM usuarios u
     JOIN areas areaUsuario ON areaUsuario.id = u.area_id
     JOIN tipos_actividad ta ON ta.id = ?
    WHERE u.id = ?
      AND areaUsuario.empresa_id = ?
      AND ta.activo = TRUE
      AND ( ta.area_id = u.area_id
            OR ( ta.es_general = TRUE AND NOT EXISTS (
                  SELECT 1 FROM tipos_actividad propio
                   WHERE propio.area_id = u.area_id
                     AND propio.activo = TRUE AND propio.es_general = FALSE)) )`,
  [tipoActividadId, usuarioObjetivoId, context.activa!.id]
)
if (tipoValido.length === 0) {
  return NextResponse.json({ error: 'El tipo de actividad no está disponible para esa división.' }, { status: 400 })
}

    if (clienteId != null) {
      if (esJefeDeArea(user) && proyectoId != null) {
        const [cliente] = await pool.query<RowDataPacket[]>(
          `SELECT c.id
           FROM clientes c
           INNER JOIN areas ar ON ar.id = c.area_id
           WHERE c.id = ? AND c.activo = TRUE AND ar.empresa_id = ?
             AND (
               c.area_id = ?
               OR EXISTS (
                 SELECT 1 FROM proyectos p
                 WHERE p.id = ? AND p.empresa_id = ? AND p.activo = TRUE AND p.cliente_id = c.id
               )
             )
           LIMIT 1`,
          [clienteId, context.activa!.id, user.area_id, proyectoId, context.activa!.id]
        )
        if (cliente.length === 0) {
          return NextResponse.json({ error: 'El cliente seleccionado no pertenece al proyecto o a tu área.' }, { status: 400 })
        }
      } else {
        const [cliente] = await pool.query<RowDataPacket[]>(
          `SELECT c.id FROM clientes c INNER JOIN areas ar ON ar.id = c.area_id
           WHERE c.id = ? AND c.activo = TRUE AND ar.empresa_id = ?${esJefeDeArea(user) ? ' AND c.area_id = ?' : ''}`,
          esJefeDeArea(user) ? [clienteId, context.activa!.id, user.area_id] : [clienteId, context.activa!.id]
        )
        if (cliente.length === 0) {
          return NextResponse.json({ error: 'El cliente seleccionado no pertenece a la empresa activa.' }, { status: 400 })
        }
      }
    }

    // La comprobación de "no tener una actividad activa" NO se puede hacer aquí:
    // sería un check-then-act y dos peticiones simultáneas (web y móvil, o doble
    // toque) pasarían las dos el control y guardarían dos actividades. Se hace
    // dentro de una transacción con bloqueo de la fila del usuario; ver más abajo.

    const registraOperacion = (await columnaIdOperacionDisponible()) && idOperacion !== null
    const columnas = ['usuario_id', 'cliente_id', 'tipo_actividad_id', 'descripcion', 'facturable']
    const valores: Array<string | number | Date | null> = [
      usuarioObjetivoId,
      clienteId,
      tipoActividadId,
      descripcionTexto,
      (facturable ?? null) as string | number | null,
    ]
    if (tieneProyecto) {
      columnas.push('proyecto_id')
      valores.push(proyectoId)
    }
    if (tieneServicio) {
      columnas.push('presupuesto_servicio_id')
      valores.push(servicioId)
    }
    if (registraOperacion) {
      columnas.push('id_operacion')
      valores.push(idOperacion)
    }
    // `inicio` se escribe SIEMPRE. La columna es NOT NULL y no tiene valor por
    // defecto, así que antes, si un cliente no mandaba su marca de tiempo, el
    // INSERT omitía la columna y MySQL respondia 1364
    // (ER_NO_DEFAULT_FOR_FIELD): un 500 en toda alta de actividad. Ahora, si el
    // cliente no la manda, la pone NOW() del SERVIDOR, que es la referencia que
    // el propio sistema declara como autoritativa. Se usa el reloj de MySQL y no
    // el del proceso de Node para que no dependa de la hora de la maquina que
    // sirve la API.
    columnas.push('inicio')
    valores.push(inicioCliente)
    if (esBloqueCerrado) {
      columnas.push('fin')
      valores.push(finCliente)
    }

    // El proyecto/join solo hace falta para dar forma a la respuesta.
    const proyectoCampos = tieneProyecto ? 'a.proyecto_id, pr.nombre AS proyecto_nombre,' : ''
    const proyectoJoin = tieneProyecto ? 'LEFT JOIN proyectos pr ON pr.id = a.proyecto_id AND pr.empresa_id = ar.empresa_id' : ''
    const servicioCampos = tieneServicio ? 'a.presupuesto_servicio_id, ps.nombre AS presupuesto_servicio_nombre,' : ''
    const servicioJoin = tieneServicio ? 'LEFT JOIN presupuesto_servicios ps ON ps.id = a.presupuesto_servicio_id' : ''

    // Se serializa todo el alta por usuario. El bloqueo va sobre `usuarios`
    // porque esa fila SIEMPRE existe: un `SELECT ... FOR UPDATE` sobre
    // `actividades` no bloquearía nada cuando todavía no hay ninguna fila
    // activa, que es exactamente el caso en el que se produce la carrera.
    const conexion = await pool.getConnection()
    let actividadCreada: Record<string, unknown> | null = null
    try {
      await conexion.beginTransaction()

      await conexion.query('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [usuarioObjetivoId])

      // ORDEN IMPORTANTE.
      //
      // Primero se resuelve la idempotencia y despues se aplica la regla de "una
      // sola actividad activa". Al reves, un reintento del movil (la respuesta
      // anterior se perdio y el trabajador pulsa otra vez) llegaba al alta con su
      // misma id_operacion, se encontraba con que ya habia una actividad activa
      // y recibia un 409. El movil no podia distinguir "mi operacion ya se
      // guardo" de "tengo otra actividad distinta en curso", y se quedaba
      // esperando sin poder asociar su servidor_id.
      //
      // La busqueda va acotada al usuario que hace la peticion: aunque dos
      // personas compartieran id_operacion, nadie recibe la actividad de otro.
      if (idOperacion) {
        const previa = await buscarPorIdOperacion(idOperacion, context.activa!.id, usuarioObjetivoId, conexion)
        if (previa) {
          await conexion.rollback()
          // Respuesta recuperable: el movil asocia el servidor_id y da la
          // sincronizacion por completada, sin crear una segunda fila.
          return NextResponse.json({ ok: true, actividad: previa, duplicada: true })
        }
      }

      // Un bloque ya cerrado (con `fin`) no compite por el cupo de "actividad
      // activa": se puede anotar la jornada de hoy aunque el cronómetro esté
      // andando, y se pueden anotar varios bloques del mismo día.
      if (!esBloqueCerrado) {
        // Dentro de la transacción y con el usuario bloqueado, este SELECT ve la
        // commits de cualquier alta concurrente de ese mismo usuario.
        const [activas] = await conexion.query<RowDataPacket[]>(
          `SELECT id FROM actividades
           WHERE usuario_id = ? AND estado IN ('EN_CURSO', 'PAUSADA')
           LIMIT 1`,
          [usuarioObjetivoId]
        )
        if (activas.length > 0) {
          await conexion.rollback()
          // No se devuelve el id de la actividad existente. Deliberadamente: si se
          // devolviera, un movil que reintenta por error podria quedarse con la
          // actividad de OTRA operacion y dar por sincronizadas horas que no son
          // las suyas. El movil debe conservar su registro local y resolverlo.
          return NextResponse.json(
            {
              error: 'Ya tienes una actividad activa. Finaliza o pausa la actual antes de crear una nueva.',
              code: 'ACTIVIDAD_ACTIVA',
            },
            { status: 409 }
          )
        }
      }

      try {
        // Para `inicio` el marcador es COALESCE(?, NOW()): si el cliente no
        // envio marca de tiempo, entra la hora del servidor.
        const marcadores = columnas.map((c) => (c === 'inicio' ? 'COALESCE(?, NOW())' : '?')).join(', ')
        const estadoInicial = esBloqueCerrado ? 'PENDIENTE_APROBACION' : 'EN_CURSO'
        const [result] = await conexion.query(
          `INSERT INTO actividades (${columnas.join(', ')}, estado) VALUES (${marcadores}, ?)`,
          [...valores, estadoInicial]
        )
        const insertId = (result as { insertId: number }).insertId

        const [nueva] = await conexion.query<RowDataPacket[]>(
          `SELECT a.id, a.usuario_id, a.cliente_id, a.tipo_actividad_id, a.descripcion, a.facturable,
            ${proyectoCampos} ${servicioCampos} a.inicio, a.fin, a.estado, a.created_at,
            u.nombre AS usuario_nombre, u.cargo, u.especialidad, u.area_id,
            ta.nombre AS tipo_actividad_nombre,
            ar.nombre AS area_nombre,
            c.nombre AS cliente_nombre
           FROM actividades a
           INNER JOIN usuarios u ON u.id = a.usuario_id
           INNER JOIN tipos_actividad ta ON ta.id = a.tipo_actividad_id
           INNER JOIN areas ar ON ar.id = u.area_id
           ${proyectoJoin}
           ${servicioJoin}
           LEFT JOIN clientes c ON c.id = a.cliente_id
           WHERE a.id = ?`,
          [insertId]
        )
        actividadCreada = nueva[0] as Record<string, unknown>
      } catch (error) {
        // Choca con el indice unico de id_operacion. Con la comprobacion previa
        // hecha dentro de la transicion esto casi no puede ocurrir: solo si dos
        // hilos con el MISMO id_operacion llegan a la vez y uno gana el INSERT.
        // Se comprueba el codigo de MySQL ANTES de asumir nada, porque un
        // ER_DUP_ENTRY tambien puede venir de otro indice unico (por ejemplo
        // `usuario`), y en ese caso la fila no seria la operacion buscada.
        if ((error as { code?: string }).code === 'ER_DUP_ENTRY' && idOperacion) {
          await conexion.rollback()
          const previa = await buscarPorIdOperacion(idOperacion, context.activa!.id, usuarioObjetivoId)
          if (previa) {
            return NextResponse.json({ ok: true, actividad: previa, duplicada: true })
          }
          // Choca con el indice unico pero la fila NO es de este usuario: el
          // identificador de operacion ya esta en uso por otra cuenta. No se
          // devuelve esa fila (seria filtrar la actividad de otro) ni se responde
          // un 500 por un dato que el cliente controla. Se informa sin revelar de
          // quien es la actividad.
          return NextResponse.json(
            {
              error: 'Identificador de operación duplicado. Genera uno nuevo e inténtalo de nuevo.',
              code: 'ID_OPERACION_DUPLICADO',
            },
            { status: 409 }
          )
        }
        throw error
      }

      await conexion.commit()
    } catch (error) {
      try {
        await conexion.rollback()
      } catch {}
      throw error
    } finally {
      conexion.release()
    }

    notifyActivityChange(usuarioObjetivoId)

    // Un bloque cerrado nace pendiente de aprobación, así que se avisa a quien
    // revisa igual que cuando se finaliza una actividad con el cronómetro.
    if (esBloqueCerrado && actividadCreada) {
      const clienteCreado = actividadCreada.cliente_id == null ? null : Number(actividadCreada.cliente_id)
      if (clienteCreado != null) {
        await notificarBolsaHorasPorId(clienteCreado, context.activa!.id)
      }
      await notificarRevisoresActividad(
        context.activa!.id,
        usuarioObjetivoId,
        'aprobacion',
        'Registro pendiente de aprobación',
        'Un registro fue enviado para tu revisión.',
        `/aprobaciones?actividad=${Number(actividadCreada.id)}&estado=PENDIENTE_APROBACION`,
        `pendiente-aprobacion:${Number(actividadCreada.id)}`,
      )
    }

    return NextResponse.json({ ok: true, actividad: actividadCreada })

  } catch (error) {
    console.error('Error al crear actividad:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
