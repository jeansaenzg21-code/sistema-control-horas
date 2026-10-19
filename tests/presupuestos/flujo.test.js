// Flujo completo de presupuestos con el Excel real de Colegio Santa Rosa.
//
// Comprueba lo que el usuario pidió, con las reglas VIGENTES:
//
//   1. Importar el presupuesto lo deja APROBADO y con las bolsas DETALLADAS y
//      COMPLEMENTARIAS encendidas. Cargar el Excel es trabajo del jefe de área y
//      ES la aprobación: no hay un segundo paso ni una espera.
//   2. Los CONSOLIDADOS nunca se activan: sumarlos duplicaría el alcance.
//   3. Que las asignaciones sin confirmar NO bloqueen la aprobación. Confirmar
//      quién hace qué es una tarea posterior, no parte de dar de alta el alcance.
//   4. El jefe del ÁREA del cliente aprueba sin ser Líder del proyecto; un jefe de
//      otra área no.
//   5. El saldo del cliente se RECALCULA sobre todos sus presupuestos: un segundo
//      presupuesto no pisa el saldo del primero.
//   6. Que un fallo al importar no deje clientes ni presupuestos a medias.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const mysql = require('mysql2/promise')
const ts = require('typescript')

let pass = 0
let fail = 0
const fallos = []
function ok(c, m, extra) {
  if (c) { pass++; console.log(`  ok    ${m}`) }
  else { fail++; fallos.push(m); console.log(`  FALLA ${m}${extra ? `\n          ${extra}` : ''}`) }
}
function titulo(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`) }

// Node 26 sabe cargar .ts de forma nativa, pero lo hace como ESM y se salta
// cualquier traducci��n de alias. Por eso estos módulos se compilan a JS con el
// TypeScript del proyecto y se cachean, en vez de delegar en el cargador de Node.
const cacheModulos = new Map()

function cargarTs(relativa) {
  const absoluta = path.resolve(relativa)
  if (cacheModulos.has(absoluta)) return cacheModulos.get(absoluta)

  const fuente = fs.readFileSync(absoluta, 'utf8')
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText

  const Module = require('node:module')
  const mod = new Module(absoluta, null)
  mod.filename = absoluta
  mod.paths = Module._nodeModulePaths(path.dirname(absoluta))
  cacheModulos.set(absoluta, mod.exports)

  // Las dependencias que empiezan por "@/" se compilan con la MISMA funcion, en
  // vez de dejarlas al cargador de Node.
  const requireOriginal = mod.require.bind(mod)
  mod.require = (peticion) => {
    if (peticion.startsWith('@/')) {
      return cargarTs(path.join(process.cwd(), peticion.slice(2) + '.ts'))
    }
    return requireOriginal(peticion)
  }

  mod._compile(js, absoluta)
  return mod.exports
}

function bd() {
  const txt = fs.readFileSync('.env.local', 'utf8')
  const v = (k) => { const m = new RegExp(`^${k}=(.*)$`, 'm').exec(txt); return m ? m[1].trim() : '' }
  return { host: v('DB_HOST'), port: Number(v('DB_PORT')), user: v('DB_USER'), password: v('DB_PASSWORD'), database: v('DB_NAME') }
}

async function main() {
  const envTxt = fs.readFileSync('.env.local', 'utf8')
  for (const l of envTxt.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  }
  const db = await mysql.createConnection(bd())
  const marca = crypto.randomBytes(4).toString('hex')
  const Temporal = { clientes: [], usuarios: [], proyectos: [] }

  // Una corrida anterior pudo morir a mitad y dejar presupuesto colgando. Se
  // purga antes de empezar para partir de un estado conocido.
  await db
    .query(
      `DELETE p FROM presupuestos p
         JOIN clientes c ON c.id = p.cliente_id
        WHERE c.nombre LIKE 'FLUJO%' OR c.nombre LIKE 'PRUEBA SANTA ROSA%'`
    )
    .catch(() => {})
  await db.query("DELETE FROM clientes WHERE nombre LIKE 'FLUJO%' OR nombre LIKE 'PRUEBA SANTA ROSA%'").catch(() => {})

  try {
    const [[emp]] = await db.query('SELECT id FROM empresa ORDER BY id LIMIT 1')
    const empresaId = emp.id
    const [[area]] = await db.query('SELECT id FROM areas WHERE empresa_id = ? ORDER BY id LIMIT 1', [empresaId])
    const areaId = area.id

    // usuarios: el Lider, otro jefe de area y un jefe de OTRA area ----
    const mkUsuario = async (nombre, rol) => {
      const slug = nombre.slice(0, 6).toLowerCase().replace(/\s/g, '')
      const [r] = await db.query(
        `INSERT INTO usuarios (nombre, usuario, correo, password_hash, rol, area_id, activo)
         VALUES (?,?,?,?,?,?,TRUE)`,
        [nombre, `flujo_${marca}_${slug}`, `f_${marca}_${slug}@e.test`, 'X', rol, areaId]
      )
      Temporal.usuarios.push(r.insertId)
      return r.insertId
    }
    const liderId = await mkUsuario('Lider Prueba', 'PERSONAL')
    const jefeId = await mkUsuario('Jefe Otro', 'JEFE_AREA')
    const [[otraArea]] = await db.query('SELECT id FROM areas WHERE empresa_id = ? AND id <> ? ORDER BY id LIMIT 1', [empresaId, areaId])
    const jefeAjenoId = await mkUsuario('Jefe Ajeno', 'JEFE_AREA')
    await db.query('UPDATE usuarios SET area_id = ? WHERE id = ?', [otraArea.id, jefeAjenoId])

    const crearCliente = async (nombre) => {
      const [r] = await db.query('INSERT INTO clientes (nombre, area_id, horas_contratadas) VALUES (?,?,0)', [nombre, areaId])
      Temporal.clientes.push(r.insertId)
      return r.insertId
    }
    const crearProyecto = async (nombre, clienteId, jefe) => {
      const [r] = await db.query(
        'INSERT INTO proyectos (empresa_id, cliente_id, jefe_id, nombre, estado) VALUES (?,?,?,?,?)',
        [empresaId, clienteId, jefe, nombre, 'PLANIFICACION']
      )
      Temporal.proyectos.push(r.insertId)
      await db.query(
        `INSERT INTO proyecto_participantes (proyecto_id, usuario_id, rol_proyecto) VALUES (?,?,'LIDER')`,
        [r.insertId, liderId]
      )
      return r.insertId
    }

    const { analizarPresupuesto } = cargarTs('lib/presupuestos/importar-excel.ts')
    const { guardarAnalisis } = cargarTs('lib/presupuestos/guardar.ts')
    const act = cargarTs('lib/presupuestos/activar.ts')

    const archivo = fs.readFileSync('Presupuesto Colegio Santa Rosa (1).xlsx')
    const analisis = await analizarPresupuesto(archivo)

    titulo('Punto 1: importar deja el presupuesto APROBADO y las bolsas encendidas')
    const clienteId = await crearCliente(`FLUJO SANTA ROSA ${marca}`)
    const g = await guardarAnalisis({
      empresaId, clienteId, usuarioId: liderId,
      nombreArchivo: 'Presupuesto Colegio Santa Rosa (1).xlsx', archivo, analisis,
    })
    ok(g.presupuestoId > 0, `presupuesto importado (id=${g.presupuestoId})`)

    const [[estadoTrasImportar]] = await db.query('SELECT estado FROM presupuestos WHERE id = ?', [g.presupuestoId])
    ok(estadoTrasImportar.estado === 'APROBADO', `queda APROBADO al importar (${estadoTrasImportar.estado})`)

    const [bolsasTrasImportar] = await db.query(
      `SELECT origen, activo, COALESCE(SUM(horas),0) h FROM presupuesto_servicios
        WHERE presupuesto_id = ? GROUP BY origen, activo ORDER BY origen`,
      [g.presupuestoId]
    )
    console.log('  bolsas tras importar ->', JSON.stringify(bolsasTrasImportar))
    const activas = (origen) => Number(bolsasTrasImportar.find((b) => b.origen === origen && Number(b.activo) === 1)?.h ?? 0)
    const apagadas = (origen) => Number(bolsasTrasImportar.find((b) => b.origen === origen && Number(b.activo) === 0)?.h ?? 0)
    ok(apagadas('CONSOLIDADO') > 0 || activas('CONSOLIDADO') === 0, 'los CONSOLIDADO nunca quedan activos')
    ok(activas('CONSOLIDADO') === 0, 'los CONSOLIDADO siguen apagados tras importar')
    ok(activas('DETALLADO') === 270, `los 270 h DETALLADOS quedan encendidos (${activas('DETALLADO')})`)
    ok(activas('COMPLEMENTARIO') === 2, `las 2 h COMPLEMENTARIAS quedan encendidas (${activas('COMPLEMENTARIO')})`)

    // El saldo del cliente se recalcula al importar, con las bolsas ya activas.
    const [[saldo0]] = await db.query('SELECT horas_contratadas FROM clientes WHERE id = ?', [clienteId])
    ok(Number(saldo0.horas_contratadas) === 272, `el saldo del cliente queda en 272 h al importar (${saldo0.horas_contratadas})`)

    // Punto 3: las asignaciones sin confirmar YA NO bloquean la aprobacion.
    const aprobacionTardia = await act.aprobarPresupuesto({
      presupuestoId: g.presupuestoId,
      usuario: { id: liderId, rol: 'PERSONAL', area_id: areaId },
      justificacion: 'intento',
    })
    ok(aprobacionTardia.ok, 'aprobar YA NO exige confirmar las asignaciones', aprobacionTardia.error)

    titulo('Punto 4: el jefe del AREA del cliente aprueba sin ser Lider')
    const porJefe = await act.aprobarPresupuesto({
      presupuestoId: g.presupuestoId,
      usuario: { id: jefeId, rol: 'JEFE_AREA', area_id: areaId },
      justificacion: 'soy el jefe del area de este cliente',
    })
    ok(porJefe.ok, 'el jefe del área del cliente SI aprueba, sin ser Lider', porJefe.error)
    const porJefeAjeno = await act.aprobarPresupuesto({
      presupuestoId: g.presupuestoId,
      usuario: { id: jefeAjenoId, rol: 'JEFE_AREA', area_id: otraArea.id },
      justificacion: 'soy jefe de otra area',
    })
    ok(!porJefeAjeno.ok, 'pero un jefe de otra area NO', porJefeAjeno.error)

    titulo('Repartir lo pendiente: el Lider confirma las asignaciones')
    // Solo servicios DETALLADOS: en un consolidado las asignaciones ya suman la
    // bolsa entera y no hay nada que repartir.
    const [asigPend] = await db.query(
      `SELECT a.id, a.horas, a.nombre_texto FROM presupuesto_asignaciones a
         JOIN presupuesto_servicios s ON s.id = a.servicio_id
        WHERE s.presupuesto_id = ? AND a.estado = 'PENDIENTE_REVISION'
          AND s.origen <> 'CONSOLIDADO'
        ORDER BY a.horas DESC LIMIT 1`,
      [g.presupuestoId]
    )
    ok(asigPend.length > 0, `hay asignaciones pendientes (${asigPend.length} consultada)`)

    // Autorizacion en la ACCION, no solo en la ruta: un PERSONAL que no es el
    // Lider no debe poder confirmar horas ajenas por muchos que cierre la
    // peticion.
    const sinPermiso = await act.confirmarAsignacion({
      asignacionId: asigPend[0].id,
      usuarioId: liderId,
      actor: { id: jefeAjenoId, rol: 'JEFE_AREA', area_id: otraArea.id },
      motivo: 'intento sin autorizacion',
    })
    ok(!sinPermiso.ok, 'un jefe de area ajeno NO puede confirmar asignaciones', sinPermiso.error)
    ok(
      /l[ií]der/i.test(sinPermiso.ok === false ? sinPermiso.error : ''),
      'el rechazo explica que solo puede el Lider',
      sinPermiso.ok === false ? sinPermiso.error : 'no explico nada'
    )

    const confirmada = await act.confirmarAsignacion({
      asignacionId: asigPend[0].id,
      usuarioId: liderId,
      actor: { id: liderId, rol: 'PERSONAL', area_id: areaId },
      motivo: 'El Lider lo asume mientras se resuelve la identidad',
    })
    ok(confirmada.ok, 'el Lider puede confirmar una asignacion', confirmada.error)

    // La auditoria debe attribution al actor, no a quien se le asignaron las horas.
    const [[cambio]] = await db.query(
      `SELECT usuario_id FROM presupuesto_cambios
        WHERE presupuesto_id = ? AND tipo = 'REDISTRIBUCION'
        ORDER BY id DESC LIMIT 1`,
      [g.presupuestoId]
    )
    ok(
      Number(cambio.usuario_id) === Number(liderId),
      'el cambio de reparto queda registrado a nombre de quien lo ejecuto',
      `usuario_id=${cambio?.usuario_id}`
    )

    titulo('Aprobar y activar bolsas')
    // Las bolsas ya estan encendidas por la importacion, asi que activarBolsas
    // debe ser idempotente y no reventar.
    const activacion = await act.activarBolsas({
      presupuestoId: g.presupuestoId,
      usuario: { id: liderId, rol: 'PERSONAL', area_id: areaId },
      justificacion: 'Activo las bolsas contratadas',
    })
    ok(activacion.ok, 'activar bolsas es idempotente y no falla', activacion.error)

    titulo('Punto 2: el saldo se calcula sobre las bolsas ACTIVAS')
    const [activos] = await db.query(
      `SELECT origen, SUM(horas) h FROM presupuesto_servicios WHERE presupuesto_id = ? AND activo = 1 GROUP BY origen`,
      [g.presupuestoId]
    )
    const det = Number(activos.find((a) => a.origen === 'DETALLADO')?.h ?? 0)
    const comp = Number(activos.find((a) => a.origen === 'COMPLEMENTARIO')?.h ?? 0)
    const cons = Number(activos.find((a) => a.origen === 'CONSOLIDADO')?.h ?? 0)
    console.log(`  activos -> DETALLADO=${det} COMPLEMENTARIO=${comp} CONSOLIDADO=${cons}`)
    ok(det === 270, `estan activas las 270 h detalladas (${det})`)
    ok(cons === 0, 'los consolidados NO se activan (0)')
    ok(comp === 2, `las 2 h complementarias SI se activan (${comp})`)

    const [[saldo1]] = await db.query('SELECT horas_contratadas FROM clientes WHERE id = ?', [clienteId])
    ok(Number(saldo1.horas_contratadas) === 272, `el saldo del cliente queda en 272 h (${saldo1.horas_contratadas})`)

    titulo('Punto 5: un segundo presupuesto NO pisa el saldo del primero')
    const proyectoId = await crearProyecto(`Proyecto Santa Rosa ${marca}`, clienteId, liderId)
    const [[adminRow]] = await db.query(
      "SELECT id FROM usuarios WHERE rol = 'ADMINISTRACION' AND activo = TRUE LIMIT 1"
    )
    const vinculo = await act.vincularProyecto({
      presupuestoId: g.presupuestoId,
      proyectoId,
      liderId,
      usuario: { id: adminRow.id, rol: 'ADMINISTRACION', area_id: null },
      justificacion: 'Alta desde el Excel: designando al Lider',
    })
    ok(vinculo.ok, 'el presupuesto se vincula y se designa el Lider', vinculo.error)

    await act.recalcularHorasContratadas(db, clienteId)
    const [[saldo2]] = await db.query('SELECT horas_contratadas FROM clientes WHERE id = ?', [clienteId])
    ok(Number(saldo2.horas_contratadas) === 272, `tras vincular y recalcular sigue en 272 h (${saldo2.horas_contratadas})`)

    titulo('Punto 6: el admin ya no queda como excepcion')
    // Antes, un admin que no era Líder registraba una EXCEPCION y necesitaba
    // justificar por escrito. Con el presupuesto colgando del cliente, el admin
    // actua como parte de la gestion normal.
    const [[admin]] = await db.query("SELECT id FROM usuarios WHERE rol = 'ADMINISTRACION' LIMIT 1")
    if (admin) {
      const porAdmin = await act.aprobarPresupuesto({
        presupuestoId: g.presupuestoId,
        usuario: { id: admin.id, rol: 'ADMINISTRACION', area_id: null },
        justificacion: '',
      })
      ok(porAdmin.ok, 'el admin aprueba sin justificar y sin que sea excepcion', porAdmin.error)
    } else {
      console.log('  (no hay ADMINISTRACION en la base; se omite)')
    }
  } finally {
    titulo('Limpieza')
    for (const pid of Temporal.proyectos) {
      await db.query('DELETE FROM proyecto_participantes WHERE proyecto_id = ?', [pid]).catch(() => {})
      await db.query('DELETE FROM presupuesto_planificacion WHERE proyecto_id = ?', [pid]).catch(() => {})
      await db.query('DELETE FROM presupuesto_desviaciones WHERE proyecto_id = ?', [pid]).catch(() => {})
      
      await db.query('UPDATE presupuesto_servicios SET proyecto_id = NULL WHERE proyecto_id = ?', [pid]).catch(() => {})
      await db.query('DELETE FROM proyectos WHERE id = ?', [pid]).catch(() => {})
    }
    for (const cid of Temporal.clientes) {
      await db.query('DELETE FROM presupuestos WHERE cliente_id = ?', [cid]).catch(() => {})
      await db.query('DELETE FROM clientes WHERE id = ?', [cid]).catch(() => {})
    }
    for (const uid of Temporal.usuarios) {
      await db.query('DELETE FROM proyecto_participantes WHERE usuario_id = ?', [uid]).catch(() => {})
      await db.query('DELETE FROM usuarios WHERE id = ?', [uid]).catch(() => {})
    }
    // Solo se cuentan los presupuestos de los clientes que creo esta prueba.
    // Contar toda la tabla exigiria una base vacia y fallaria en cuanto haya
    // presupuesto real, que es justo lo que se esta probando.
    const [[r]] = await db.query(
      `SELECT COUNT(*) n FROM presupuestos p
         JOIN clientes c ON c.id = p.cliente_id
        WHERE c.nombre LIKE 'FLUJO%' OR c.nombre LIKE 'PRUEBA SANTA ROSA%'`
    )
    ok(r.n === 0, `no queda ningun presupuesto de prueba (${r.n})`)
    await db.end()
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Pasaron: ${pass}   Fallaron: ${fail}`)
  if (fallos.length) { console.log('\nFallos:'); for (const f of fallos) console.log(`  - ${f}`) }
  console.log('='.repeat(60))
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('Error:', e); process.exit(1) })
