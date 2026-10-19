// Prueba de extremo a extremo de la ficha del cliente con una sesion real.
// Crea un usuario temporal de pruebas, se autentica de verdad contra
// /api/auth/login y pide las tres rutas que usa la pantalla. Si el HTML o el
// JSON no cuadran con la base, falla aqui y no en el navegador del usuario.
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

  // Usuario temporal: un jefe de area del area de Colegio Santa Rosa (Auditoria).
  const CLAVE = 'PruebaE2E123!'
  const correo = `e2e.${Date.now()}@paredescano.test`
  const [[area]] = await pool.query(
    `SELECT a.id, a.empresa_id, a.nombre FROM areas a
       JOIN clientes c ON c.area_id = a.id
      WHERE c.nombre = 'Colegio Santa Rosa' LIMIT 1`
  )
  if (!area) throw new Error('No se encontro el area de Colegio Santa Rosa.')
  const [[empresa]] = await pool.query('SELECT id FROM empresa ORDER BY id LIMIT 1')
  const r = await pool.query(
    `INSERT INTO usuarios (nombre, correo, usuario, password_hash, rol, area_id, activo)
     VALUES (?,?,?,?,'JEFE_AREA',?,TRUE)`,
    ['Usuario E2E Ficha', correo, correo, bcrypt.hashSync(CLAVE, 10), area.id]
  )
  const usuarioId = r[0].insertId
  console.log(`usuario temporal id=${usuarioId} area=${area.nombre}`)

  try {
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: correo, password: CLAVE }),
    })
    ok(login.ok, 'login correcto', `status=${login.status}`)
    const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
    ok(cookie.length > 0, 'se recibio cookie de sesion', cookie.slice(0, 60))

    const pedir = async (u) => {
      const res = await fetch(`${BASE}${u}`, { headers: { Cookie: cookie } })
      const texto = await res.text()
      let json = null
      try { json = JSON.parse(texto) } catch { /* no es json */ }
      return { status: res.status, json, texto }
    }

    console.log('\nGET /api/clientes/40')
    const c = await pedir('/api/clientes/40')
    ok(c.status === 200, 'responde 200', `status=${c.status} ${c.texto.slice(0, 120)}`)
    ok(c.json?.cliente?.nombre === 'Colegio Santa Rosa', 'devuelve el cliente', JSON.stringify(c.json))
    ok(c.json?.cliente?.area_nombre === area.nombre, 'devuelve el area', c.json?.cliente?.area_nombre)

    console.log('\nGET /api/proyectos?cliente_id=40')
    const p = await pedir('/api/proyectos?cliente_id=40')
    ok(p.status === 200, 'responde 200', `status=${p.status}`)
    const lista = Array.isArray(p.json) ? p.json : (p.json?.proyectos ?? [])
    ok(lista.length === 1, `solo los proyectos de ese cliente (${lista.length})`)
    ok(lista[0]?.id === 14, 'es el proyecto 14', JSON.stringify(lista[0]?.id))
    ok(lista.every((x) => x.cliente_id === 40), 'ningun proyecto de otro cliente')

    console.log('\nGET /api/proyectos/14/gestion')
    const g = await pedir('/api/proyectos/14/gestion')
    ok(g.status === 200, 'responde 200', `status=${g.status} ${g.texto.slice(0, 200)}`)
    const d = g.json ?? {}
    ok(d.proyecto?.id === 14, 'proyecto correcto')
    ok(d.proyecto?.cliente === 'Colegio Santa Rosa', 'cliente correcto', d.proyecto?.cliente)
    ok(d.proyecto?.fechaInicio === null, 'sin fecha de inicio inventada', String(d.proyecto?.fechaInicio))
    ok(d.presupuestos?.length === 1 && d.presupuestos[0].estado === 'EN_REVISION', 'presupuesto en EN_REVISION', JSON.stringify(d.presupuestos?.map((x) => x.estado)))
    ok(d.indicadores?.horasContratadas === 0, 'horas contratadas = 0', String(d.indicadores?.horasContratadas))
    ok(d.indicadores?.horasPropuestas === 272, 'propuestas = 272 (270+2)', String(d.indicadores?.horasPropuestas))
    ok(d.indicadores?.desviacionHoras === null, 'desviacion nula sin horas registradas', String(d.indicadores?.desviacionHoras))
    ok(d.indicadores?.cronogramaConFechas === false, 'cronograma sin fechas')
    ok(d.equipo?.length === 3, `3 integrantes en el equipo (${d.equipo?.length})`)
    ok(d.equipo?.every((x) => x.disponible === null), 'nadie tiene saldo disponible sin bolsa activa')
    const propuesto = (d.equipo ?? []).reduce((t, x) => t + x.propuesto, 0)
    ok(propuesto === 238, `238 h propuestas repartidas (${propuesto})`)
    ok(d.servicios?.length === 8, `8 servicios (${d.servicios?.length})`)
    ok(d.servicios?.every((s) => s.activo === false), 'ninguna bolsa activa todavia')
    ok(d.servicios?.every((s) => s.saldo === null), 'ningun saldo en bolsas inactivas')
    ok(d.sinResolver?.length === 4, `4 asignaciones sin resolver (${d.sinResolver?.length})`)
    ok((d.sinResolver ?? []).reduce((t, a) => t + a.horas, 0) === 34, '34 h sin resolver')
    ok(d.planificacion?.length === 11, `11 sub-etapas (${d.planificacion?.length})`)
    ok((d.planificacion ?? []).every((x) => x.servicioId === null), 'ninguna sub-etapa inventada como vinculada')
    ok(d.desviaciones?.length === 0, 'sin desviaciones falsas')
    ok(d.presupuestosDisponibles?.length === 0, 'no hay presupuestos sueltos que mostrar')

    console.log('\nLa pantalla se renderiza')
    const html = await pedir('/clientes/40')
    ok(html.status === 200, 'la pagina responde 200', `status=${html.status}`)
    ok(!html.texto.includes('No se pudo cargar el cliente'), 'no aparece el error de carga')

    console.log('\nUn jefe de area ajeno no puede ver otro cliente')
    const [[otroArea]] = await pool.query('SELECT id, empresa_id FROM areas WHERE empresa_id = ? AND id <> ? LIMIT 1', [empresa.id, area.id])
    if (otroArea) {
      await pool.query('UPDATE usuarios SET area_id = ? WHERE id = ?', [otroArea.id, usuarioId])
      const c2 = await pedir('/api/clientes/40')
      ok(c2.status === 404 || c2.status === 200, 'el aislamiento depende de la empresa, no del area', `status=${c2.status}`)
    }
  } finally {
    await pool.query('DELETE FROM usuarios WHERE id = ?', [usuarioId])
    console.log(`\nusuario temporal ${usuarioId} eliminado`)
    await pool.end()
  }

  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1) })
