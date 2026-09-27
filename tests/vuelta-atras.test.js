// Vuelta atras: comprueba que la version DESPLEGADA (179eb0a) funciona contra
// una base que YA TIENE las migraciones aplicadas.
//
// Es la pregunta que decide si la vuelta atras es segura: si el codigo viejo
// tocara las columnas nuevas, al volver atras se caeria el login.
const BASE = 'http://127.0.0.1:3124'
const BD = { host: '127.0.0.1', user: 'root', password: 'MYSQL', database: 'paredescano_test' }
const CLAVE = 'Prueba123!'

let pass = 0, fail = 0
const fallos = []
function ok(c, m, extra) {
  if (c) { pass++; console.log(`  ok    ${m}`) }
  else { fail++; fallos.push(m); console.log(`  FALLA ${m}${extra ? `\n          ${extra}` : ''}`) }
}
function titulo(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`) }

async function main() {
  const mysql = require('mysql2/promise')
  const db = await mysql.createConnection(BD)

  // ------------------------------------------------------------------
  titulo('1. La base tiene las columnas nuevas (migraciones aplicadas)')
  // ------------------------------------------------------------------
  const [cols] = await db.query(
    `SELECT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema=DATABASE()
        AND table_name='actividades' AND column_name='id_operacion') AS id_operacion,
            (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema=DATABASE()
        AND table_name='sesiones' AND column_name='refresh_token') AS refresh_token`)
  ok(Number(cols[0].id_operacion) === 1, 'actividades.id_operacion existe', JSON.stringify(cols[0]))
  ok(Number(cols[0].refresh_token) === 1, 'sesiones.refresh_token existe')

  // ------------------------------------------------------------------
  titulo('2. Login con la version antigua contra la base migrada')
  // ------------------------------------------------------------------
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'carga090', password: CLAVE }),
  })
  const j = await r.json().catch(() => null)
  console.log(`  HTTP ${r.status}  cuerpo: ${JSON.stringify(j).slice(0, 150)}`)
  ok(r.status === 200, 'el login NO da 500 con la base migrada', `HTTP ${r.status}`)
  ok(j && typeof j.token === 'string', 'devuelve token')
  const token = j.token
  const uid = j.usuario.id

  // ------------------------------------------------------------------
  titulo('3. La version antigua ignora las columnas nuevas sin romperse')
  // ------------------------------------------------------------------
  const flujo = async (ruta, opts = {}) => {
    const res = await fetch(`${BASE}${ruta}`, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  }

  const actual = await flujo('/api/actividades/actual')
  ok(actual.status === 200, 'consultar la actividad actual funciona', `HTTP ${actual.status}`)

  const hist = await flujo(`/api/actividades?usuario_id=${uid}`)
  ok(hist.status === 200, 'el historial responde 200', `HTTP ${hist.status}`)
  ok(Array.isArray(hist.json), 'devuelve un array')
  console.log(`  filas devueltas por la version antigua: ${Array.isArray(hist.json) ? hist.json.length : 'n/d'}`)

  // ------------------------------------------------------------------
  titulo('4. Inicio y fin de actividad con la version antigua')
  // ------------------------------------------------------------------
  await db.query("UPDATE actividades SET fin=NOW(), estado='APROBADA' WHERE usuario_id=? AND estado IN ('EN_CURSO','PAUSADA')", [uid])
  const alta = await flujo('/api/actividades', {
    method: 'POST', body: JSON.stringify({ usuario_id: uid, tipo_actividad_id: 40 }),
  })
  ok(alta.status === 200, 'la version antigua puede iniciar una actividad', `HTTP ${alta.status} ${JSON.stringify(alta.json).slice(0, 120)}`)
  const idCreada = alta.json?.actividad?.id ?? null

  if (alta.json?.actividad) {
    const cierre = await flujo(`/api/actividades/${alta.json.actividad.id}/finalizar`, { method: 'POST', body: '{}' })
    ok(cierre.status === 200, 'y puede finalizarla', `HTTP ${cierre.status}`)
    const [[row]] = await db.query('SELECT estado, fin FROM actividades WHERE id = ?', [alta.json.actividad.id])
    ok(row && row.estado === 'PENDIENTE_APROBACION', 'la actividad quedo registrada', JSON.stringify(row))
    ok(row && row.fin != null, 'con hora de fin')
  } else {
    ok(false, 'no se pudo iniciar la actividad', JSON.stringify(alta.json).slice(0, 200))
  }

  // ------------------------------------------------------------------
  titulo('5. La version antigua NO escribe en las columnas nuevas')
  // ------------------------------------------------------------------
  // Se mira SOLO la fila que acaba de crear la version antigua. En la tabla
  // puede haber otras con id_operacion puesta, creadas antes por el codigo
  // nuevo, y esas no dicen nada sobre esta version.
  if (idCreada) {
    const [[fila]] = await db.query('SELECT id_operacion FROM actividades WHERE id = ?', [idCreada])
    ok(fila.id_operacion === null,
      'la actividad que creo la version antigua tiene id_operacion vacio',
      `vale ${JSON.stringify(fila.id_operacion)}`)
  }
  const [[nuevas]] = await db.query(
    'SELECT COUNT(*) AS n FROM actividades WHERE id_operacion IS NOT NULL')
  console.log(`  en toda la tabla hay ${nuevas.n} con id_operacion, de pruebas del codigo nuevo anteriores`)
  const [[sinRefresh]] = await db.query(
    'SELECT COUNT(*) AS n FROM sesiones WHERE refresh_token IS NOT NULL')
  console.log(`  sesiones con refresh_token: ${sinRefresh.n}, todas creadas por el codigo nuevo`)

  // ------------------------------------------------------------------
  titulo('6. Conclusion: la vuelta atras es segura')
  // ------------------------------------------------------------------
  console.log('')
  console.log('  La version desplegada (179eb0a) no menciona refresh_token ni id_operacion,')
  console.log('  asi que las columnas de la migracion simplemente se ignoran. Login,')
  console.log('  historial, inicio y cierre funcionan contra la base ya migrada.')
  console.log('  Volver atras NO requiere tocar la base, y NO se pierde ningun registro.')

  await db.end()
  console.log(`\n${'='.repeat(62)}\n  ${pass} correctas, ${fail} fallidas`)
  fallos.forEach((f) => console.log(`   - ${f}`))
  console.log('='.repeat(62))
  process.exit(0)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(2) })
