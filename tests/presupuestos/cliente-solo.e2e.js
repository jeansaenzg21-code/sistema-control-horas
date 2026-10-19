// Cliente por si mismo: sus bolsas vienen del Excel y su equipo son las
// personas que el Excel nombra. Nada de esto debe depender de un proyecto.
//
// El caso de referencia es BATERIAS ETNA: tiene presupuesto con 3 bolsas y NO
// tiene ningun proyecto. Antes esa ficha se caia a pedazos.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = new Map()
function cargarTs(rel) {
  const abs = path.resolve(rel)
  if (cache.has(abs)) return cache.get(abs)
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const Module = require('node:module')
  const mod = new Module(abs, null)
  mod.filename = abs
  mod.paths = Module._nodeModulePaths(path.dirname(abs))
  cache.set(abs, mod.exports)
  const req = mod.require.bind(mod)
  mod.require = (p) => (p.startsWith('@/') ? cargarTs(path.join(process.cwd(), p.slice(2) + '.ts')) : req(p))
  mod._compile(js, abs)
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

  const CLAVE = 'PruebaClienteSolo123!'
  const correo = `solo.${Date.now()}@paredescano.test`
  const [[empresa]] = await pool.query('SELECT id FROM empresa ORDER BY id LIMIT 1')
  const r = await pool.query(
    `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, activo)
     VALUES (?,?,?,?,'ADMINISTRACION',?,TRUE)`,
    [`Admin solo ${Date.now()}`, correo, correo, bcrypt.hashSync(CLAVE, 10), empresa.id]
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

    // Buscar un cliente con presupuesto y sin ningun proyecto.
    const [candidatos] = await pool.query(
      `SELECT c.id, c.nombre,
              (SELECT COUNT(*) FROM presupuestos p WHERE p.cliente_id = c.id) presupuestos,
              (SELECT COUNT(*) FROM proyectos pr WHERE pr.cliente_id = c.id AND pr.activo = TRUE) proyectos
         FROM clientes c WHERE c.activo = TRUE
        HAVING presupuestos > 0 AND proyectos = 0
        ORDER BY c.id`
    )
    console.log(`\n  clientes con presupuesto y SIN proyecto: ${candidatos.length}`)
    for (const c of candidatos) console.log(`    id=${c.id} "${c.nombre}" presupuestos=${c.presupuestos} proyectos=${c.proyectos}`)
    ok(candidatos.length > 0, 'hay al menos un cliente que demuestra el caso')

    for (const c of candidatos) {
      console.log(`\n  --- gestion del cliente ${c.id} "${c.nombre}" (sin proyecto) ---`)
      const g = await pedir(`/api/clientes/${c.id}/gestion`)
      ok(g.status === 200, 'la gestion del cliente responde 200', `${g.status} ${g.texto.slice(0, 140)}`)
      const d = g.json
      if (!d) continue

      ok(d.cliente?.id === c.id, 'devuelve el cliente correcto')
      ok(!('proyecto' in d), 'la respuesta NO trae un proyecto: la ficha no lo necesita')
      ok(Array.isArray(d.presupuestos) && d.presupuestos.length > 0, `trae ${d.presupuestos.length} presupuesto(s) del cliente`)
      ok(d.presupuestoVigente != null, 'indica cuál es el presupuesto vigente')

      console.log(`    bolsas=${d.servicios.length} equipo=${d.equipo.length} sinRepartir=${d.sinResolver.length} plan=${d.planificacion.length} candidatos=${d.candidatos.length}`)
      console.log(`    contratadas=${d.indicadores.horasContratadas} propuestas=${d.indicadores.horasPropuestas} desviacion=${d.indicadores.desviacionHoras}`)

      // Las cuatro pestañas necesitan estos cuatro bloques.
      ok(d.servicios.length > 0, 'pestaña Servicios: hay bolsas del Excel')
      ok(Array.isArray(d.equipo), 'pestaña Equipo: viene la lista (aunque esté vacía)')
      ok(Array.isArray(d.sinResolver), 'pestaña Equipo: viene lo que falta repartir')
      ok(Array.isArray(d.planificacion), 'pestaña Planificación: viene la lista')
      ok(Array.isArray(d.desviaciones), 'pestaña Desviaciones: viene la lista')
      ok(Array.isArray(d.candidatos) && d.candidatos.length > 0, `hay ${d.candidatos.length} personas del área para repartir`)

      // El equipo son personas reales, no participantes de proyecto.
      ok(
        d.equipo.every((e) => typeof e.nombre === 'string' && e.nombre.length > 0),
        'el equipo son nombres reales del Excel'
      )
      ok(
        d.equipo.every((e) => 'rol' in e),
        'cada persona trae el rol/categoría que le puso el Excel'
      )

      // Cada fila de la tabla de bolsas es una bolsa real del Excel, con sus
      // propias horas. Si dos filas comparten nombre (una por categoría) siguen
      // siendo dos bolsas y deben seguir viéndose: aquí NO se deduplica nada.
      // Lo que se deduplica son las etiquetas de la cartera, que no llevan id.
      const [[esperadas]] = await pool.query(
        `SELECT COUNT(*) n FROM presupuesto_servicios s
           JOIN presupuestos p ON p.id = s.presupuesto_id
          WHERE p.cliente_id = ?`,
        [c.id]
      )
      ok(
        d.servicios.length === Number(esperadas.n),
        `la tabla muestra las ${esperadas.n} bolsas del Excel, sin fusionar ni descartar`
      )
      const conRepetidos = d.servicios.filter((s, i, a) => a.findIndex((x) => x.nombre === s.nombre) !== i)
      if (conRepetidos.length > 0) {
        ok(
          new Set(d.servicios.map((s) => s.id)).size === d.servicios.length,
          `hay ${conRepetidos.length} bolsas con el mismo nombre y cada una conserva su fila y su id`
        )
      }

      // Sin bolsa activa no hay contrato ni saldo.
      if (d.indicadores.horasContratadas === 0) {
        ok(
          d.servicios.filter((s) => s.origen !== 'CONSOLIDADO').every((s) => s.saldo === null),
          'sin bolsa activa ninguna bolsa muestra saldo'
        )
        ok(
          d.equipo.every((e) => e.disponible === null),
          'sin bolsa activa nadie tiene horas disponibles'
        )
      }
      if (d.indicadores.horasRegistradas === 0) {
        ok(d.indicadores.desviacionHoras === null, 'sin horas registradas la desviación es nula, no negativa')
      }

      // Los candidatos son del área del cliente, para poder repartir.
      const [[areaUsuarios]] = await pool.query(
        `SELECT COUNT(*) n FROM usuarios WHERE activo = TRUE AND area_id = ?`,
        [d.cliente.areaId]
      )
      ok(
        d.candidatos.length === Number(areaUsuarios.n),
        `los candidatos son exactamente el personal del área (${d.candidatos.length} de ${areaUsuarios.n})`
      )
    }

    console.log('\n  el modulo de Proyectos ya no es accesible por pagina')
    const pagina = await pedir('/proyectos')
    ok(pagina.status === 404, '/proyectos devuelve 404', `status=${pagina.status}`)

    console.log('\n  la API de proyectos sigue viva (la usa el registro de horas)')
    const api = await pedir('/api/proyectos')
    ok(api.status === 200, '/api/proyectos responde 200', `status=${api.status}`)

    console.log('\n  la ficha del cliente responde por URL directa')
    const [conProyecto] = await pool.query('SELECT id FROM proyectos WHERE cliente_id = 40 LIMIT 1')
    if (conProyecto.length) {
      const ficha = await pedir(`/clientes/${conProyecto[0].id}`)
      ok(ficha.status === 200, '/clientes/:id responde 200', `status=${ficha.status}`)
    }
  } finally {
    await pool.query('DELETE FROM usuarios WHERE id = ?', [usuarioId])
    await pool.end()
  }
  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1) })
