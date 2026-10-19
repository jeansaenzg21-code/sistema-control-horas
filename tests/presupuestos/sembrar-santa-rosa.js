// Deja Colegio Santa Rosa listo para abrir la vista de gestión.
//
// No inventa nada: usa el Excel real, el personal real y el flujo real de
// importación y vinculación. Se puede ejecutar las veces que haga falta.
//
// IMPORTANTE: esta siembra deja el presupuesto en EN_REVISION a propósito.
// Aprobar y activar bolsas son decisiones del Líder del proyecto y no las
// automatiza un script: si lo hicieran, la pantalla mostraría horas como
// contratadas que nadie ha firmado.

const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cacheModulos = new Map()
function cargarTs(relativa) {
  const absoluta = path.resolve(relativa)
  if (cacheModulos.has(absoluta)) return cacheModulos.get(absoluta)
  const js = ts.transpileModule(fs.readFileSync(absoluta, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const Module = require('node:module')
  const mod = new Module(absoluta, null)
  mod.filename = absoluta
  mod.paths = Module._nodeModulePaths(path.dirname(absoluta))
  cacheModulos.set(absoluta, mod.exports)
  const req = mod.require.bind(mod)
  mod.require = (p) => (p.startsWith('@/') ? cargarTs(path.join(process.cwd(), p.slice(2) + '.ts')) : req(p))
  mod._compile(js, absoluta)
  return mod.exports
}

async function main() {
  const envTxt = fs.readFileSync('.env.local', 'utf8')
  for (const l of envTxt.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  }
  const mysql = require('mysql2/promise')
  const cfg = (() => {
    const v = (k) => { const m = new RegExp(`^${k}=(.*)$`, 'm').exec(envTxt); return m ? m[1].trim() : '' }
    return { host: v('DB_HOST'), port: Number(v('DB_PORT')), user: v('DB_USER'), password: v('DB_PASSWORD'), database: v('DB_NAME') }
  })()
  const db = await mysql.createConnection(cfg)

  const { analizarPresupuesto } = cargarTs('lib/presupuestos/importar-excel.ts')
  const { guardarAnalisis } = cargarTs('lib/presupuestos/guardar.ts')
  const act = cargarTs('lib/presupuestos/activar.ts')

  const [[emp]] = await db.query('SELECT id FROM empresa ORDER BY id LIMIT 1')
  const empresaId = emp.id
  const [[area]] = await db.query('SELECT id, nombre FROM areas WHERE empresa_id = ? AND activo = 1 ORDER BY nombre LIMIT 1', [empresaId])

  // --- personal real --------------------------------------------------------
  // Solo las personas que el Excel nombra de forma identificable. "Trainee" y la
  // fila de 4 h sin nombre NO entran aquí: no hay a quién asignárselas.
  const personal = {}
  for (const n of ['CHISCUL MOLINA EDUARDO EMILIO', 'FLORES CASTILLO YONNY ALEXANDER', 'ALAYO BERECHE JULIA MERCEDES']) {
    const [[u]] = await db.query('SELECT id FROM usuarios WHERE nombre = ? AND activo = 1 LIMIT 1', [n])
    personal[n] = u?.id ?? null
  }
  const liderId = personal['CHISCUL MOLINA EDUARDO EMILIO']
  if (!liderId) { console.error('No se encontro al Lider en la base.'); process.exit(1) }

  // --- cliente --------------------------------------------------------------
  const [[cliente]] = await db.query("SELECT id FROM clientes WHERE nombre = 'Colegio Santa Rosa' LIMIT 1")
  let clienteId = cliente?.id
  if (!clienteId) {
    const [r] = await db.query('INSERT INTO clientes (nombre, area_id, horas_contratadas) VALUES (?,?,0)', ['Colegio Santa Rosa', area.id])
    clienteId = r.insertId
    console.log(`  cliente creado id=${clienteId}`)
  } else {
    console.log(`  cliente ya existia id=${clienteId}`)
  }

  // --- proyecto -------------------------------------------------------------
  // fecha_inicio se deja NULL a proposito: el Excel trae semanas relativas, no
  // fechas de calendario. Poner una fecha aqui seria fabricar un commitment que
  // el Lider todavia no ha confirmado.
  const NOMBRE_PROYECTO = 'SG-SST 2026 - Implementacion y mantenimiento'
  const [[proyecto]] = await db.query('SELECT id FROM proyectos WHERE nombre = ? LIMIT 1', [NOMBRE_PROYECTO])
  let proyectoId = proyecto?.id
  if (!proyectoId) {
    const [r] = await db.query(
      `INSERT INTO proyectos (empresa_id, cliente_id, jefe_id, nombre, descripcion, estado, fecha_inicio, activo)
       VALUES (?,?,?,?,?,?,NULL,1)`,
      [empresaId, clienteId, liderId, NOMBRE_PROYECTO,
       'Elaboracion e implementacion documentaria del SG-SST, mantenimiento, comite, riesgo psicosocial y prevencion del hostigamiento sexual laboral.', 'EN_CURSO']
    )
    proyectoId = r.insertId
    console.log(`  proyecto creado id=${proyectoId} (sin fecha de inicio)`)
  } else {
    console.log(`  proyecto ya existia id=${proyectoId}`)
  }

  // El equipo del Excel participa del proyecto. El Trainee no: no es una persona
  // identificable en la base y no se puede añadir a nadie por su cuenta.
  for (const nombre of ['FLORES CASTILLO YONNY ALEXANDER', 'ALAYO BERECHE JULIA MERCEDES']) {
    const uid = personal[nombre]
    if (!uid) continue
    await db.query(
      `INSERT INTO proyecto_participantes (proyecto_id, usuario_id, rol_proyecto) VALUES (?,?,'ESPECIALISTA')
       ON DUPLICATE KEY UPDATE rol_proyecto = 'ESPECIALISTA'`,
      [proyectoId, uid]
    )
  }
  await db.query(
    `INSERT INTO proyecto_participantes (proyecto_id, usuario_id, rol_proyecto) VALUES (?,?,'LIDER')
     ON DUPLICATE KEY UPDATE rol_proyecto = 'LIDER'`,
    [proyectoId, liderId]
  )
  await db.query(`UPDATE proyectos SET jefe_id = ? WHERE id = ? AND jefe_id IS NULL`, [liderId, proyectoId])

  // --- presupuesto ----------------------------------------------------------
  const archivo = fs.readFileSync('Presupuesto Colegio Santa Rosa (1).xlsx')
  const analisis = await analizarPresupuesto(archivo)
  // El reconocimiento de personal ocurre dentro de guardarAnalisis: las
  // personas que el Excel nombra de forma clara quedan CONFIRMADA y las que no
  // (Trainee, 4 h sin nombre) quedan PENDIENTE_REVISION. No se reparte a mano
  // aquí porque eso lo hace el Líder desde la pantalla.
  const g = await guardarAnalisis({
    empresaId, clienteId, usuarioId: liderId,
    nombreArchivo: 'Presupuesto Colegio Santa Rosa (1).xlsx', archivo, analisis,
  })
  console.log(`  presupuesto id=${g.presupuestoId} v${g.version} (${g.yaExistia ? 'reimportado' : 'nuevo'})`)

  // --- ADMIN vincula y designa al Lider ------------------------------------
  // vincularProyecto también reparte proyecto_id en los servicios y en la
  // planificación, así que el Gantt queda ligado sin insertar filas a mano
  // (insertarlas aquí duplicaba la planificación en cada ejecución).
  const [[admin]] = await db.query("SELECT id FROM usuarios WHERE rol = 'ADMINISTRACION' AND activo = 1 LIMIT 1")
  const v = await act.vincularProyecto({
    presupuestoId: g.presupuestoId, proyectoId, liderId,
    usuario: { id: admin.id, rol: 'ADMINISTRACION', area_id: null },
    justificacion: 'Importación inicial del presupuesto de Colegio Santa Rosa.',
  })
  console.log(`  vincular: ${v.ok ? 'ok' : 'FALLO ' + v.error}`)

  // --- estado real ----------------------------------------------------------
  const [[pres]] = await db.query('SELECT estado FROM presupuestos WHERE id = ?', [g.presupuestoId])
  const [servicios] = await db.query(
    `SELECT origen, COUNT(*) n, COALESCE(SUM(horas),0) horas, SUM(activo) activos
       FROM presupuesto_servicios WHERE presupuesto_id = ? GROUP BY origen ORDER BY origen`,
    [g.presupuestoId]
  )
  const [asig] = await db.query(
    `SELECT a.estado, COUNT(*) n, COALESCE(SUM(a.horas),0) horas
       FROM presupuesto_asignaciones a
       JOIN presupuesto_servicios s ON s.id = a.servicio_id
      WHERE s.presupuesto_id = ? AND s.origen <> 'CONSOLIDADO'
      GROUP BY a.estado`,
    [g.presupuestoId]
  )
  const [[plan]] = await db.query('SELECT COUNT(*) n, COALESCE(SUM(horas),0) horas FROM presupuesto_planificacion WHERE proyecto_id = ?', [proyectoId])
  const [[saldo]] = await db.query('SELECT horas_contratadas FROM clientes WHERE id = ?', [clienteId])

  console.log(`\n  Cliente Colegio Santa Rosa  id=${clienteId}`)
  console.log(`  Proyecto id=${proyectoId}  (Lider: ${liderId}, sin fecha de inicio)`)
  console.log(`  Presupuesto id=${g.presupuestoId}  estado=${pres.estado}`)
  for (const s of servicios) {
    console.log(`    ${s.origen.padEnd(14)} ${s.n} servicios  ${s.horas} h  (${s.activos} activos)`)
  }
  for (const a of asig) {
    console.log(`    asignaciones ${a.estado.padEnd(18)} ${a.n}  ${a.horas} h`)
  }
  console.log(`  Planificacion: ${plan.n} sub-etapas, ${plan.horas} h, en semanas relativas`)
  console.log(`  Horas contratadas del cliente: ${saldo.horas_contratadas} (0 mientras el presupuesto este en revision)`)
  console.log(`\n  Pendiente de decision del Lider: aprobar y activar bolsas desde la pantalla.`)

  await db.end()
  // Los modulos cargados abren su propio pool de lib/db. Sin cerrarlo el proceso
  // se queda vivo y el script nunca termina.
  const { default: pool } = cargarTs('lib/db.ts')
  await pool.end()
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('Error:', e); process.exit(1) })
