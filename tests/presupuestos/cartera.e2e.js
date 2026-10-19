// Prueba de la cartera con sesion real: confirma que /api/clientes/cartera no
// choca con /api/clientes/[id] y que las cifras cuadran con la base.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = new Map()
function cargarTs(relativa) {
  const absoluta = path.resolve(relativa)
  if (cache.has(absoluta)) return cache.get(absoluta)
  const js = ts.transpileModule(fs.readFileSync(absoluta, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const Module = require('node:module')
  const mod = new Module(absoluta, null)
  mod.filename = absoluta
  mod.paths = Module._nodeModulePaths(path.dirname(absoluta))
  cache.set(absoluta, mod.exports)
  const req = mod.require.bind(mod)
  mod.require = (p) => (p.startsWith('@/') ? cargarTs(path.join(process.cwd(), p.slice(2) + '.ts')) : req(p))
  mod._compile(js, absoluta)
  return mod.exports
}

let fallos = 0
function ok(cond, texto, extra) {
  console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${texto}`)
  if (!cond) { fallos += 1; if (extra !== undefined) console.log(`        ${extra}`) }
}

const BASE = process.env.BASE ?? 'http://localhost:3000'

async function main() {
  const envTxt = fs.readFileSync('.env.local', 'utf8')
  for (const l of envTxt.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  }
  const bcrypt = require('bcryptjs')
  const { default: pool } = cargarTs('lib/db.ts')

  const CLAVE = 'PruebaCartera123!'
  const correo = `cartera.${Date.now()}@paredescano.test`
  const [[empresa]] = await pool.query('SELECT id FROM empresa ORDER BY id LIMIT 1')
  const r = await pool.query(
    `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, activo)
     VALUES (?,?,?,?,'ADMINISTRACION',1,TRUE)`,
    ['Admin Cartera', correo, correo, bcrypt.hashSync(CLAVE, 10)]
  )
  const usuarioId = r[0].insertId

  try {
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: correo, password: CLAVE }),
    })
    ok(login.ok, 'login correcto', `status=${login.status}`)
    const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')

    // Choque de rutas: cartera es estatico, [id] es dinamico. El estatico gana.
    const cartera = await fetch(`${BASE}/api/clientes/cartera`, { headers: { Cookie: cookie } })
    const cuerpo = await cartera.json()
    ok(cartera.status === 200, 'GET /api/clientes/cartera responde 200', `status=${cartera.status} ${JSON.stringify(cuerpo).slice(0, 160)}`)
    ok(Array.isArray(cuerpo.clientes), 'devuelve el arreglo de clientes')
    ok(cuerpo.totales != null, 'devuelve los totales')
    ok(Array.isArray(cuerpo.alertas), 'devuelve las alertas')

    const ficha = await fetch(`${BASE}/api/clientes/40`, { headers: { Cookie: cookie } })
    ok(ficha.status === 200, 'GET /api/clientes/40 sigue funcionando (sin colision)', `status=${ficha.status} ${await ficha.text()}`)

    console.log(`\n  cartera con ${cuerpo.clientes.length} clientes, ${cuerpo.alertas.length} alertas`)
    console.log(`  totales: ${JSON.stringify(cuerpo.totales)}`)

    // Cuadrar con la base, cliente por cliente. Lo que se compara es la suma de
    // bolsas ACTIVAS, que es la fuente de verdad. El campo desnormalizado se
    // compara aparte para avisar de la deriva.
    console.log('\n  cuadrado contra la base (bolsas activas = fuente de verdad):')
    const derivas = []
    for (const c of cuerpo.clientes) {
      const [[real]] = await pool.query(
        `SELECT c.horas_contratadas,
                (SELECT COUNT(*) FROM proyectos p WHERE p.cliente_id=c.id AND p.activo=TRUE) proyectos,
                (SELECT COALESCE(SUM(s.horas),0) FROM presupuesto_servicios s
                   JOIN presupuestos p2 ON p2.id=s.presupuesto_id
                  WHERE p2.cliente_id=c.id AND s.activo=TRUE AND s.origen<>'CONSOLIDADO') bolsas_activas
           FROM clientes c WHERE c.id = ?`,
        [c.id]
      )
      const activas = Math.round(Number(real.bolsas_activas) * 100) / 100
      const campo = Math.round(Number(real.horas_contratadas) * 100) / 100
      ok(
        activas === c.horasContratadas && Number(real.proyectos) === c.proyectos,
        `cliente ${c.id} "${c.nombre}"`,
        `contratadas=${c.horasContratadas} vs bolsas ${activas}, proyectos=${c.proyectos} vs ${real.proyectos}, estado=${c.estado}, servicios=${c.servicios.length}`
      )
      if (campo !== c.horasContratadas) {
        derivas.push(`cliente ${c.id} "${c.nombre}": columna horas_contratadas=${campo} pero bolsas activas=${c.horasContratadas}`)
      }
    }

    if (derivas.length) {
      console.log('\n  AVISO de deriva en clientes.horas_contratadas (la pantalla usa las bolsas activas):')
      for (const d of derivas) console.log(`    - ${d}`)
    } else {
      console.log('\n  sin deriva: la columna coincide con las bolsas activas en todos los clientes')
    }

    // Reglas de negocio que no deben romperse.
    const conContrato = cuerpo.clientes.filter((c) => c.horasContratadas > 0)
    console.log(`\n  clientes con horas contratadas: ${conContrato.length}`)
    for (const c of conContrato) {
      if (c.estado === 'PENDIENTE') {
        console.log(`  nota: cliente ${c.id} tiene ${c.horasContratadas} h contratadas y estado PENDIENTE (presupuesto sin aprobar)`)
      }
    }
    const suma = cuerpo.clientes.reduce((t, c) => t + c.horasConsumidas, 0)
    ok(Math.abs(suma - cuerpo.totales.consumidas) < 0.01, 'las consumidas de la cartera cuadran con el total', `${suma} vs ${cuerpo.totales.consumidas}`)

    // Un presupuesto puede declarar el MISMO servicio en varias filas, una por
    // categoría (BATERIAS ETNA tiene tres de "FORTALECIMIENTO DEL CONTROL
    // INTERNO"). La tabla los pinta como etiquetas, así que devolver el nombre
    // repetido producía tres etiquetas iguales y, en React, claves duplicadas.
    console.log('\n  nombres de servicio sin repetir:')
    let conRepetidos = 0
    for (const cli of cuerpo.clientes) {
      const unicos = new Set(cli.servicios)
      if (unicos.size !== cli.servicios.length) {
        conRepetidos++
        console.log(`    FALLA ${cli.nombre}: ${unicos.size} unicos de ${cli.servicios.length}`)
      }
      if (cli.serviciosConteo < cli.servicios.length) {
        conRepetidos++
        console.log(`    FALLA ${cli.nombre}: serviciosConteo (${cli.serviciosConteo}) menor que la lista (${cli.servicios.length})`)
      }
    }
    ok(conRepetidos === 0, `ningun cliente trae nombres repetidos (${conRepetidos} problemas)`)
    const etna = cuerpo.clientes.find((x) => x.nombre.includes('BATERIAS'))
    if (etna) {
      ok(
        etna.serviciosConteo > etna.servicios.length,
        `BATERIAS ETNA declara ${etna.serviciosConteo} bolsas y las muestra como ${etna.servicios.length} etiqueta(s) distinta(s)`
      )
    }

    // El grafico de distribucion tiene que poder REPRESENTAR a los clientes
    // importados. Con cero horas contratadas en toda la cartera, la metrica de
    // proyectos dejaba fuera a casi todos y el anillo se reducia a uno solo.
    // Por eso la cartera expone tambien las horas propuestas.
    console.log('\n  metricas del grafico por cliente:')
    const conContratadas = cuerpo.clientes.filter((c) => c.horasContratadas > 0).length
    const conPropuestas = cuerpo.clientes.filter((c) => c.horasPropuestas > 0).length
    const conServicios = cuerpo.clientes.filter((c) => c.serviciosConteo > 0).length
    const conProyectos = cuerpo.clientes.filter((c) => c.proyectos > 0).length
    for (const cli of cuerpo.clientes) {
      console.log(`    ${cli.nombre.padEnd(46)} contratadas=${String(cli.horasContratadas).padStart(7)} propuestas=${String(cli.horasPropuestas).padStart(8)} servicios=${cli.serviciosConteo} proyectos=${cli.proyectos}`)
    }
    console.log(`    con valor -> contratadas=${conContratadas} propuestas=${conPropuestas} servicios=${conServicios} proyectos=${conProyectos} de ${cuerpo.clientes.length}`)
    ok(
      typeof cuerpo.clientes[0]?.horasPropuestas === 'number',
      'la cartera expone horasPropuestas para el grafico'
    )
    ok(conPropuestas > conProyectos, 'las propuestas alcanzan a mas clientes que los proyectos')
    // La metrica que elijó "automatico" es la primera que da valor a la mayoría.
    const candidatas = [conContratadas, conPropuestas, conServicios, conProyectos]
    const primeraConMayoria = candidatas.findIndex((n) => n * 2 >= cuerpo.clientes.length)
    ok(primeraConMayoria >= 0, 'hay al menos una metrica que representa a la mayoría de la cartera')

    // Colegio Santa Rosa es el caso conocido.
    const sr = cuerpo.clientes.find((c) => c.id === 40)
    if (sr) {
      console.log(`\n  Colegio Santa Rosa: contratadas=${sr.horasContratadas} consumidas=${sr.horasConsumidas} proyectos=${sr.proyectos} estado=${sr.estado} servicios=${sr.servicios.length}`)
      ok(sr.horasContratadas === 0, 'sin bolsa activa, las contratadas son 0 (no se inventa contrato)')
      ok(sr.estado === 'PENDIENTE', 'estado PENDIENTE porque el presupuesto no esta aprobado', sr.estado)
      ok(sr.servicios.length === 5, `5 servicios detallados listados (${sr.servicios.length})`)
    }
  } finally {
    await pool.query('DELETE FROM usuarios WHERE id = ?', [usuarioId])
    await pool.end()
  }
  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1) })
