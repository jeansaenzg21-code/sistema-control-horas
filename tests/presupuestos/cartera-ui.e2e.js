// Recorre la cartera como lo haria un usuario: entra, ve las cifras reales,
// abre la gestion integral de un cliente y comprueba que las cuatro pestañas
// tienen datos de verdad y nada de datos de ejemplo.
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

  const CLAVE = 'PruebaCarteraUI123!'
  const correo = `cartera.ui.${Date.now()}@paredescano.test`
  const [[area]] = await pool.query(
    `SELECT a.id FROM areas a JOIN clientes c ON c.area_id=a.id WHERE c.nombre='Colegio Santa Rosa' LIMIT 1`
  )
  const r = await pool.query(
    `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, activo)
     VALUES (?,?,?,?,'ADMINISTRACION',?,TRUE)`,
    ['Admin Cartera UI', correo, correo, bcrypt.hashSync(CLAVE, 10), area.id]
  )
  const usuarioId = r[0].insertId

  try {
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: correo, password: CLAVE }),
    })
    const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
    ok(login.ok && cookie.length > 0, 'sesion iniciada')

    const pedir = async (u) => {
      const res = await fetch(`${BASE}${u}`, { headers: { Cookie: cookie } })
      const t = await res.text()
      let j = null
      try { j = JSON.parse(t) } catch {}
      return { status: res.status, json: j, texto: t }
    }

    console.log('\nLa pantalla de clientes se monta con datos reales')
    const pagina = await pedir('/clientes')
    ok(pagina.status === 200, 'GET /clientes responde 200', `status=${pagina.status}`)
    // Lo que delata la maqueta: el banner y los textos de ejemplo.
    ok(!/VISTA DE DISEÑO/i.test(pagina.texto), 'ya no aparece el banner de vista de diseño')
    ok(!/son simulados/i.test(pagina.texto), 'ya no dice que los datos son simulados')
    ok(!/Abrir ejemplo Santa Rosa/i.test(pagina.texto), 'ya no ofrece abrir un cliente de ejemplo')
    ok(!/Volver al dise(?:ñ|n)o/i.test(pagina.texto), 'ya no existe el interruptor de diseño')

    const cartera = await pedir('/api/clientes/cartera')
    const c = cartera.json
    console.log(`\nLa cartera que ve el usuario (${c.clientes.length} clientes, ${c.alertas.length} alertas)`)
    console.log(`  totales: ${JSON.stringify(c.totales)}`)
    for (const x of c.clientes) {
      console.log(`  - ${x.nombre}: contratadas=${x.horasContratadas} consumidas=${x.horasConsumidas} proyectos=${x.proyectos} estado=${x.estado} servicios=${x.servicios.length}`)
    }
    ok(c.clientes.length > 0, 'hay clientes reales en la cartera')

    console.log('\nGestion integral del cliente que tiene proyecto')
    const conProyecto = c.clientes.find((x) => x.proyectos > 0)
    ok(conProyecto != null, 'hay un cliente con proyecto para abrir la gestion', JSON.stringify(c.clientes.map((x) => x.proyectos)))
    if (conProyecto) {
      const proyectos = await pedir(`/api/proyectos?cliente_id=${conProyecto.id}`)
      const lista = Array.isArray(proyectos.json) ? proyectos.json : (proyectos.json?.proyectos ?? [])
      ok(lista.length === conProyecto.proyectos, `el selector de proyectos devuelve ${conProyecto.proyectos} proyecto(s)`, `${lista.length}`)

      const g = await pedir(`/api/proyectos/${lista[0].id}/gestion`)
      const d = g.json
      console.log(`  equipo=${d.equipo.length} servicios=${d.servicios.length} planificacion=${d.planificacion.length} sinResolver=${d.sinResolver.length} desviaciones=${d.desviaciones.length}`)
      console.log(`  indicadores: contratadas=${d.indicadores.horasContratadas} propuestas=${d.indicadores.horasPropuestas} desviacion=${d.indicadores.desviacionHoras}`)

      ok(d.equipo.length > 0, 'la pestaña Equipo y bolsas tiene integrantes reales')
      ok(d.servicios.length > 0, 'la tabla de servicios tiene bolsas reales')
      ok(d.planificacion.length > 0, 'el Gantt tiene la planificación importada del Excel')
      ok(d.planificacion.every((f) => f.servicioId === null), 'ninguna sub-etapa se inventó como vinculada a un servicio')
      ok(d.indicadores.cronogramaConFechas === false, 'el cronograma avisa que no hay fecha confirmada')
      ok(d.indicadores.horasContratadas === 0, 'no hay bolsa activa, asi que contratadas = 0')
      ok(d.equipo.every((e) => e.disponible === null), 'nadie tiene saldo disponible sin bolsa activa')
      ok(d.sinResolver.length > 0, 'las asignaciones sin resolver se muestran, no se reparten solas')
    }

    console.log('\nAislamiento del jefe de area')
    const [[otroArea]] = await pool.query('SELECT id FROM areas WHERE id <> ? LIMIT 1', [area.id])
    await pool.query('UPDATE usuarios SET rol = ? WHERE id = ?', ['JEFE_AREA', usuarioId])
    const areaAjena = await pedir('/api/clientes/cartera')
    const propia = areaAjena.json.clientes ?? []
    const fugas = propia.filter((x) => x.area_id !== area.id)
    ok(fugas.length === 0, `un jefe de area solo ve su cartera (${propia.length} clientes, 0 fugas)`, JSON.stringify(fugas.map((f) => f.nombre)))
  } finally {
    await pool.query('DELETE FROM usuarios WHERE id = ?', [usuarioId])
    await pool.end()
  }
  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1) })
