// Prueba del reparto de horas sin dueño contra el presupuesto REAL.
//
// IMPORTANTE: ejecuta la acción de verdad y luego RESTAURA el estado anterior,
// para que el presupuesto 50 vuelva a quedar con sus 4 asignaciones pendientes.
// La razón es que la acción usa su propio pool y no admite transaction
// compartida: no hay forma de envolverla sin tocar el código de producción.
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

  const CLAVE = 'PruebaReparto123!'
  const correo = `reparto.${Date.now()}@paredescano.test`
  // El Líder real del proyecto 14, que es quien puede repartir.
  const [[lider]] = await pool.query("SELECT id FROM usuarios WHERE nombre = 'CHISCUL MOLINA EDUARDO EMILIO' LIMIT 1")
  const r = await pool.query(
    `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, activo)
     VALUES (?,?,?,?,'PERSONAL',3,TRUE)`,
    [`Lider temporal ${Date.now()}`, correo, correo, bcrypt.hashSync(CLAVE, 10)]
  )
  const usuarioId = r[0].insertId

  // Antes de tocar nada, se guarda el estado exacto de las asignaciones
  // pendientes del presupuesto 50 y de la auditoria. Se filtran los
  // consolidados igual que hace la API, para que los dos recountos cuadren.
  const [antes] = await pool.query(
    `SELECT a.id, a.usuario_id, a.estado, a.motivo FROM presupuesto_asignaciones a
       JOIN presupuesto_servicios s ON s.id = a.servicio_id
      WHERE s.presupuesto_id = 50 AND a.estado = 'PENDIENTE_REVISION'
        AND s.origen <> 'CONSOLIDADO'`
  )
  const [[maxCambio]] = await pool.query('SELECT COALESCE(MAX(id),0) m FROM presupuesto_cambios')
  console.log(`estado guardado: ${antes.length} pendientes, ultimo cambio #${maxCambio.m}`)

  try {
    // El temporal se registra como LIDER del proyecto, para que la validación
    // de permisos lo deje actuar igual que a Eduardo.
    await pool.query(
      `INSERT INTO proyecto_participantes (proyecto_id, usuario_id, rol_proyecto) VALUES (14,?, 'LIDER')
       ON DUPLICATE KEY UPDATE rol_proyecto = 'LIDER'`,
      [usuarioId]
    )
    await pool.query('UPDATE usuarios SET area_id = 3 WHERE id = ?', [usuarioId])

    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: correo, password: CLAVE }),
    })
    const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
    ok(login.ok && cookie.length > 0, 'sesion iniciada')
    // El objeto deHeaders se arma UNA vez y se pasa en init. Si se hace
    // `{ headers, ...opts }`, el opts.headers pisa al primero y se pierde la
    // cookie: por eso el POST salía con 401.
    const pedir = async (u, opts = {}) => {
      const res = await fetch(`${BASE}${u}`, {
        ...opts,
        headers: { Cookie: cookie, ...(opts.headers ?? {}) },
      })
      const t = await res.text()
      let j = null
      try { j = JSON.parse(t) } catch {}
      return { status: res.status, json: j, texto: t }
    }

    const g0 = await pedir('/api/proyectos/14/gestion')
    const pendientes0 = g0.json.sinResolver
    console.log(`\n  pendientes al empezar: ${pendientes0.length} (${pendientes0.reduce((t, a) => t + a.horas, 0)} h)`)
    ok(pendientes0.length === 4, 'el proyecto arranca con 4 asignaciones sin repartir')
    ok(g0.json.permisos.puedeGestionar === true, 'el Lider puede repartir')

    const objetivo = pendientes0[0]
    const candidato = g0.json.equipo.find((e) => e.nombre.toUpperCase().includes('JULIA'))
    console.log(`\n  repartiendo: ${objetivo.horas} h de "${objetivo.etiqueta ?? 'sin persona'}" -> ${candidato.nombre}`)

    const r1 = await pedir('/api/presupuestos/50/accion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'CONFIRMAR_ASIGNACION',
        asignacion_id: objetivo.id,
        usuario_id: candidato.usuarioId,
        justificacion: 'Prueba automatizada del reparto; se revierte al terminar.',
      }),
    })
    ok(r1.status === 200 && r1.json.ok, 'la acción de repartir responde OK', `${r1.status} ${r1.texto.slice(0, 140)}`)

    const g1 = await pedir('/api/proyectos/14/gestion')
    const pendientes1 = g1.json.sinResolver
    ok(pendientes1.length === 3, `bajan a 3 sin repartir (${pendientes1.length})`)
    ok(
      !pendientes1.some((a) => a.id === objetivo.id),
      'la fila repartida ya no aparece como pendiente'
    )
    const julia = g1.json.equipo.find((e) => e.nombre.toUpperCase().includes('JULIA'))
    ok(
      Math.abs((julia.propuesto - candidato.propuesto) - objetivo.horas) < 0.01,
      `las propuestas de ${julia.nombre} suben en ${objetivo.horas} h`,
      `antes ${candidato.propuesto} ahora ${julia.propuesto}`
    )

    // Un jefe de area que NO es el lider del proyecto no puede repartir.
    // Ojo: el liderazgo en este sistema lo define `proyecto_participantes`, no
    // el rol global del usuario. Hay que quitar la participación, porque con
    // ella puesta seguiría siendo líder pase lo que pase con su rol.
    const [[jefe]] = await pool.query(
      `SELECT id FROM usuarios WHERE rol='JEFE_AREA' AND area_id <> 3 AND activo=1 LIMIT 1`
    )
    if (jefe) {
      await pool.query('UPDATE usuarios SET rol = ?, area_id = ? WHERE id = ?', ['JEFE_AREA', 1, usuarioId])
      await pool.query('DELETE FROM proyecto_participantes WHERE usuario_id = ? AND proyecto_id = 14', [usuarioId])
      const r2 = await pedir('/api/presupuestos/50/accion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'CONFIRMAR_ASIGNACION',
          asignacion_id: pendientes1[0].id,
          usuario_id: candidato.usuarioId,
        }),
      })
      ok(r2.status === 400 && r2.json.ok === false, 'un jefe de area ajeno NO puede repartir', `${r2.status} ${r2.texto.slice(0, 160)}`)
      ok(
        /l[ií]der/i.test(r2.json?.error ?? ''),
        'el rechazo explica que hace falta ser el Líder',
        r2.json?.error
      )
    }
  } finally {
    // --- restauracion -------------------------------------------------------
    console.log('\n  restaurando el estado original...')
    for (const a of antes) {
      await pool.query(
        'UPDATE presupuesto_asignaciones SET usuario_id = ?, estado = ?, motivo = ? WHERE id = ?',
        [a.usuario_id, a.estado, a.motivo, a.id]
      )
    }
    await pool.query('DELETE FROM presupuesto_cambios WHERE id > ?', [maxCambio.m])
    await pool.query('DELETE FROM proyecto_participantes WHERE usuario_id = ? AND proyecto_id = 14', [usuarioId])
    await pool.query('DELETE FROM usuarios WHERE id = ?', [usuarioId])

    const [despues] = await pool.query(
      `SELECT a.id, a.usuario_id, a.estado, a.motivo FROM presupuesto_asignaciones a
         JOIN presupuesto_servicios s ON s.id = a.servicio_id
        WHERE s.presupuesto_id = 50 AND a.estado = 'PENDIENTE_REVISION'
          AND s.origen <> 'CONSOLIDADO'`
    )
    const iguales = JSON.stringify(antes) === JSON.stringify(despues)
    ok(iguales, `el presupuesto vuelve a sus ${antes.length} pendientes`, `${JSON.stringify(antes)} vs ${JSON.stringify(despues)}`)

    const [[cambios]] = await pool.query('SELECT COUNT(*) n FROM presupuesto_cambios WHERE id > ?', [maxCambio.m])
    ok(cambios.n === 0, 'no queda rastro de la prueba en la auditoría')
    await pool.end()
  }
  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1) })
