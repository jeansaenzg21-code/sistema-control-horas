// Verificacion de paginacion: demuestra si algun calculo del cliente usa solo las
// primeras 200 actividades. Compara el total que ve la interfaz contra el total
// real calculado directamente en SQL.
const mysql = require('mysql2/promise')

const BASE = 'http://127.0.0.1:3123'
const BD = { host: '127.0.0.1', user: 'root', password: 'MYSQL', database: 'paredescano_test' }
const CLAVE = 'Prueba123!'
const LIMITE_POR_DEFECTO = 200

let pass = 0, fail = 0
const fallos = []
function ok(c, m, extra) {
  if (c) { pass++; console.log(`  ok    ${m}`) }
  else { fail++; fallos.push(m); console.log(`  FALLA ${m}${extra ? `\n          ${extra}` : ''}`) }
}
function fechaSql(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v.slice(0, 10)
  return v.toISOString().slice(0, 10)
}
function titulo(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`) }

async function main() {
  const db = await mysql.createConnection(BD)
  const login = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'carga001', password: CLAVE }),
  })).json()
  const h = { Authorization: `Bearer ${login.token}` }
  const uid = login.usuario.id

  // ------------------------------------------------------------------
  titulo('1. Cuantas actividades tiene realmente un usuario PERSONAL')
  // ------------------------------------------------------------------
  const [[{ totalReal: real }]] = await db.query('SELECT COUNT(*) AS totalReal FROM actividades WHERE usuario_id = ?', [uid])
  console.log(`  el usuario carga001 tiene ${real} actividades en la base`)
  console.log(`  la API por defecto devuelve ${LIMITE_POR_DEFECTO}`)
  ok(real > LIMITE_POR_DEFECTO, 'el caso es real: el usuario tiene MAS de 200', `${real} <= 200`)

  // ------------------------------------------------------------------
  titulo('2. Lo que la interfaz recibe por defecto (paginado)')
  // ------------------------------------------------------------------
  const r1 = await fetch(`${BASE}/api/actividades?usuario_id=${uid}`, { headers: h })
  const pagina = await r1.json()
  console.log(`  filas en la primera pagina: ${pagina.length}`)
  ok(pagina.length === LIMITE_POR_DEFECTO, 'la pagina trae 200 filas', `${pagina.length}`)
  ok(r1.headers.get('X-Total') === null, 'en la primera pagina NO se calcula X-Total (ahorra el COUNT)')

  // ------------------------------------------------------------------
  titulo('3. Consecuencia: el total que ve consolidacion/reportes/billing')
  // ------------------------------------------------------------------
  // Así es como calculan las pantallas: filtran el array que les da el contexto.
  const totalApi = pagina.length
  const horasApi = pagina.reduce(
    (s, a) => s + (a.fin ? (new Date(a.fin) - new Date(a.inicio)) / 3600000 : 0), 0
  )
  const [[{ totalSql, horasSql }]] = await db.query(
    `SELECT COUNT(*) AS totalSql,
            COALESCE(SUM(TIMESTAMPDIFF(SECOND, inicio, fin)), 0) / 3600 AS horasSql
       FROM actividades WHERE usuario_id = ?`, [uid]
  )
  console.log(`  lo que ve la interfaz: ${totalApi} registros, ${horasApi.toFixed(2)} h`)
  console.log(`  lo real en la base:    ${totalSql} registros, ${Number(horasSql).toFixed(2)} h`)
  const pierde = totalSql - totalApi
  console.log(`  >> la interfaz esta omitiendo ${pierde} registros y ${(Number(horasSql) - horasApi).toFixed(2)} h`)
  ok(pierde > 0, 'CONFIRMADO: con el limite por defecto los totales salen mal', `pierde ${pierde}`)
  console.log('  (este fallo es real y hay que corregirlo)')

  // ------------------------------------------------------------------
  titulo('4. Con el rango de fechas explicito, el total cuadra')
  // ------------------------------------------------------------------
  // El rango se calcula con DATE() en MySQL y se lee como texto. Si se
  // convierten las fechas en JavaScript, la conversion a UTC arrastra el dia al
  // siguiente y se queda fuera un registro que si pertenece al rango.
  const [[{ min, max }]] = await db.query(
    'SELECT DATE(MIN(inicio)) AS min, DATE(MAX(inicio)) AS max FROM actividades WHERE usuario_id = ?', [uid]
  )
  const desde = fechaSql(min)
  const hasta = fechaSql(max)
  const r2 = await fetch(`${BASE}/api/actividades?usuario_id=${uid}&desde=${desde}&hasta=${hasta}&todo=1`, { headers: h })
  const completo = await r2.json()
  const horasCompleto = completo.reduce(
    (s, a) => s + (a.fin ? (new Date(a.fin) - new Date(a.inicio)) / 3600000 : 0), 0
  )
  console.log(`  con todo=1 y rango ${desde}..${hasta}: ${completo.length} filas, ${horasCompleto.toFixed(2)} h`)
  ok(completo.length === totalSql, 'el rango + todo=1 devuelve el total exacto', `${completo.length} vs ${totalSql}`)
  ok(Math.abs(horasCompleto - Number(horasSql)) < 0.05, 'las horas coinciden con SQL', `${horasCompleto.toFixed(2)} vs ${Number(horasSql).toFixed(2)}`)

  // ------------------------------------------------------------------
  titulo('5. Orden estable entre paginas (varias con la misma fecha/hora)')
  // ------------------------------------------------------------------
  // Si el ORDER BY no desempata por id, dos actividades con el mismo instante
  // pueden aparecer en paginas distintas en dos lecturas y duplicarse o perderse.
  const [[{ mismos }]] = await db.query(
    'SELECT COUNT(*) AS mismos FROM (SELECT inicio FROM actividades WHERE usuario_id = ? GROUP BY inicio HAVING COUNT(*) > 1) x', [uid]
  )
  console.log(`  el usuario tiene ${mismos} instantes compartidos por mas de una actividad`)

  const primera = await (await fetch(`${BASE}/api/actividades?usuario_id=${uid}&limite=50&offset=0`, { headers: h })).json()
  const repetida = await (await fetch(`${BASE}/api/actividades?usuario_id=${uid}&limite=50&offset=0`, { headers: h })).json()
  const iguales = JSON.stringify(primera.map((a) => a.id)) === JSON.stringify(repetida.map((a) => a.id))
  ok(iguales, 'dos lecturas de la misma pagina devuelven el mismo orden', 'el orden no es estable')

  // Recorrer paginas y comprobar que no se repite ni se pierde ninguna.
  const vistos = new Set()
  let repetidas = 0
  for (let off = 0; off < totalSql; off += 200) {
    const p = await (await fetch(`${BASE}/api/actividades?usuario_id=${uid}&limite=200&offset=${off}`, { headers: h })).json()
    if (p.length === 0) break
    for (const a of p) { if (vistos.has(a.id)) repetidas++; vistos.add(a.id) }
  }
  console.log(`  recorriendo paginas: ${vistos.size} ids unicos, ${repetidas} repetidos`)
  ok(repetidas === 0, 'al paginar no se repite ninguna actividad', `${repetidas} repetidas`)
  ok(vistos.size === totalSql, 'al paginar no se pierde ninguna actividad', `${vistos.size} vs ${totalSql}`)

  // ------------------------------------------------------------------
  titulo('6. El orden es determinista (ORDER BY incluye el id)')
  // ------------------------------------------------------------------
  // Se compara por fecha real y, a igualdad de fecha, por id descendente. Un
  // ORDER BY sin desempate por id no seria estable entre paginas y una fila
  // podria aparecer dos veces o no aparecer.
  let desordenado = false
  for (let i = 1; i < primera.length; i++) {
    const a = primera[i - 1]
    const b = primera[i]
    const fa = new Date(a.inicio).getTime()
    const fb = new Date(b.inicio).getTime()
    if (fa < fb) { desordenado = true; break }
    if (fa === fb && a.id < b.id) { desordenado = true; break }
  }
  ok(!desordenado, 'orden correcto: inicio descendente y, a igualdad, id descendente')

  await db.end()
  console.log(`\n${'='.repeat(62)}`)
  console.log(`  ${pass} correctas, ${fail} fallidas`)
  fallos.forEach((f) => console.log(`   - ${f}`))
  console.log('='.repeat(62))
  process.exit(0)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(2) })
