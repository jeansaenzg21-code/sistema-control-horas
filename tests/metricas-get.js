// Metricas de GET /api/actividades con el codigo nuevo, contra la BD de pruebas
// (202 usuarios, 50 000 actividades). Mide lo que ve el cliente, no la theory.
const mysql = require('mysql2/promise')

const BASE = 'http://127.0.0.1:3123'
const BD = { host: '127.0.0.1', user: 'root', password: 'MYSQL', database: 'paredescano_test' }
const CLAVE = 'Prueba123!'

function percentil(valores, p) {
  if (!valores.length) return 0
  const ordenados = [...valores].sort((a, b) => a - b)
  const i = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)
  return Math.round(ordenados[i])
}

async function main() {
  const db = await mysql.createConnection(BD)
  const [[{ id: adminId }]] = await db.query("SELECT id FROM usuarios WHERE usuario = 'administracion'")
  const [[{ id: supervisorId }]] = await db.query("SELECT id FROM usuarios WHERE usuario = 'supervisor'")
  const [[{ id: personalId }]] = await db.query("SELECT id FROM usuarios WHERE usuario = 'carga001'")

  const login = await (
    await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'administracion', password: CLAVE }),
    })
  ).json()
  const token = login.token
  const h = { Authorization: `Bearer ${token}` }

  const casos = [
    ['admin: empresa entera, sin filtro', `/api/actividades`, adminId],
    ['admin: empresa entera + rango de fechas', `/api/actividades?desde=2026-01-01&hasta=2026-12-31`, adminId],
    ['supervisor: sus colaboradores', `/api/actividades?usuario_id=${supervisorId}`, supervisorId],
    ['personal: su propio historial', `/api/actividades?usuario_id=${personalId}`, personalId],
    ['personal: actividad actual', `/api/actividades?usuario_id=${personalId}&estado=EN_CURSO`, personalId],
  ]

  console.log('escenario                                        filas  bytes    p50    p95    p99')
  console.log('-' .repeat(84))

  for (const [nombre, url] of casos) {
    // Calentamiento: la primera peticion compila la ruta en modo dev.
    await fetch(`${BASE}${url}`, { headers: h })

    const tiempos = []
    let filas = 0
    let bytes = 0
    for (let i = 0; i < 25; i++) {
      const t0 = process.hrtime.bigint()
      const r = await fetch(`${BASE}${url}`, { headers: h })
      const texto = await r.text()
      const ms = Number(process.hrtime.bigint() - t0) / 1e6
      tiempos.push(ms)
      bytes = texto.length
      try { filas = JSON.parse(texto).length } catch { filas = -1 }
    }
    console.log(
      `${nombre.padEnd(50)} ${String(filas).padStart(4)} ${String(Math.round(bytes / 1024) + 'KB').padStart(7)} ${String(percentil(tiempos, 50)).padStart(6)} ${String(percentil(tiempos, 95)).padStart(6)} ${String(percentil(tiempos, 99)).padStart(6)}`
    )
  }

  // Coste real de la consulta en MySQL, sin HTTP de por medio.
  console.log('\n--- filas leidas por MySQL (Handler_read_rnd_next), admin, con rango ---')
  await db.query('FLUSH STATUS')
  await db.query(
    `SELECT COUNT(*) FROM (
       SELECT a.id, COALESCE(pa.segundos, 0) AS pausa
         FROM actividades a
         INNER JOIN usuarios u ON u.id = a.usuario_id
         INNER JOIN areas ar ON ar.id = u.area_id
         LEFT JOIN (SELECT p.actividad_id, SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW()))) AS segundos
                      FROM pausas p GROUP BY p.actividad_id) pa ON pa.actividad_id = a.id
        WHERE ar.empresa_id = 10 AND a.inicio >= '2026-01-01 00:00:00'
        ORDER BY a.inicio DESC LIMIT 500) x`
  )
  const [st] = await db.query(
    "SHOW SESSION STATUS WHERE Variable_name IN ('Handler_read_rnd_next','Sort_scan')"
  )
  st.forEach((s) => console.log(`  ${s.Variable_name} = ${s.Value}`))

  // Y el coste del pool: cuanto tarda MySQL cuando se piden 20 filas de golpe.
  console.log('\n--- comprobacion de que la fecha inclusiva sigue siendo correcta ---')
  const r = await fetch(`${BASE}/api/actividades?desde=2026-03-01&hasta=2026-03-31`, { headers: h })
  const datos = await r.json()
  const fechas = datos.map((d) => String(d.inicio).slice(0, 10))
  const fuera = fechas.filter((f) => f < '2026-03-01' || f >= '2026-04-01')
  console.log(`  filas en marzo de 2026: ${datos.length}`)
  console.log(`  filas fuera del rango: ${fuera.length} ${fuera.length === 0 ? '(correcto)' : '(ERROR)'}`)

  const r2 = await fetch(`${BASE}/api/actividades?desde=hasta-malo`, { headers: h })
  console.log(`  fecha invalida -> HTTP ${r2.status} (debe ser 400)`)

  await db.end()
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
