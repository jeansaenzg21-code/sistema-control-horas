// Datos de demostración para el área de Consultoría.
//
// Genera horas registradas por los usuarios reales de una división, con los
// tipos de actividad que le tocan, para poder ver el sistema funcionando:
// resumen, reportes, pantalla de aprobaciones, historial.
//
// NO es un script de pruebas: escribe en la base de datos y no apunta a
// producción. Todo lo que inserta queda marcado en `actividades.id_operacion`
// con el prefijo "demo-cons-", que es una columna técnica que ninguna pantalla
// muestra. Para borrarlo entero:
//
//   node tests/demo-consultoria.cjs --limpiar
//
// Otras opciones:
//
//   --area "Auditoría"   otra división (por defecto "Consultoría")
//   --dias 30           cuántos días hábiles hacia atrás (por defecto 20)
//   --sin-hoy           no generar el día de hoy
//   --semilla 12345     cambiar la secuencia aleatoria
//
// Las cuentas que dejaron las pruebas end-to-end se reconocen por el patrón de
// su usuario y se descartan: son "e2e.<algo>@paredescano.test" y "flujo_<algo>".

const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const RAIZ = path.resolve(__dirname, '..')

function leerEntorno() {
  const archivo = path.join(RAIZ, '.env.local')
  if (!fs.existsSync(archivo)) return
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
leerEntorno()

const args = process.argv.slice(2)
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto
}

const MARCA = 'demo-cons-%'
const LIMPIAR = args.includes('--limpiar')
const AREA = opcion('area', 'Consultoría')
const DIAS = Number(opcion('dias', 0))
const MESES = Number(opcion('meses', 1))
const SIN_HOY = args.includes('--sin-hoy')
const SEMILLA = Number(opcion('semilla', 20261002))

/** Generador congruencial: misma semilla, mismos datos. */
function aleatorio(semilla) {
  let s = semilla >>> 0
  return function () {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = aleatorio(SEMILLA)
const entero = (min, max) => min + Math.floor(rnd() * (max - min + 1))
const elegir = (lista) => lista[Math.floor(rnd() * lista.length)]
const quizas = (p) => rnd() < p

function porPeso(pesos) {
  const entradas = Object.entries(pesos)
  const total = entradas.reduce((t, e) => t + e[1], 0)
  let n = rnd() * total
  for (const [clave, peso] of entradas) {
    n -= peso
    if (n <= 0) return clave
  }
  return entradas[entradas.length - 1][0]
}

/**
 * Cuánto se usa cada tipo. No es uniforme: en consultoría se registran más
 * levantamientos e informes que flujogramas, y así se ve en el reporte por
 * actividad. Los comentarios son los nombres que define
 * lib/actividades/catalogo-excel.ts.
 */
const PESOS_ESPECIFICOS = {
  'CON-01': 8, // Planeamiento/Conocimiento del Negocio
  'CON-02': 5, // Determinación del Mapa de Procesos (Modelos/Datos)
  'CON-03': 6, // Evaluación de Procesos y Funciones
  'CON-04': 7, // Elaboración de Informes/Manuales y Formatos
  'CON-05': 3, // Otras Actividades Inherentes
  'CON-1': 7, // Información Relevante del Negocio, Ámbito, Normatividad, etc
  'CON-10': 4, // Evaluación Preliminar del RRHH (Responsabilidades, Perfiles, etc)
  'CON-11': 5, // Seguimiento y Pruebas de Riesgo
  'CON-13': 4, // Reuniones Externas
  'CON-14': 6, // Reuniones Internas
  'CON-15': 4, // Preparación de Presentaciones
  'CON-17': 5, // Checklist
  'CON-18': 4, // Flujogramas
  'CON-19': 3, // Directrices (Políticas, Normativa, Entre Otros)
  'CON-2': 6, // Planeamiento Detallado
  'CON-20': 4, // Mapa de Procesos
  'CON-21': 3, // Indicadores
  'CON-22': 3, // Listas Maestras
  'CON-23': 3, // Definición de Centros de Costos
  'CON-24': 4, // Clasificación de Costos y Gastos
  'CON-25': 4, // Validación de Información Relevada
  'CON-26': 3, // Cuadros de Costos
  'CON-27': 4, // Auditoría de Cumplimiento y/o Seguimiento
  'CON-28': 3, // Capacitación de Personal
  'CON-29': 3, // Mejoramiento de Papeles de Trabajo
  'CON-30': 5, // Control de Calidad
  'CON-31': 5, // Revisión de Informe
  'CON-4': 4, // Revisión de la Organización (Organigrama, Manuales, Políticas, etc)
  'CON-5': 7, // Análisis y Evaluación de la Información Requerida
  'CON-6': 5, // Determinación de Factores Críticos, Riesgos y Costos
  'CON-8': 3, // Análisis de la Especificación de Interfaz de Usuario
  'CON-9': 4, // Requerimiento de Datos (Sistema - Usuario), Arquitectura Diseño
}

const PESOS_GENERALES = {
  'Levantamiento y Diagnóstico': 4,
  'Ejecución y Procesamiento Operativo': 5,
  'Análisis, Mapeo y Elaboración': 4,
  'Revisión, Informes y Cierre': 3,
  'Gestión Interna y Capacitación': 3,
}

const DESCRIPCIONES = {
  'CON-01': ['Planeamiento y reconocimiento del proceso del cliente', 'Levantamiento inicial de la operación'],
  'CON-02': ['Definición del mapa de procesos del alcance', 'Mapeo de procesos por área'],
  'CON-03': ['Evaluación de procesos y funciones', 'Evaluación de eficiencia de funciones'],
  'CON-04': ['Elaboración del manual de funciones', 'Informe y formatos de levantamiento'],
  'CON-05': ['Otras actividades inherentes al encargo'],
  'CON-1': ['Levantamiento de información relevante del negocio', 'Análisis de la normativa aplicable al cliente'],
  'CON-10': ['Evaluación preliminar del recurso humano', 'Perfilamiento de puestos y responsabilidades'],
  'CON-11': ['Seguimiento y pruebas de riesgo', 'Pruebas de controles identificados'],
  'CON-13': ['Reunión con el cliente', 'Comité de seguimiento con el cliente'],
  'CON-14': ['Reunión interna del equipo', 'Coordinación interna del proyecto'],
  'CON-15': ['Preparación de presentación al cliente', 'Armado de exposición de resultados'],
  'CON-17': ['Elaboración del checklist de trabajo', 'Verificación del checklist del alcance'],
  'CON-18': ['Flujograma del proceso', 'Diagrama de flujo del circuito revisado'],
  'CON-19': ['Directrices y políticas del cliente', 'Definición de normas internas del encargo'],
  'CON-2': ['Planeamiento detallado del servicio', 'Cronograma del encargo'],
  'CON-20': ['Mapa de procesos validado con el cliente', 'Ajuste del mapa de procesos'],
  'CON-21': ['Definición de indicadores', 'Construcción del tablero de indicadores'],
  'CON-22': ['Depuración de listas maestras', 'Consolidación de listas maestras'],
  'CON-23': ['Definición de centros de costos', 'Revisión de centros de costos'],
  'CON-24': ['Clasificación de costos y gastos', 'Criterios de clasificación aplicados'],
  'CON-25': ['Validación de la información relevada', 'Revisión de consistencia de la información'],
  'CON-26': ['Cuadro de costos por centro', 'Consolidación de cuadros de costos'],
  'CON-27': ['Auditoría de cumplimiento normativo', 'Seguimiento de recomendaciones'],
  'CON-28': ['Capacitación al personal del cliente', 'Taller de socialización del sistema'],
  'CON-29': ['Mejoramiento de papeles de trabajo', 'Optimización de formatos del encargo'],
  'CON-30': ['Control de calidad de la entrega', 'Revisión de calidad antes del envío'],
  'CON-31': ['Revisión del informe', 'Revisión del informe final del encargo'],
  'CON-4': ['Revisión de la organización del cliente', 'Análisis de organigrama y manuales'],
  'CON-5': ['Análisis de la información requerida', 'Evaluación de la información solicitada'],
  'CON-6': ['Determinación de factores críticos y riesgos', 'Matriz de riesgos del encargo'],
  'CON-8': ['Análisis de la especificación de interfaz', 'Definición de pantallas del sistema'],
  'CON-9': ['Levantamiento de requerimientos del sistema', 'Definición de la arquitectura de datos'],
  'Levantamiento y Diagnóstico': ['Diagnóstico general del encargo'],
  'Ejecución y Procesamiento Operativo': ['Ejecución de actividades operativas del encargo'],
  'Análisis, Mapeo y Elaboración': ['Análisis y elaboración de entregables'],
  'Revisión, Informes y Cierre': ['Cierre de etapa del encargo', 'Revisión de informe para el cierre'],
  'Gestión Interna y Capacitación': ['Capacitación interna del equipo', 'Gestión interna de la consultantía'],
}

/**
 * Pesos por id de cliente, para que no todos los clientes acumulen lo mismo.
 *
 * Devuelve el CLIENTE, no su id: `porPeso` devuelve la clave de un objeto, que
 * es texto, y un Map indexado por número no la encuentra. Ese detalle costó una
 * tanda entera de 600 registros sin cliente.
 */
const PESOS_CLIENTE = { 19: 5, 54: 4, 55: 3, 58: 2, 63: 2, 64: 2 }

function elegirCliente(clientes) {
  const conPeso = clientes.filter((c) => PESOS_CLIENTE[c.id])
  const candidatos = conPeso.length > 0 ? conPeso : clientes
  const pesos = candidatos.reduce((acc, c) => {
    acc[c.id] = PESOS_CLIENTE[c.id] || 1
    return acc
  }, {})
  const id = Number(porPeso(pesos))
  return candidatos.find((c) => c.id === id) ?? candidatos[0]
}

function fecha(d) {
  return d.toISOString().slice(0, 10)
}
function esFinde(d) {
  return d.getUTCDay() === 0 || d.getUTCDay() === 6
}
function horaDe(dia, minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0')
  const m = String(minutos % 60).padStart(2, '0')
  return `${dia} ${h}:${m}:00`
}
function sumarMinutos(iso, minutos) {
  const d = new Date(`${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha inválida: "${iso}"`)
  d.setUTCMinutes(d.getUTCMinutes() + minutos)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}
function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'paredescano',
    charset: 'utf8mb4_unicode_ci',
  })

  async function limpiar() {
    const [pausas] = await conn.query(
      `SELECT COUNT(*) AS n FROM pausas p
         JOIN actividades a ON a.id = p.actividad_id
        WHERE a.id_operacion LIKE ?`,
      [MARCA]
    )
    const [borradas] = await conn.query('DELETE FROM actividades WHERE id_operacion LIKE ?', [MARCA])
    // Los presupuestos de la cartera cuelgan de presupuesto_servicios con
    // ON DELETE CASCADE, así que borrar la cabecera basta.
    const [presupuestos] = await conn.query(
      `DELETE FROM presupuestos WHERE archivo_hash LIKE 'demo-cartera-%'`
    )
    console.log(
      `Limpieza: ${borradas.affectedRows} actividades, ${pausas[0].n} pausas y ${presupuestos.affectedRows} presupuestos de demostración borrados.`
    )
  }

  if (LIMPIAR) {
    await limpiar()
    await conn.end()
    return
  }

  // Toda la aritmética de fechas sale de CURDATE() del servidor, no del reloj
  // de este script: si el servidor y la máquina no comparten zona horaria, las
  // horas aparecerían corrida un día en los reportes.
  const [hoyFilas] = await conn.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS hoy")
  const HOY = String(hoyFilas[0].hoy)

  const [areas] = await conn.query(
    'SELECT id FROM areas WHERE empresa_id = 1 AND nombre = ? LIMIT 1',
    [AREA]
  )
  if (areas.length === 0) throw new Error(`No existe la división "${AREA}".`)
  const areaId = areas[0].id

  const [usuarios] = await conn.query(
    `SELECT id, nombre, rol FROM usuarios
      WHERE area_id = ? AND activo = TRUE
        AND usuario NOT LIKE '%@paredescano.test'
        AND usuario NOT LIKE 'flujo\\_%'
      ORDER BY id`,
    [areaId]
  )
  if (usuarios.length === 0) throw new Error(`No hay usuarios reales en "${AREA}".`)
  const jefe = usuarios.find((u) => u.rol === 'JEFE_AREA') || usuarios[0]
  const jefeId = jefe.id

  const [tiposFilas] = await conn.query(
    `SELECT ta.id, ta.codigo, ta.nombre FROM tipos_actividad ta
      WHERE (ta.area_id = ? AND ta.activo = TRUE) OR (ta.es_general = TRUE AND ta.activo = TRUE)`,
    [areaId]
  )
  const tipos = new Map()
  for (const t of tiposFilas) tipos.set(t.codigo || t.nombre, t)

  const [clientesFilas] = await conn.query(
    'SELECT id, nombre FROM clientes WHERE area_id = ? ORDER BY id',
    [areaId]
  )
  const clientes = clientesFilas.filter((c) => {
    const nombres = clientesFilas.filter((otro) => otro.nombre === c.nombre)
    return nombres.length === 1 || nombres[0].id === c.id
  })
  if (clientes.length === 0) throw new Error(`No hay clientes en "${AREA}".`)

const claves = [...Object.keys(PESOS_ESPECIFICOS), ...Object.keys(PESOS_GENERALES)]
const faltan = claves.filter((c) => !tipos.has(c))
if (faltan.length > 0) {
  console.log(`Aviso: esta división no tiene estos tipos en el catálogo, se omiten:`)
  console.log('   ' + faltan.join(', '))
  console.log(`   Los que sí hay en el catálogo: ${[...tipos.keys()].join(', ')}`)
}
  for (const clave of claves) {
    if (!tipos.has(clave)) delete DESCRIPCIONES[clave]
  }

  // La ventana arranca en el día 1 del mes anterior, no hace "N días hacia
  // atrás". Importa porque el panel de cumplimiento mide la cobertura sobre
  // los días hábiles DEL MES: si la ventana parte a mitad de mes, los primeros
  // días aparecen como no reportados y la cobertura de todo el equipo baja sin
  // que nadie haya hecho nada mal.
  const dias = []
  const cursor = new Date(`${HOY}T00:00:00Z`)
  const conDiasFijos = args.includes('--dias')
  if (conDiasFijos) {
    const cuantos = Math.max(1, DIAS)
    while (dias.length < cuantos) {
      cursor.setUTCDate(cursor.getUTCDate() - 1)
      if (!esFinde(cursor)) dias.unshift(fecha(cursor))
    }
  } else {
    const MESES = Math.max(1, Number(opcion('meses', 1)))
    cursor.setUTCDate(1)
    cursor.setUTCMonth(cursor.getUTCMonth() - MESES)
    while (fecha(cursor) < HOY) {
      if (!esFinde(cursor)) dias.push(fecha(cursor))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }
  if (!esFinde(cursor) && !SIN_HOY) dias.push(HOY)

// El endpoint de cumplimiento considera INCOMPLETO un registro al que le falte
// cliente, descripción, hora de fin o la clasificación de facturable (ver
// lib/cumplimiento.ts). Y `calcularEstado` exige cero incompletos para marcar
// CUMPLE: una sola fila mal rellena baja a la persona a CUMPLE_PARCIAL aunque
// haya cubierto el 100 % de los días.
//
// Con dos de cada diez registros sin cliente, el panel de cumplimiento acaba
// en "0 de 5 cumplen" para todo el equipo, que no dice nada del sistema. Aquí
// casi todo se rellena bien y el descuido se concentra en un par de personas,
// que es como se ve un equipo de verdad y además deja el panel enseñando los
// tres estados a la vez.
const DESCUIDADORES = new Set(usuarios.slice(-2).map((u) => u.id))
const tasaSinCliente = (usuarioId) => (DESCUIDADORES.has(usuarioId) ? 0.08 : 0)

// La clave se elige solo entre los tipos que el área tiene ACTIVOS. Con el
// catálogo en estado limpio (solo las cinco generales) eso es lo que se usa; en
// cuanto se importa el Excel por área, pasan a competir los específicos.
// `porPeso` devuelve la clave de un objeto, o sea texto: si se le pidiera una
// clave que no existe, el día entero se abandonaba a mitad y el área quedaba
// con dos o tres registros en vez de veinte.
const pesosCon = {}
for (const [clave, peso] of Object.entries(PESOS_ESPECIFICOS)) {
  if (tipos.has(clave)) pesosCon[clave] = peso
}
const pesosGenerales = {}
for (const [clave, peso] of Object.entries(PESOS_GENERALES)) {
  if (tipos.has(clave)) pesosGenerales[clave] = peso
}
if (Object.keys(pesosGenerales).length === 0 && Object.keys(pesosCon).length === 0) {
  throw new Error(`"${AREA}" no tiene ningún tipo de actividad activo: nada que registrar.`)
}

const filas = []
for (const dia of dias) {
  const antiguedad = diasEntre(dia, HOY)
  const esHoy = dia === HOY
  for (const persona of usuarios) {
    const sinCliente = tasaSinCliente(persona.id)
    // Hoy se deja a medias a propósito: media jornada es lo que se ve cuando
    // se abre el sistema a media mañana.
    const cuanto = esHoy ? entero(2, 3) : entero(4, 6)
      let minuto = entero(8 * 60 + 30, 9 * 60)
      let n = 0
      while (n < cuanto && minuto < 18 * 60 + 30) {
        if (minuto >= 12 * 60 + 30 && minuto < 14 * 60) minuto = 14 * 60
        const duracion = entero(40, 115)
        if (minuto + duracion > 19 * 60) break
        const inicio = horaDe(dia, minuto)
        const fin = horaDe(dia, minuto + duracion)

        const usaGeneral = quizas(pesosCon && Object.keys(pesosCon).length > 0 ? 0.17 : 1)
        const clave = usaGeneral ? porPeso(pesosGenerales) : porPeso(pesosCon)
        const tipo = tipos.get(clave)
        if (!tipo) break

        const cliente = quizas(sinCliente) ? null : elegirCliente(clientes)
        // Sin cliente no se clasifica, igual que en la aplicación: `facturable`
        // solo tiene sentido cuando hay a quién facturarle.
        const facturable = cliente ? (quizas(0.88) ? 1 : 0) : null

        let estado = 'APROBADA'
        let revisadoPor = jefe.id
        let revisadoEn = sumarMinutos(fin, entero(30, 900))
        let observacion = quizas(0.08) ? 'Conforme. Buen detalle de la actividad.' : null

        // Lo que un jefe real hace con el tiempo: hoy nadie ha revisado nada,
        // ayer se revisó parte, hace una semana quedó un rezago y lo más viejo ya
        // está cerrado. Si ayer saliera 100 % pendiente, un panel abierto en "este
        // mes" a principios de mes mostraría una sola categoría y parecería roto.
        if (esHoy) {
          estado = 'PENDIENTE_APROBACION'
          revisadoPor = null
          revisadoEn = null
          observacion = null
        } else if (antiguedad === 1 && quizas(0.35)) {
          estado = 'PENDIENTE_APROBACION'
          revisadoPor = null
          revisadoEn = null
          observacion = null
        } else if (antiguedad <= 7 && quizas(0.4)) {
          estado = 'PENDIENTE_APROBACION'
          revisadoPor = null
          revisadoEn = null
          observacion = null
        } else if (quizas(0.04)) {
          estado = 'RECHAZADA'
          observacion = 'No coincide con lo pactado. Precisar el detalle de la actividad.'
        } else if (quizas(0.04)) {
          estado = 'CORRECCION_SOLICITADA'
          observacion = 'Corregir las horas reportadas.'
        }

        filas.push({
          usuario_id: persona.id,
          cliente_id: cliente ? cliente.id : null,
          tipo_actividad_id: tipo.id,
          descripcion: elegir(DESCRIPCIONES[clave]),
          facturable,
          inicio,
          fin,
          estado,
          revisado_por: revisadoPor,
          revisado_en: revisadoEn,
          observacion_revision: observacion,
          id_operacion: `demo-cons-${dia.replace(/-/g, '')}-${persona.id}-${n}`,
          // Minutos de la actividad, sin descontar la pausa: la cartera compara
          // horas consumidas contra la bolsa del presupuesto, y la pausa ya se
          // descuenta en la consulta del endpoint.
          horas: duracion,
          pausa: quizas(0.08)
            ? (() => {
                const desde = sumarMinutos(inicio, entero(15, Math.max(20, duracion - 20)))
                return { inicio: desde, fin: sumarMinutos(desde, entero(10, 30)) }
              })()
            : null,
        })

        minuto += duracion + entero(5, 25)
        n += 1
      }
    }
  }

  await limpiar()
  await conn.beginTransaction()
  try {
    for (let i = 0; i < filas.length; i += 200) {
      const trozo = filas.slice(i, i + 200)
      const valores = []
      const marcadores = trozo
        .map((f) => {
          valores.push(
            f.id_operacion, f.usuario_id, f.cliente_id, f.tipo_actividad_id, f.descripcion,
            f.facturable, f.inicio, f.fin, f.estado, f.revisado_por, f.revisado_en,
            f.observacion_revision
          )
          return '(?,?,?,?,?,?,?,?,?,?,?,?)'
        })
        .join(',')
      await conn.query(
        `INSERT INTO actividades
          (id_operacion, usuario_id, cliente_id, tipo_actividad_id, descripcion, facturable,
           inicio, fin, estado, revisado_por, revisado_en, observacion_revision)
         VALUES ${marcadores}`,
        valores
      )
    }

    const [ids] = await conn.query(
      'SELECT id, id_operacion FROM actividades WHERE id_operacion LIKE ?',
      [MARCA]
    )
    const idPorOperacion = new Map(ids.map((r) => [r.id_operacion, r.id]))
    const pausas = filas.filter((f) => f.pausa && idPorOperacion.has(f.id_operacion))
    for (let i = 0; i < pausas.length; i += 200) {
      const trozo = pausas.slice(i, i + 200)
      const valores = trozo.flatMap((f) => [idPorOperacion.get(f.id_operacion), f.pausa.inicio, f.pausa.fin])
      await conn.query(
        `INSERT INTO pausas (actividad_id, inicio, fin) VALUES ${trozo.map(() => '(?,?,?)').join(',')}`,
        valores
      )
    }
    await conn.commit()
    console.log(`Insertadas ${filas.length} actividades y ${pausas.length} pausas en "${AREA}".`)
  } catch (error) {
    await conn.rollback()
    throw error
  }

  const [resumen] = await conn.query(
    `SELECT a.estado, COUNT(*) AS n,
            ROUND(SUM(GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, COALESCE(a.fin, NOW())) -
              COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW())))
                          FROM pausas p WHERE p.actividad_id = a.id), 0)) / 3600), 1) AS horas
       FROM actividades a WHERE a.id_operacion LIKE ? GROUP BY a.estado ORDER BY a.estado`,
    [MARCA]
  )
  console.table(resumen)

const [rango] = await conn.query(
    `SELECT MIN(DATE(inicio)) AS desde, MAX(DATE(fin)) AS hasta, COUNT(DISTINCT usuario_id) AS personas
       FROM actividades WHERE id_operacion LIKE ?`,
    [MARCA]
  )
  console.log(`Desde ${rango[0].desde} hasta ${rango[0].hasta}, ${rango[0].personas} personas.`)

  await generarCartera(conn, Number(opcion('empresa', 1)), jefeId, clientes, filas)

  console.log(`Para borrarlo: node tests/demo-consultoria.cjs --limpiar`)
  await conn.end()
}

/**
 * Presupuestos de demostración para los clientes del área.
 *
 * Sin esto la cartera enseña clientes con horas consumidas pero sin bolsa: la
 * columna de comprometidas sale a cero y el saldo no significa nada. Con esto se
 * ve un cliente que va bien, otro que se pasó de horas y otro que tiene el
 * presupuesto en observación, que es la situación que el panel existe para
 * detectar.
 *
 * Todo queda marcado en `presupuestos.archivo_hash` con el prefijo "demo-", que
 * es la columna que hace idempotente la importación real de cotizaciones: así
 * estos presupuestos no colisionan con ninguno verdadero y --limpiar los borra
 * sin tocar los de verdad.
 */
async function generarCartera(conn, empresaId, jefeId, clientes, actividades) {
  const MARCA_HASH = 'demo-cartera-'

  async function limpiarCartera() {
    const [borrados] = await conn.query(
      `DELETE FROM presupuestos WHERE archivo_hash LIKE ?`,
      [`${MARCA_HASH}%`]
    )
    if (borrados.affectedRows > 0) {
      console.log(`Cartera: ${borrados.affectedRows} presupuestos de demostración anteriorizados.`)
    }
  }

  // Servicios con nombres que suenan a encargo de consultoría, no a prueba.
  const SERVICIOS = [
    'Diagnóstico y levantado del proceso',
    'Diseño de la metodología de trabajo',
    'Implementación y acompañamiento',
    'Capacitación del personal',
    'Revisión y control de calidad',
    'Informe final y cierre',
    'Asesoría mensual',
  ]

  // Un estado por cliente para que el panel tenga de dónde sacar: dos
  // presupuestos aprobados con bolsa sana, uno que se pasó de horas y uno
  // todavía en observación.
  const PLAN = ['APROBADO', 'APROBADO', 'APROBADO', 'APROBADO', 'OBSERVADO', 'EN_REVISION']
  const HORAS_SERVICIO = [24, 32, 40, 48, 56, 64, 80]

  await limpiarCartera()
  const resumen = []

  for (const [indice, cliente] of clientes.entries()) {
    const estado = PLAN[indice % PLAN.length]
    // hash único y determinista: el mismo cliente da el mismo presupuesto al
    // reejecutar, así que --limpiar y volver a generar no deja basura.
    const hash = `${MARCA_HASH}${cliente.id}`
    const horasConsumidas = actividades
      .filter((a) => a.cliente_id === cliente.id)
      .reduce((t, a) => t + a.horas, 0) / 60

    const cantidad = entero(3, 6)
    let bolsaTotal = 0
    const servicios = []
    for (let i = 0; i < cantidad; i += 1) {
      const horas = elegir(HORAS_SERVICIO)
      bolsaTotal += horas
      servicios.push({ nombre: SERVICIOS[i % SERVICIOS.length], horas })
    }
    // Para el tercer cliente la bolsa se deja corta a propósito: así el panel
    // muestra un saldo en rojo, que es justo lo que hay que revisar.
    if (indice === 2) bolsaTotal = Math.max(8, Math.round(horasConsumidas * 0.7))

    // La versión no puede fijarse en 1: hay clientes con presupuesto real ya
// cargado (Santa Rosa, entre otros) y `uq_presupuestos_version` es único por
// empresa y cliente. Se toma la siguiente libre. Como los de demostración se
// borran antes de volver a generar, el cálculo da siempre el mismo número.
const [versiones] = await conn.query(
  `SELECT COALESCE(MAX(version), 0) + 1 AS siguiente
     FROM presupuestos WHERE empresa_id = ? AND cliente_id = ?`,
  [empresaId, cliente.id]
  )
    const [ins] = await conn.query(
      `INSERT INTO presupuestos (empresa_id, cliente_id, version, estado, archivo_nombre, archivo_hash, creado_por)
       VALUES (?, ?, ?, ?, 'demo-cartera.xlsx', ?, ?)`,
      [empresaId, cliente.id, versiones[0].siguiente, estado, hash, jefeId]
    )
    const presupuestoId = ins.insertId

    for (const [i, servicio] of servicios.entries()) {
      // Un presupuesto en observación o en revisión no tiene bolsa activa: es lo
      // que el endpoint llama "propuestas".
      const activo = estado === 'APROBADO'
      await conn.query(
        `INSERT INTO presupuesto_servicios (presupuesto_id, origen, nombre, horas, moneda, importe, activo)
         VALUES (?, 'DETALLADO', ?, ?, 'PEN', ?, ?)`,
        [presupuestoId, servicio.nombre, servicio.horas, servicio.horas * 145, activo]
      )
      void i
    }

    resumen.push({
      cliente: cliente.nombre,
      estado,
      servicios: servicios.length,
      bolsa: estado === 'APROBADO' ? bolsaTotal : 0,
      consumidas: Math.round(horasConsumidas * 10) / 10,
    })
  }

  console.log('\n=== Cartera de demostración ===')
  console.table(resumen)
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
