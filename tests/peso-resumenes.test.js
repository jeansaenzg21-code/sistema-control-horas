// Cuanto historial se le pide al navegador cuando un resumen no tiene fechas.
// Un resumen de un año no debería obligar a descargar un año de filas para
// sumarlas en el navegador del usuario.
const BASE = 'http://127.0.0.1:3123'
const CLAVE = 'Prueba123!'

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const login = async (u) => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: u, password: CLAVE }),
    })
    return (await r.json())
  }

  const admin = await login('administracion')
  const h = { Authorization: `Bearer ${admin.token}` }

  console.log('ESCENARIO: el administrador abre el panel sin filtrar por fechas')
  console.log('(es lo que hace billing-stats, chart-card, area-chart y consolidation-table)')
  console.log('')

  // Lo que hace hoy useHistorialRango sin rango: pagina hasta el tope.
  let offset = 0
  let filas = 0
  let bytes = 0
  let peticiones = 0
  const inicio = Date.now()
  while (filas < 20000) {
    const r = await fetch(`${BASE}/api/actividades?limite=500&offset=${offset}`, { headers: h })
    const texto = await r.text()
    peticiones++
    bytes += texto.length
    const lote = JSON.parse(texto)
    if (lote.length === 0) break
    filas += lote.length
    offset += 500
    if (lote.length < 500) break
  }
  const ms = Date.now() - inicio
  console.log(`  filas que acabaria descargando el navegador: ${filas}`)
  console.log(`  peso total: ${(bytes / 1024 / 1024).toFixed(1)} MB en ${peticiones} peticiones, ${ms} ms`)
  console.log(`  memoria estimada en el navegador como objetos JS: ~${Math.round(filas * 1.5)} MB`)

  // Y lo que le hace falta de verdad: los numeros, no las filas.
  console.log('')
  console.log('Lo que realmente necesitan esos componentes son NUMEROS, no filas:')
  const r = await fetch(`${BASE}/api/actividades?limite=1`, { headers: h })
  void r
  console.log('  - total de horas del periodo      -> 1 numero')
  console.log('  - horas por area                  -> ~16 numeros (uno por area)')
  console.log('  - horas por tipo de actividad     -> ~22 numeros')
  console.log('  - serie temporal de horas         -> ~365 numeros (uno por dia)')
  console.log('  => un agregado de UN servidor cabe en unos 4 KB, no en 30 MB de filas')

  console.log('')
  console.log('CONCLUSION: sin fechas, el navegador descargaria', filas, 'filas para sacar')
  console.log('unas Decenas de numeros. Con fechas en un rango corto, el problema es')
  console.log('mucho menor, pero sigue siendo la via equivocada.')
  process.exit(0)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
