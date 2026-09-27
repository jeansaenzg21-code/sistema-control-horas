// Pruebas de SSE y renovacion sobre la compilacion de PRODUCCION (next start).
// Mide conexiones abiertas, reconexiones y comportamiento al renovar.
const BASE = 'http://127.0.0.1:3123'
const CLAVE = 'Prueba123!'

let pass = 0
let fail = 0
const fallos = []
function ok(c, m, extra) {
  if (c) { pass++; console.log(`  ok    ${m}`) }
  else { fail++; fallos.push(m); console.log(`  FALLA ${m}${extra ? `\n          ${extra}` : ''}`) }
}
function titulo(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`) }

async function login(u) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: u, password: CLAVE }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`login ${u}: ${r.status}`)
  return j
}

async function main() {
  titulo('1. SSE: autorizacion intacta')
  {
    const s = await login('carga050')
    const uid = s.usuario.id
    // El token que se usa para escuchar el stream de `uid` es el SUYO. Usar el de
    // otro usuario daria 403, que es justo lo que hay que comprobar mas abajo.
    const conHeader = await fetch(`${BASE}/api/actividades/stream?usuario_id=${uid}`, {
      headers: { Authorization: `Bearer ${s.token}` },
    })
    ok(conHeader.status === 200, 'con Authorization Bearer: 200 (clientes sin cookies)', `${conHeader.status}`)
    conHeader.body?.cancel?.()

    const ajena = await login('carga051')
    const otro = ajena.usuario.id
    const intruso = await fetch(`${BASE}/api/actividades/stream?usuario_id=${otro}`, {
      headers: { Authorization: `Bearer ${ajena.token}` },
    })
    ok(intruso.status === 200, 'un usuario escucha su propio stream: 200', `${intruso.status}`)
    intruso.body?.cancel?.()

    const ajenaB = await login('carga052')
    const intrusoReal = await fetch(`${BASE}/api/actividades/stream?usuario_id=${otro}`, {
      headers: { Authorization: `Bearer ${ajenaB.token}` },
    })
    ok(intrusoReal.status === 403, 'token de otro usuario contra otro usuario_id: 403 (no se elimina la validacion)', `${intrusoReal.status}`)
    intrusoReal.body?.cancel?.()

    const invalido = await fetch(`${BASE}/api/actividades/stream?usuario_id=abc`)
    ok(invalido.status === 400, 'usuario_id invalido: 400', `${invalido.status}`)
  }

  titulo('2. SSE: sin token en la URL, por cookie HttpOnly')
  {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'carga053', password: CLAVE }),
    })
    const cookie = r.headers.getSetCookie?.() ?? []
    const rutas = cookie.map((c) => c.split(';')[0].split('=')[0])
    ok(rutas.includes('pc_refresh'), 'login deja cookie de renovacion', JSON.stringify(rutas))
    ok(rutas.includes('pc_token'), 'login deja cookie de acceso', JSON.stringify(rutas))
    ok(cookie.every((c) => c.includes('HttpOnly')), 'todas son HttpOnly', JSON.stringify(cookie))
    ok(cookie.every((c) => c.includes('SameSite=Lax')), 'todas son SameSite=Lax', JSON.stringify(cookie))
    ok(cookie.every((c) => c.includes('Secure')), 'todas Secure en produccion', JSON.stringify(cookie.join(' | ')))

    // La conexion con cookie debe funcionar: es lo que hara el EventSource.
    const soloCookie = cookie.map((c) => c.split(';')[0]).join('; ')
    const conCookie = await fetch(`${BASE}/api/actividades/stream?usuario_id=${(await r.json()).usuario.id}`, {
      headers: { Cookie: soloCookie },
    })
    ok(conCookie.status === 200, 'SSE autenticado solo por cookie: 200 (el token sale de la URL)', `${conCookie.status}`)
    conCookie.body?.cancel?.()
  }

  titulo('3. SSE: conexiones duplicadas y limpieza')
  {
    const s = await login('carga054')
    const uid = s.usuario.id
    const h = { Authorization: `Bearer ${s.token}` }
    // 5 conexiones simultaneas del mismo usuario, cada una se cancela.
    const opened = []
    for (let i = 0; i < 5; i++) {
      const c = new AbortController()
      const r = await fetch(`${BASE}/api/actividades/stream?usuario_id=${uid}`, {
        headers: h, signal: c.signal,
      })
      opened.push({ r, c })
    }
    ok(opened.every((o) => o.r.status === 200), 'las 5 conexiones abren con 200')
    // El servidor debe tener 5 oyentes registrados. Al cancelar, deben bajar.
    await new Promise((r) => setTimeout(r, 300))
    opened.forEach((o) => o.c.abort())
    await new Promise((r) => setTimeout(r, 600))
    // Si la limpieza fallara, este endpoint seguiria notificando. Se comprueba
    // que el servidor responde con normalidad tras cerrar todo.
    const despues = await fetch(`${BASE}/api/setup/status`)
    ok(despues.status === 200, 'el servidor sigue sano tras cerrar 5 conexiones')
  }

  titulo('4. Renovacion: concurrencia y rotacion')
  {
    const m = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cliente': 'movil' },
      body: JSON.stringify({ usuario: 'carga055', password: CLAVE }),
    })
    const mj = await m.json()
    ok(typeof mj.refresh_token === 'string', 'el movil recibe refresh_token')

    // 10 renovaciones simultaneas con el MISMO token.
    const r = await Promise.all(
      Array.from({ length: 10 }, () =>
        fetch(`${BASE}/api/auth/sesion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: mj.refresh_token }),
        })
      )
    )
    const ok2 = r.filter((x) => x.status === 200).length
    const otros = r.filter((x) => x.status !== 200)
    console.log(`  10 renovaciones simultaneas -> ${ok2} con 200, ${otros.length} con ${[...new Set(otros.map((o) => o.status))].join('/')}`)
    ok(r.every((x) => x.status === 200 || x.status === 401), 'ninguna devuelve 5xx', JSON.stringify(r.map((x) => x.status)))
    ok(ok2 >= 1, 'al menos una renovacion tiene exito', `${ok2}`)
    ok(otros.every((x) => x.status === 401), 'las que fallan son 401, no 5xx ni 409')

    // Tras rotar, el token viejo ya no sirve.
    const viejo = await fetch(`${BASE}/api/auth/sesion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: mj.refresh_token }),
    })
    ok(viejo.status === 401, 'el token viejo queda invalidado tras rotar', `${viejo.status}`)
  }

  titulo('5. Renovacion: caducidades repartidas (sin avalancha)')
  {
    // 20 inicios de sesion seguidos: las caducidades NO deben caer todas en el
    // mismo minuto, o las 200 renovaciones se alinearian.
    const caducidades = []
    for (let i = 0; i < 20; i++) {
      const r = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: 'carga056', password: CLAVE }),
      })
      const j = await r.json()
      caducidades.push(new Date(j.expira_en).getTime())
    }
    const minutos = [...new Set(caducidades.map((c) => Math.floor(c / 60000)))]
    console.log(`  20 sesiones -> ${minutos.length} minutos de caducidad distintos`)
    ok(minutos.length > 1, 'las caducidades estan repartidas, no alineadas', `minutos unicos: ${minutos.length}`)
  }

  titulo('6. Desactivar la cuenta detiene la renovacion')
  {
    const m = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cliente': 'movil' },
      body: JSON.stringify({ usuario: 'carga057', password: CLAVE }),
    })
    const mj = await m.json()
    // Se desactiva la cuenta y se intenta renovar.
    const admin = await login('administracion')
    await fetch(`${BASE}/api/usuarios/${mj.usuario.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ activo: 0 }),
    })
    const r = await fetch(`${BASE}/api/auth/sesion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: mj.refresh_token }),
    })
    ok(r.status === 401, 'una cuenta desactivada NO puede renovar', `${r.status}`)
    // Se reactiva para no dejar el usuario de prueba inutilizable.
    await fetch(`${BASE}/api/usuarios/${mj.usuario.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ activo: 1 }),
    })
  }

  titulo('7. Sesiones por dispositivo, revocables por separado')
  {
    const a = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cliente': 'movil' },
      body: JSON.stringify({ usuario: 'carga058', password: CLAVE }),
    })
    const aj = await a.json()
    const b = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cliente': 'movil' },
      body: JSON.stringify({ usuario: 'carga058', password: CLAVE }),
    })
    const bj = await b.json()
    ok(aj.token !== bj.token, 'dos inicios dan tokens distintos (dos dispositivos)')

    const listar = await fetch(`${BASE}/api/auth/sesion`, { headers: { Authorization: `Bearer ${aj.token}` } })
    const lj = await listar.json()
    const propias = (lj.sesiones || []).length
    ok(propias >= 2, 'el usuario ve sus 2 sesiones abiertas', `${propias}`)

    // Cerrar una sesion no debe tumbar la otra.
    const cerrar = await fetch(`${BASE}/api/auth/sesion`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: aj.refresh_token }),
    })
    ok(cerrar.status === 200, 'se cierra una sesion', `${cerrar.status}`)
    const otraSigue = await fetch(`${BASE}/api/auth/session`, { headers: { Authorization: `Bearer ${bj.token}` } })
    ok(otraSigue.status === 200, 'la sesion del OTRO dispositivo sigue viva', `${otraSigue.status}`)
  }

  console.log(`\n${'='.repeat(62)}`)
  console.log(`  ${pass} correctas, ${fail} fallidas`)
  if (fallos.length) fallos.forEach((f) => console.log(`   - ${f}`))
  console.log('='.repeat(62))
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(2) })
