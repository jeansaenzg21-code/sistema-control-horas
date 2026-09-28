// Importacion real contra la base, con el Excel real de Colegio Santa Rosa.
//
// Comprueba lo que NO se puede ver leyendo el codigo: que reimportar el mismo
// archivo no duplica, que los consolidados no generan bolsa, y que una persona
// que no existe en `usuarios` no recibe las horas de otra.
//
// Al terminar BORRA todo lo que creo, para no dejar registros de prueba.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const mysql = require('mysql2/promise')
const ts = require('typescript')

let pass = 0
let fail = 0
const fallos = []
function ok(c, m, extra) {
  if (c) {
    pass++
    console.log(`  ok    ${m}`)
  } else {
    fail++
    fallos.push(m)
    console.log(`  FALLA ${m}${extra ? `\n          ${extra}` : ''}`)
  }
}
function titulo(t) {
  console.log(`\n${t}\n${'-'.repeat(t.length)}`)
}

function cargarTs(rutaRelativa) {
  const fuente = fs.readFileSync(rutaRelativa, 'utf8')
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const Module = require('node:module')
  const mod = new Module(rutaRelativa, null)
  mod.paths = Module._nodeModulePaths(path.dirname(rutaRelativa))
  // El codigo usa el alias "@/lib/..." de Next.js. Aqui se traduce a la ruta real.
  const requireOriginal = mod.require.bind(mod)
  mod.require = (peticion) => {
    if (peticion.startsWith('@/lib/')) {
      return requireOriginal(path.join(process.cwd(), peticion.replace('@/', '') + '.ts'))
    }
    if (peticion.startsWith('@/')) {
      return requireOriginal(path.join(process.cwd(), peticion.slice(2)))
    }
    return requireOriginal(peticion)
  }
  mod._compile(js, rutaRelativa)
  return mod.exports
}

function bd() {
  const txt = fs.readFileSync('.env.local', 'utf8')
  const v = (k) => {
    const m = new RegExp(`^${k}=(.*)$`, 'm').exec(txt)
    return m ? m[1].trim() : ''
  }
  return { host: v('DB_HOST'), port: Number(v('DB_PORT')), user: v('DB_USER'), password: v('DB_PASSWORD'), database: v('DB_NAME') }
}

async function main() {
  // `lib/db.ts` arma su pool desde process.env, y al correr con node plano no
  // existe. Se carga .env.local antes de importar nada de la aplicacion.
  const envTxt = fs.readFileSync('.env.local', 'utf8')
  for (const linea of envTxt.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim())
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  }

  const cfg = bd()
  const db = await mysql.createConnection(cfg)
  const nombres = ['JULIA ALAYO', 'EDUARDO CHISCUL', 'Yonny flores']
  const creados = []
  // Se declara fuera del try para que el finally pueda limpiar aunque algo falle
  // a mitad de la importación.
  let clienteId = null

  // Una ejecución anterior pudo dejar usuarios con estos nombres. Si hubiera dos
  // personas con el mismo nombre, el importador los marcaría como ambiguos (que
  // es lo correcto) y la prueba fallaría por un motivo que no es suyo. Se limpia
  // primero para empezar siempre desde el mismo punto.
  await db.query("DELETE FROM usuarios WHERE password_hash = 'NO_APLICA_EN_PRUEBAS'").catch(() => {})

  try {
    titulo('Preparacion: empresa, area y cliente de prueba')
    const [[emp]] = await db.query('SELECT id FROM empresa ORDER BY id LIMIT 1')
    const empresaId = emp.id
    const [[area]] = await db.query('SELECT id FROM areas WHERE empresa_id = ? ORDER BY id LIMIT 1', [empresaId])
    const areaId = area.id

    // Cliente dedicado a la prueba, para poder borrarlo sin tocar nada real.
    // Un INSERT devuelve un ResultSetHeader (objeto), no una lista de filas.
    const [insCliente] = await db.query(
      'INSERT INTO clientes (nombre, area_id, horas_contratadas) VALUES (?, ?, 0)',
      [`PRUEBA SANTA ROSA ${Date.now()}`, areaId]
    )
    clienteId = insCliente.insertId
    // Los tres del Excel, que en la base real NO existen.
    const marca = crypto.randomBytes(4).toString('hex')
    for (let i = 0; i < nombres.length; i += 1) {
      const n = nombres[i]
      // `usuarios.usuario` es único: cada persona necesita el suyo.
      const sufijo = `${marca}${i}`
      const [r] = await db.query(
        `INSERT INTO usuarios (nombre, usuario, correo, password_hash, rol, area_id, activo)
         VALUES (?,?,?,?,?,?,TRUE)`,
        [
          n,
          `prueba_${sufijo}`,
          `prueba_${sufijo}@example.test`,
          'NO_APLICA_EN_PRUEBAS',
          'PERSONAL',
          areaId,
        ]
      )
      creados.push(r.insertId)
    }
    console.log(`  cliente de prueba id=${clienteId}, 3 usuarios creados`)

    titulo('Primera importacion')
    const { analizarPresupuesto } = cargarTs('lib/presupuestos/importar-excel.ts')
    const { guardarAnalisis } = cargarTs('lib/presupuestos/guardar.ts')

    const archivo = fs.readFileSync('Presupuesto Colegio Santa Rosa (1).xlsx')
    const analisis = await analizarPresupuesto(archivo)

    const r1 = await guardarAnalisis({
      empresaId,
      clienteId,
      usuarioId: creados[0],
      nombreArchivo: 'Presupuesto Colegio Santa Rosa (1).xlsx',
      archivo,
      analisis,
    })
    console.log(`  id=${r1.presupuestoId} version=${r1.version} yaExistia=${r1.yaExistia}`)
    ok(r1.version === 1, 'la primera importacion crea la version 1')
    ok(r1.yaExistia === false, 'no existia previamente')
    ok(r1.serviciosDetallados === 6, `guarda 6 servicios no consolidados (${r1.serviciosDetallados})`, '5 detallados + 1 complementario')
    ok(r1.serviciosConsolidados === 2, `guarda 2 consolidados (${r1.serviciosConsolidados})`)

    titulo('Las horas se guardan sin duplicar el alcance')
    const [servicios] = await db.query(
      'SELECT origen, COUNT(*) n, SUM(horas) horas FROM presupuesto_servicios WHERE presupuesto_id = ? GROUP BY origen',
      [r1.presupuestoId]
    )
    const porOrigen = Object.fromEntries(servicios.map((s) => [s.origen, { n: s.n, horas: Number(s.horas) }]))
    console.log('  ' + JSON.stringify(porOrigen))
    ok(porOrigen.DETALLADO && porOrigen.DETALLADO.horas === 270, `los DETALLADO suman 270 h (${porOrigen.DETALLADO?.horas})`)
    ok(porOrigen.CONSOLIDADO && porOrigen.CONSOLIDADO.horas === 272, `los CONSOLIDADO suman 272 h y NO cuentan (${porOrigen.CONSOLIDADO?.horas})`)
    ok(porOrigen.COMPLEMENTARIO && porOrigen.COMPLEMENTARIO.horas === 2, `el COMPLEMENTARIO son 2 h (${porOrigen.COMPLEMENTARIO?.horas})`)

    titulo('Ninguna persona recibe horas de otra')
    const [asig] = await db.query(
      `SELECT a.nombre_texto, a.categoria, a.estado, a.usuario_id, a.motivo,
              u.nombre AS usuario_nombre
         FROM presupuesto_asignaciones a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         JOIN presupuesto_servicios s ON s.id = a.servicio_id
        WHERE s.presupuesto_id = ?`,
      [r1.presupuestoId]
    )
    const conUsuario = asig.filter((a) => a.usuario_id !== null)
    const sinUsuario = asig.filter((a) => a.usuario_id === null)
    console.log(`  ${conUsuario.length} con usuario, ${sinUsuario.length} pendientes`)
    ok(conUsuario.length > 0, 'las personas que SI existen quedan vinculadas')

    // Toda vinculacion debe ser exacta: el usuario debe llamarse como el Excel.
    const vinculacionesIncorrectas = conUsuario.filter((a) =>
      String(a.nombre_texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() !==
      String(a.usuario_nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    )
    ok(vinculacionesIncorrectas.length === 0, 'ninguna vinculacion se hace por parecido', JSON.stringify(vinculacionesIncorrectas))

    const pendientes = sinUsuario.filter((a) => a.estado === 'PENDIENTE_REVISION')
    ok(pendientes.length === sinUsuario.length, 'las que no se pueden atribuir quedan PENDIENTE_REVISION')
    const sinMotivo = pendientes.filter((a) => !a.motivo || a.motivo.length === 0)
    ok(
      sinMotivo.length === 0,
      'cada pendiente explica por que',
      sinMotivo.length ? JSON.stringify(sinMotivo.map((a) => ({ n: a.nombre_texto, cat: a.categoria, m: a.motivo }))) : ''
    )
    // Trainee y Junior no son personas: nunca deben quedar con usuario.
    const traineeVinculado = conUsuario.filter((a) => ['trainee', 'junior'].includes(String(a.nombre_texto).toLowerCase().trim()))
    ok(traineeVinculado.length === 0, 'Trainee y Junior NUNCA quedan con usuario asignado')

    titulo('Reimportar el mismo archivo no duplica')
    const r2 = await guardarAnalisis({
      empresaId, clienteId, usuarioId: creados[0],
      nombreArchivo: 'Presupuesto Colegio Santa Rosa (1).xlsx',
      archivo, analisis: await analizarPresupuesto(archivo),
    })
    ok(r2.yaExistia === true, 'la segunda importacion detecta que ya existia')
    ok(r2.version === 1, 'no crea una version nueva')
    ok(r2.presupuestoId === r1.presupuestoId, 'es el mismo presupuesto')

    const [[cuenta]] = await db.query('SELECT COUNT(*) n FROM presupuestos WHERE cliente_id = ?', [clienteId])
    ok(cuenta.n === 1, `sigue habiendo 1 presupuesto (hay ${cuenta.n})`)
    const [[servicios2]] = await db.query('SELECT COUNT(*) n FROM presupuesto_servicios WHERE presupuesto_id = ?', [r1.presupuestoId])
    ok(servicios2.n === 8, `siguen siendo 8 servicios, no 16 (hay ${servicios2.n})`, '5 detallados + 1 complementario + 2 consolidados')

    titulo('Un archivo distinto crea una version nueva')
    const otro = Buffer.concat([archivo, Buffer.from('\n')])
    const r3 = await guardarAnalisis({
      empresaId, clienteId, usuarioId: creados[0],
      nombreArchivo: 'otra version.xlsx', archivo: otro,
      analisis: await analizarPresupuesto(otro),
    })
    ok(r3.version === 2, `la version sube a 2 (${r3.version})`)
    ok(r3.presupuestoId !== r1.presupuestoId, 'es un presupuesto distinto')

    titulo('El documento original queda guardado para auditoria')
    const [[doc]] = await db.query('SELECT archivo_nombre, LENGTH(archivo_bytes) bytes FROM presupuestos WHERE id = ?', [r1.presupuestoId])
    ok(doc.bytes === archivo.length, `se guardan los ${archivo.length} bytes del Excel (${doc.bytes})`)

    titulo('El historial registra ambas importaciones')
    const [[cambios]] = await db.query(
      "SELECT COUNT(*) n FROM presupuesto_cambios WHERE presupuesto_id = ? AND tipo = 'IMPORTACION'",
      [r1.presupuestoId]
    )
    ok(cambios.n === 2, `quedan 2 entradas de importacion en el historial (${cambios.n})`)
  } finally {
    titulo('Limpieza')
    // El orden importa: presupuestos.cliente_id es ON DELETE RESTRICT, asi que
    // borrar el cliente antes dejaria los presupuestos colgando.
    if (clienteId !== null) {
      await db
        .query(
          `DELETE p FROM presupuestos p
             JOIN clientes c ON c.id = p.cliente_id
            WHERE c.nombre LIKE 'PRUEBA SANTA ROSA%'`
        )
        .catch(() => {})
      await db.query('DELETE FROM clientes WHERE nombre LIKE ?', ['PRUEBA SANTA ROSA%']).catch(() => {})
    }
    for (const id of creados) await db.query('DELETE FROM usuarios WHERE id = ?', [id]).catch(() => {})
    const [[restan]] = await db.query(
      'SELECT COUNT(*) n FROM presupuestos p JOIN clientes c ON c.id = p.cliente_id WHERE c.nombre LIKE ?',
      ['PRUEBA SANTA ROSA%']
    )
    ok(restan.n === 0, `no queda ningun presupuesto de prueba (${restan.n})`)
    const [[clientes]] = await db.query('SELECT COUNT(*) n FROM clientes WHERE nombre LIKE ?', ['PRUEBA SANTA ROSA%'])
    ok(clientes.n === 0, `no queda ningun cliente de prueba (${clientes.n})`)
    await db.end()
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Pasaron: ${pass}   Fallaron: ${fail}`)
  if (fallos.length) {
    console.log('\nFallos:')
    for (const f of fallos) console.log(`  - ${f}`)
  }
  console.log('='.repeat(60))
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
