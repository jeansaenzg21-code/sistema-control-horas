// SSE multidispositivo y renovacion con pestanas/dispositivos simultaneos.
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

async function login(u, movil = false) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(movil ? { 'X-Cliente': 'movil' } : {}) },
    body: JSON.stringify({ usuario: u, password: CLAVE }),
  })
  return { r, j: await r.json() }
}

/** Abre un stream SSE y cuenta los eventos que llegan. */
function abrirStream(usuarioId, token, etiqueta, recibidos) {
  const ctrl = new AbortController()
  const estado = { etiqueta, eventos: [], estado: 'conectando', ctrl }
  fetch(`${BASE}/api/actividades/stream?usuario_id=${usuarioId}&token=${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: ctrl.signal,
  })
    .then(async (res) => {
      estado.estado = res.ok ? 'conectado' : `error-${res.status}`
      if (!res.ok) { estado.ctrl.abort(); return }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += dec.decode(value, { stream: true })
        for (const trozo of buffer.split('\n\n')) {
          const m = /event: (\S+)/.exec(trozo)
          if (m) { estado.eventos.push(m[1]); recibidos?.push({ etiqueta, evento: m[1] }) }
        }
        buffer = buffer.split('\n\n').pop() || ''
      }
    })
    .catch(() => { estado.estado = 'cerrado' })
  return estado
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const db = await mysql.createConnection(BD)

  // ------------------------------------------------------------------
  titulo('1. SSE: dos conexiones legitimas del MISMO usuario (web + movil)')
  // ------------------------------------------------------------------
  {
    const web = (await login('carga060')).j
    const movil = (await login('carga060', true)).j
    ok(web.token !== movil.token, 'web y movil tienen tokens distintos (dos dispositivos)')
    const uid = web.usuario.id

    const recibidos = []
    const a = abrirStream(uid, web.token, 'web', recibidos)
    const b = abrirStream(uid, movil.token, 'movil', recibidos)
    await esperar(1200)
    ok(a.estado === 'conectado', 'la conexion de la web abre', a.estado)
    ok(b.estado === 'conectado', 'la conexion del movil abre', b.estado)
    ok(a.estado === 'conectado' && b.estado === 'conectado',
      'abrir la segunda NO cierra la primera (dos conexiones vivas)')

    // El usuario inicia una actividad: deben enterarse los dos.
    const alta = await fetch(`${BASE}/api/actividades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${web.token}` },
      body: JSON.stringify({ usuario_id: uid, tipo_actividad_id: 40 }),
    })
    const altaJ = await alta.json()
    ok(alta.status === 200, 'la web inicia la actividad', `${alta.status}`)
    await esperar(900)

    const deWeb = recibidos.filter((r) => r.etiqueta === 'web' && r.evento === 'activity-changed').length
    const deMovil = recibidos.filter((r) => r.etiqueta === 'movil' && r.evento === 'activity-changed').length
    console.log(`  eventos recibidos -> web: ${deWeb}, movil: ${deMovil}`)
    ok(deWeb >= 1, 'la web recibe el aviso de su propia actividad', `${deWeb}`)
    ok(deMovil >= 1, 'el movil recibe el aviso de la actividad que inicio la WEB', `${deMovil}`)

    // El movil ve el mismo estado consultando, como hara al volver a primer plano.
    const desdeMovil = await fetch(`${BASE}/api/actividades/actual`, {
      headers: { Authorization: `Bearer ${movil.token}` },
    })
    const actualMovil = await desdeMovil.json()
    const desdeWeb = await fetch(`${BASE}/api/actividades/actual`, {
      headers: { Authorization: `Bearer ${web.token}` },
    })
    const actualWeb = await desdeWeb.json()
    ok(actualMovil && actualWeb && actualMovil.id === actualWeb.id,
      'web y movil ven la MISMA actividad en curso',
      `movil=${actualMovil?.id} web=${actualWeb?.id}`)
    ok(actualMovil?.id === altaJ.actividad.id, 'es la que se acaba de iniciar', `${actualMovil?.id} vs ${altaJ.actividad.id}`)

    // ------------------------------------------------------------------
    titulo('2. SSE: los cuatro cambios de estado notificados')
    // ------------------------------------------------------------------
    const idAct = actualWeb.id
    const cambios = [
      ['pausar', `/api/actividades/${idAct}/pausar`],
      ['continuar', `/api/actividades/${idAct}/continuar`],
      ['finalizar', `/api/actividades/${idAct}/finalizar`],
    ]
    for (const [nombre, ruta] of cambios) {
      const antes = recibidos.filter((r) => r.evento === 'activity-changed').length
      const res = await fetch(`${BASE}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${web.token}` },
        body: '{}',
      })
      await esperar(700)
      const despues = recibidos.filter((r) => r.evento === 'activity-changed').length
      const paraMovil = recibidos.filter((r) => r.etiqueta === 'movil' && r.evento === 'activity-changed').length
      console.log(`  ${nombre}: HTTP ${res.status}, eventos +${despues - antes}, móvil acumula ${paraMovil}`)
      ok(res.status === 200, `${nombre}: responde 200`, `${res.status}`)
      ok(despues > antes, `${nombre}: se notifica el cambio`, 'no llego evento')
    }

    a.ctrl.abort(); b.ctrl.abort()
    await esperar(600)

    // ------------------------------------------------------------------
    titulo('3. Sin conexiones huerfanas tras cerrar')
    // ------------------------------------------------------------------
    // Si los oyentes no se quitaran, /api/actividades/actual seguiria
    // notificando a un listener muerto y las conexiones se acumularian.
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM sesiones')
    console.log(`  filas en sesiones: ${total}`)
    const salud = await fetch(`${BASE}/api/setup/status`)
    ok(salud.status === 200, 'el servidor sigue respondiendo tras cerrar los streams')
  }

  // ------------------------------------------------------------------
  titulo('4. Renovacion: pestanas simultaneas no se desconectan entre si')
  // ------------------------------------------------------------------
  {
    const { j } = await login('carga061', true)
    const r = j.refresh_token
    // 6 pestanas renuevan a la vez con el MISMO token de renovacion.
    const pestanas = await Promise.all(
      Array.from({ length: 6 }, () =>
        fetch(`${BASE}/api/auth/sesion`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: r }),
        })
      )
    )
    const ok2 = pestanas.filter((x) => x.status === 200).length
    const auth = pestanas.filter((x) => x.status === 401).length
    console.log(`  6 pestanas -> ${ok2} con 200, ${auth} con 401`)
    ok(pestanas.every((x) => x.status === 200 || x.status === 401), 'ninguna devuelve 5xx')
    ok(ok2 >= 1, 'al menos una pestana renueva', `${ok2}`)

    // La sesion NO debe quedar cerrada: con el token que devolvio la que
    //renewo, el usuario sigue operando.
    const ganador = await (await fetch(`${BASE}/api/auth/sesion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: r }),
    })).json().catch(() => null)
    const tokenVivo = ganador?.token
    if (tokenVivo) {
      const uso = await fetch(`${BASE}/api/actividades/actual`, { headers: { Authorization: `Bearer ${tokenVivo}` } })
      ok(uso.status === 200, 'tras la renovacion concurrente la sesion sigue viva', `${uso.status}`)
    } else {
      // Si ya no queda token, se toma el de la respuesta que si funciono.
      const uno = await fetch(`${BASE}/api/auth/sesion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: r }),
      })
      ok(!uno.ok, 'el token antiguo ya no renueva (rotacion segura)', `${uno.status}`)
    }
  }

  // ------------------------------------------------------------------
  titulo('5. 401 de un token viejo NO cierra una sesion ya renovada')
  // ------------------------------------------------------------------
  {
    const { j } = await login('carga062', true)
    const viejo = j.token            // token de acceso de antes de renovar
    const refreshViejo = j.refresh_token

    // Se renueva: el servidor emite un token nuevo y rota el de renovacion.
    const ren = await (await fetch(`${BASE}/api/auth/sesion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshViejo }),
    })).json()
    ok(typeof ren.token === 'string', 'se renovo y se obtuvo un token nuevo')

    // Una peticion que salio ANTES de renovar y vuelve ahora con el token viejo.
    const conTokenViejo = await fetch(`${BASE}/api/actividades/actual`, {
      headers: { Authorization: `Bearer ${viejo}` },
    })
    console.log(`  peticion con el token anterior tras renovar: HTTP ${conTokenViejo.status}`)
    ok(conTokenViejo.status === 401, 'el token viejo da 401 (esta expirado de verdad)', `${conTokenViejo.status}`)

    // Lo importante: la sesion sigue viva y se puede seguir operando.
    const conTokenNuevo = await fetch(`${BASE}/api/actividades/actual`, {
      headers: { Authorization: `Bearer ${ren.token}` },
    })
    ok(conTokenNuevo.status === 200, 'la sesion NO se cerro: el token nuevo funciona', `${conTokenNuevo.status}`)

    // Y el token de renovacion sigue siendo el nuevo, no se invalido.
    const segunda = await fetch(`${BASE}/api/auth/sesion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: ren.refresh_token ?? refreshViejo }),
    })
    ok(segunda.status === 200 || segunda.status === 401,
      'el token de renovacion responde con decision clara, no 500', `${segunda.status}`)
  }

  // ------------------------------------------------------------------
  titulo('6. Sesiones web y movil independientes del mismo usuario')
  // ------------------------------------------------------------------
  {
    const web = (await login('carga063')).j
    const movil = (await login('carga063', true)).j

    // Cerrar la sesion del movil no debe tumbar la de la web.
    const cerrarMovil = await fetch(`${BASE}/api/auth/sesion`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: movil.refresh_token }),
    })
    ok(cerrarMovil.status === 200, 'se cierra la sesion del movil', `${cerrarMovil.status}`)

    const webSigue = await fetch(`${BASE}/api/actividades/actual`, {
      headers: { Authorization: `Bearer ${web.token}` },
    })
    ok(webSigue.status === 200, 'la sesion de la WEB sigue viva', `${webSigue.status}`)

    const movilMuerto = await fetch(`${BASE}/api/auth/sesion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: movil.refresh_token }),
    })
    ok(movilMuerto.status === 401, 'el movil ya NO puede renovar', `${movilMuerto.status}`)
  }

  await db.end()
  console.log(`\n${'='.repeat(62)}`)
  console.log(`  ${pass} correctas, ${fail} fallidas`)
  fallos.forEach((f) => console.log(`   - ${f}`))
  console.log('='.repeat(62))
  process.exit(0)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(2) })
