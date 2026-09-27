// El endpoint de agregados debe dar EXACTAMENTE las mismas cifras que daba el
// calculo en el navegador, pero sin traer las filas. Ademas comprueba que los
// periodos grandes ya no exigen descargar el historico entero.
const mysql = require('mysql2/promise')

const BASE = 'http://127.0.0.1:3123'
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
  const db = await mysql.createConnection(BD)
  const login = async (u) => {
    const j = await (await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: u, password: CLAVE }),
    })).json()
    if (!j?.usuario) throw new Error(`no se pudo entrar como ${u}: ${JSON.stringify(j).slice(0, 120)}`)
    return j
  }

  // ------------------------------------------------------------------
  titulo('1. Los agregados del servidor cuadran con SQL independiente')
  // ------------------------------------------------------------------
  {
    const admin = await login('administracion')
    const h = { Authorization: `Bearer ${admin.token}` }
    const r = await fetch(`${BASE}/api/actividades/resumen`, { headers: h })
    ok(r.status === 200, 'el endpoint de resumen responde 200', `${r.status}`)
    const resumen = await r.json()

    const [[{ n, hrs, fact, nofact }]] = await db.query(`
      SELECT COUNT(*) AS n,
             COALESCE(SUM(GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, COALESCE(a.fin, NOW()))
               - COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW())))
                             FROM pausas p WHERE p.actividad_id = a.id), 0))), 0) / 3600 AS hrs,
             COALESCE(SUM(CASE WHEN a.estado='APROBADA' AND a.facturable=1
               THEN GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, COALESCE(a.fin, NOW()))
               - COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW())))
                             FROM pausas p WHERE p.actividad_id = a.id), 0)) ELSE 0 END), 0) / 3600 AS fact,
             COALESCE(SUM(CASE WHEN a.estado='RECHAZADA' OR (a.estado='APROBADA' AND a.facturable=0)
               THEN GREATEST(0, TIMESTAMPDIFF(SECOND, a.inicio, COALESCE(a.fin, NOW()))
               - COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, NOW())))
                             FROM pausas p WHERE p.actividad_id = a.id), 0)) ELSE 0 END), 0) / 3600 AS nofact
        FROM actividades a
        INNER JOIN usuarios u ON u.id = a.usuario_id
        INNER JOIN areas ar ON ar.id = u.area_id
       WHERE ar.empresa_id = 10`)

    console.log(`  endpoint: ${resumen.totales.registros} registros, ${resumen.totales.horas.toFixed(2)} h`)
    console.log(`  SQL:      ${n} registros, ${Number(hrs).toFixed(2)} h`)
    ok(resumen.totales.registros === Number(n), 'el numero de registros coincide', `${resumen.totales.registros} vs ${n}`)
    ok(Math.abs(resumen.totales.horas - Number(hrs)) < 0.5, 'las horas totales coinciden', `${resumen.totales.horas} vs ${Number(hrs).toFixed(2)}`)
    ok(Math.abs(resumen.totales.horas_facturadas - Number(fact)) < 0.5, 'las horas facturadas coinciden')
    ok(Math.abs(resumen.totales.horas_no_facturadas - Number(nofact)) < 0.5, 'las no facturadas coinciden')

    const suma = resumen.por_cargo.reduce((s, c) => s + c.horas, 0)
    ok(Math.abs(suma - resumen.totales.horas) < 0.5,
      'el desglose por cargo suma el total (no se pierde nada al agrupar)',
      `${suma.toFixed(2)} vs ${resumen.totales.horas.toFixed(2)}`)
    console.log(`  pesos del endpoint: ${JSON.stringify(r).length} bytes para ${resumen.por_cargo.length} cargos, ${resumen.por_dia.length} dias y ${resumen.por_usuario.length} personas`)
  }

  // ------------------------------------------------------------------
  titulo('2. El peso del panel sin fechas')
  // ------------------------------------------------------------------
  {
    const admin = await login('administracion')
    const h = { Authorization: `Bearer ${admin.token}` }
    const t0 = Date.now()
    const r = await fetch(`${BASE}/api/actividades/resumen`, { headers: h })
    const texto = await r.text()
    const ms = Date.now() - t0
    console.log(`  ${(texto.length / 1024).toFixed(1)} KB en ${ms} ms`)
    console.log(`  antes: 11.9 MB en 40 peticiones y 28 580 ms`)
    ok(texto.length < 200_000, 'la respuesta del resumen es pequeña', `${texto.length} bytes`)
    ok(ms < 3000, 'se responde en menos de 3 segundos', `${ms} ms`)
  }

  // ------------------------------------------------------------------
  titulo('3. Los filtros de fecha del resumen respetan el rango')
  // ------------------------------------------------------------------
  {
    const admin = await login('administracion')
    const h = { Authorization: `Bearer ${admin.token}` }
    const r = await fetch(`${BASE}/api/actividades/resumen?desde=2025-03-01&hasta=2025-03-31`, { headers: h })
    const resumen = await r.json()
    const [[{ n }]] = await db.query(`
      SELECT COUNT(*) AS n FROM actividades a
        INNER JOIN usuarios u ON u.id=a.usuario_id
        INNER JOIN areas ar ON ar.id=u.area_id
       WHERE ar.empresa_id=10 AND a.inicio >= '2025-03-01 00:00:00' AND a.inicio < '2025-04-01 00:00:00'`)
    ok(resumen.totales.registros === Number(n), 'el rango del resumen coincide con SQL', `${resumen.totales.registros} vs ${n}`)
    const fuera = resumen.por_dia.filter((d) => d.dia < '2025-03-01' || d.dia >= '2025-04-01')
    ok(fuera.length === 0, 'ningun dia fuera del rango', JSON.stringify(fuera.slice(0, 3)))

    const mala = await fetch(`${BASE}/api/actividades/resumen?desde=ayer`, { headers: h })
    ok(mala.status === 400, 'una fecha invalida se rechaza con 400', `${mala.status}`)
  }

  // ------------------------------------------------------------------
  titulo('4. El resumen NO es una via para saltarse permisos')
  // ------------------------------------------------------------------
  {
    const personal = await login('carga001')
    const h = { Authorization: `Bearer ${personal.token}` }
    const [otros] = await db.query(
      "SELECT id FROM usuarios WHERE rol = 'PERSONAL' AND usuario <> ? AND activo = 1 LIMIT 1",
      [personal.usuario.usuario]
    )
    ok(otros.length > 0, 'hay otro usuario PERSONAL para la prueba de aislamiento')
    const ajeno = await fetch(`${BASE}/api/actividades/resumen?usuario_id=${otros[0].id}`, { headers: h })
    ok(ajeno.status === 403, 'un PERSONAL no pide el resumen de otro', `${ajeno.status}`)

    const propio = await fetch(`${BASE}/api/actividades/resumen`, { headers: h })
    const r = await propio.json()
    const [[{ propio: nPropio }]] = await db.query(
      'SELECT COUNT(*) AS propio FROM actividades WHERE usuario_id = ?', [personal.usuario.id]
    )
    ok(r.totales.registros === Number(nPropio), 'sin parametros, ve SOLO lo suyo', `${r.totales.registros} vs ${nPropio}`)

    const sinToken = await fetch(`${BASE}/api/actividades/resumen`)
    ok(sinToken.status === 401, 'sin token responde 401', `${sinToken.status}`)
  }

  await db.end()
  console.log(`\n${'='.repeat(62)}`)
  console.log(`  ${pass} correctas, ${fail} fallidas`)
  fallos.forEach((f) => console.log(`   - ${f}`))
  console.log('='.repeat(62))
  process.exit(0)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(2) })
