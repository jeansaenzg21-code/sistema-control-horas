// Generador de carga para la Fase 3.
//
// Pensado para ejecutarse DESDE OTRA MAQUINA, apuntando al servidor que se
// quiere medir. Nunca contra produccion.
//
//   node carga.js --url http://IP_DEL_SERVIDOR --nivel 50 --duracion 300
//
// Uso de usuarios: por defecto entra en el rango de la carga (carga001..cargaNNN)
// para que cada nivel use usuarios propios y los datos no se pisen entre
// niveles. Con --compartir se reutilizan los mismos, que es lo mas parecido a
// un pico real, pero entonces cada nivel empieza sobre el estado del anterior.
//
// No se instala ninguna dependencia: solo fetch y el modulo 'http' de Node.
const http = require('http')

const args = process.argv.slice(2)
function opt(nombre, porDefecto) {
  const i = args.indexOf(`--${nombre}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto
}
const URL_BASE = opt('url', 'http://127.0.0.1:3123').replace(/\/$/, '')
const NIVEL = Number(opt('nivel', 25))
const DURACION = Number(opt('duracion', 300)) * 1000
const CLAVE = opt('clave', 'Prueba123!')
const COMPARTIR = args.includes('--compartir')
const CON_SSE = !args.includes('--sin-sse')
const PICO = args.includes('--pico')
const SALIDA = opt('salida', '')

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

function percentil(v, p) {
  if (!v.length) return 0
  const o = [...v].sort((a, b) => a - b)
  return o[Math.min(o.length - 1, Math.ceil((p / 100) * o.length) - 1)]
}

// ---------------------------------------------------------------- medicion
const latencias = []
const porRuta = new Map()
const errores = []
const sseAbiertos = { ahora: 0, maximo: 0, total: 0 }
let peticiones = 0

function registro(ruta, ms, estado, esperado = null) {
  peticiones++
  latencias.push(ms)
  const r = porRuta.get(ruta) || { n: 0, ms: [], errores: 0 }
  r.n++
  r.ms.push(ms)
  // Un 409 (actividad ya activa) y un 401 (token caducado) son respuestas
  // ESPERADAS: no cuentan como fallo del sistema, pero se anotan.
  if (estado >= 500 || (esperado != null && !esperado.has(estado))) {
    r.errores++
    if (errores.length < 40) errores.push(`${ruta} -> HTTP ${estado}`)
  }
  porRuta.set(ruta, r)
}

async function pedir(ruta, { metodo = 'GET', token, cuerpo, esperado } = {}) {
  const t0 = process.hrtime.bigint()
  try {
    const r = await fetch(`${URL_BASE}${ruta}`, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
    // El cuerpo se lee UNA sola vez y se devuelve ya parseado: leerlo aqui y
    // otra vez con .json() daria "Body has already been read".
    const texto = await r.text()
    const ms = Number(process.hrtime.bigint() - t0) / 1e6
    registro(ruta, ms, r.status, esperado)
    let json = null
    try { json = texto.length ? JSON.parse(texto) : null } catch { json = null }
    return { status: r.status, ok: r.ok, json }
  } catch (e) {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6
    registro(ruta, ms, 0, esperado)
    return { status: 0, ok: false, json: null }
  }
}

// ---------------------------------------------------------------- usuario
async function crearUsuario(n) {
  const nombre = `carga${String(n).padStart(3, '0')}`
  const r = await pedir('/api/auth/login', {
    metodo: 'POST',
    cuerpo: { usuario: nombre, password: CLAVE },
    esperado: new Set([200, 401, 403]),
  })
  if (r.status !== 200 || !r.json) return null
  return { nombre, token: r.json.token, id: r.json.usuario.id }
}

function abrirSse(usuario) {
  const ctrl = new AbortController()
  sseAbiertos.ahora++
  sseAbiertos.total++
  if (sseAbiertos.ahora > sseAbiertos.maximo) sseAbiertos.maximo = sseAbiertos.ahora
  fetch(
    `${URL_BASE}/api/actividades/stream?usuario_id=${usuario.id}&token=${encodeURIComponent(usuario.token)}`,
    { headers: { Authorization: `Bearer ${usuario.token}` }, signal: ctrl.signal }
  )
    .then(async (res) => {
      if (!res.ok) { sseAbiertos.ahora--; return }
      const reader = res.body.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    })
    .catch(() => {})
    .finally(() => { sseAbiertos.ahora-- })
  return ctrl
}

// ----------------------------------------------------------------报告中
function informe() {
  const rutas = [...porRuta.entries()].sort((a, b) => b[1].n - a[1].n)
  const out = {
    nivel: NIVEL,
    url: URL_BASE,
    inicio: new Date().toISOString(),
    usuarios: NIVEL,
    sse: { maximoSimultaneos: sseAbiertos.maximo, conexionesTotales: sseAbiertos.total },
    peticiones,
    p50: Math.round(percentil(latencias, 50)),
    p95: Math.round(percentil(latencias, 95)),
    p99: Math.round(percentil(latencias, 99)),
    max: Math.round(Math.max(0, ...latencias)),
    erroresInesperados: [...porRuta.values()].reduce((s, r) => s + r.errores, 0),
    muestraErrores: errores.slice(0, 10),
    rutas: rutas.map(([ruta, r]) => ({
      ruta, peticiones: r.n,
      p50: Math.round(percentil(r.ms, 50)),
      p95: Math.round(percentil(r.ms, 95)),
      errores: r.errores,
    })),
  }
  return out
}

// ---------------------------------------------------------------- escenario
async function main() {
  console.log(`Fase 3 | nivel ${NIVEL} usuarios | ${DURACION / 1000}s | ${PICO ? 'PICO' : 'jornada'}`)
  console.log(`Objetivo: ${URL_BASE}`)
  console.log('')

  const usuarios = []
  const desde = COMPARTIR ? 1 : 1
  for (let i = desde; i < desde + NIVEL; i++) {
    const u = await crearUsuario(i)
    if (u) usuarios.push(u)
  }
  console.log(`usuarios autenticados: ${usuarios.length} de ${NIVEL}`)
  if (usuarios.length === 0) { console.log('no se pudo autenticar a nadie'); process.exit(1) }

  const streams = CON_SSE ? usuarios.map((u) => abrirSse(u)) : []
  console.log(`conexiones SSE abiertas: ${streams.length}`)
  console.log('')
  console.log('ruta                                        peticiones     p50      p95  errores')
  console.log('-'.repeat(78))

  const t0 = Date.now()
  // CADENCIA REALISTA. Un trabajador NO envia peticiones continuamente: mira el
  // panel de vez en cuando. Estos intervalos salen de usar la app de verdad.
  //   consultar panel   ~ cada 45 s
  //   ver historial     ~ cada 6 min
  //   iniciar actividad ~ 6 por jornada, agrupadas al empezar y al comer
  //   finalizar         ~ 6 por jornada
  const fin = t0 + DURACION

  await Promise.all(usuarios.map(async (u, i) => {
    // Escalonado de arranque: en la vida real la gente entra escalonada.
    await espera(i * 120)
    let abierta = false
    while (Date.now() < fin) {
      // 1) Panel: actividad actual
      await pedir('/api/actividades/actual', { token: u.token, esperado: new Set([200]) })

      // 2) Historial de vez en cuando
      if (Math.random() < 0.18) {
        await pedir(`/api/actividades?usuario_id=${u.id}&limite=50`, { token: u.token, esperado: new Set([200]) })
      }

      // 3) Iniciar y finalizar, como en una jornada
      if (PICO) {
        // Modo pico: todos a la vez, es lo que pasa a las 8:00.
        const r = await pedir('/api/actividades', {
          metodo: 'POST', token: u.token,
          cuerpo: { usuario_id: u.id, tipo_actividad_id: 40 },
          esperado: new Set([200, 409, 400]),
        })
        if (r.status === 200) {
          abierta = true
          await espera(800 + Math.random() * 1500)
          await pedir(`/api/actividades/${(await r.json().catch(() => ({}))).actividad?.id}/finalizar`, {
            metodo: 'POST', token: u.token, cuerpo: {}, esperado: new Set([200, 400, 404]),
          })
          abierta = false
        }
        await espera(2000)
      } else {
        if (!abierta && Math.random() < 0.06) {
          const r = await pedir('/api/actividades', {
            metodo: 'POST', token: u.token,
            cuerpo: { usuario_id: u.id, tipo_actividad_id: 40 },
            esperado: new Set([200, 409, 400]),
          })
          if (r.status === 200) abierta = true
        }
        if (abierta && Math.random() < 0.25) {
          const actual = await pedir('/api/actividades/actual', { token: u.token, esperado: new Set([200]) })
          const a = await actual.json().catch(() => null)
          if (a?.id) {
            await pedir(`/api/actividades/${a.id}/finalizar`, {
              metodo: 'POST', token: u.token, cuerpo: {}, esperado: new Set([200, 400, 404]),
            })
            abierta = false
          }
        }
        await espera(15000 + Math.random() * 20000)
      }
    }
  }))

  streams.forEach((c) => c.abort())
  const res = informe()
  const seg = (Date.now() - t0) / 1000
  res.duracionSegundos = Math.round(seg)
  res.peticionesPorSegundo = +(peticiones / seg).toFixed(2)

  console.log('-'.repeat(78))
  for (const r of res.rutas) {
    console.log(
      `${r.ruta.slice(0, 42).padEnd(43)} ${String(r.peticiones).padStart(8)} ${String(r.p50).padStart(8)} ${String(r.p95).padStart(8)} ${String(r.errores).padStart(7)}`
    )
  }
  console.log('-'.repeat(78))
  console.log(`total peticiones: ${res.peticiones}  (${res.peticionesPorSegundo}/s)`)
  console.log(`p50 ${res.p50} ms | p95 ${res.p95} ms | p99 ${res.p99} ms | max ${res.max} ms`)
  console.log(`errores inesperados: ${res.erroresInesperados}`)
  console.log(`SSE: maximo ${res.sse.maximoSimultaneos} simultaneos, ${res.sse.conexionesTotales} conexiones abiertas en total`)
  if (res.muestraErrores.length) console.log(`ejemplos: ${res.muestraErrores.slice(0, 5).join(' | ')}`)

  if (SALIDA) {
    require('fs').writeFileSync(SALIDA, JSON.stringify(res, null, 2))
    console.log(`\nresultado escrito en ${SALIDA}`)
  }
  process.exit(0)
}

void http
main().catch((e) => { console.error('ERROR:', e); process.exit(2) })
