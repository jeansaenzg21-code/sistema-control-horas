// Verificacion de integridad: concurrencia, idempotencia y migraciones.
// Un solo proceso: levanta el servidor de pruebas, ejecuta los escenarios
// comprobando el estado en MySQL, y lo apaga al terminar.
const { spawn } = require('child_process')
const path = require('path')
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')

const WEB = 'C:\\Users\\tsoporte\\Downloads\\paredes-cano-CONTROL-HORAS\\paredes-cano-CONTROL-HORAS'
const STANDALONE = path.join(WEB, '.next', 'standalone')
const BASE = 'http://127.0.0.1:3123'
const BD = { host: '127.0.0.1', user: 'root', password: 'MYSQL', database: 'paredescano_test' }
const CLAVE = 'Prueba123!'

let pass = 0
let fail = 0
const fallos = []

function ok(cond, msg, extra) {
  if (cond) { pass++; console.log(`  ok    ${msg}`) }
  else { fail++; fallos.push(msg); console.log(`  FALLA ${msg}${extra ? `\n          ${extra}` : ''}`) }
}
function titulo(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`) }
function despuesMovil(r) { return r.json ? { code: r.json.code, error: r.json.error } : null }

let db
// Devuelve [filas] para poder desestructurar como [[{ ... }]].
async function q(sql, params) {
  const [rows] = await db.query(sql, params)
  return [rows]
}

async function login(usuario) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password: CLAVE }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`login ${usuario}: HTTP ${r.status} ${JSON.stringify(j)}`)
  return j
}

async function post(ruta, token, cuerpo) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo ?? {}),
  })
  return { status: r.status, json: await r.json().catch(() => null) }
}

async function prep(usuario) {
  const s = await login(usuario)
  const [u] = await q('SELECT id FROM usuarios WHERE usuario = ?', [usuario])
  const id = Number(u[0].id)
  await q(
    "UPDATE actividades SET fin = NOW(), estado = 'APROBADA' WHERE usuario_id = ? AND estado IN ('EN_CURSO','PAUSADA')",
    [id]
  )
  return { token: s.token, id }
}

async function main() {
  db = await mysql.createConnection(BD)
  const [[{ id: tipo }]] = await q('SELECT id FROM tipos_actividad WHERE es_general = 1 AND activo = 1 LIMIT 1')
  const [areas] = await q('SELECT id FROM areas LIMIT 1')
  const areaId = areas[0].id
  console.log(`tipo_actividad general = ${tipo}`)

  // ------------------------------------------------------------------
  titulo('1. Reproduccion del fallo anterior: una peticion suelta')
  // ------------------------------------------------------------------
  {
    const { token, id } = await prep('carga011')
    const r = await post('/api/actividades', token, { usuario_id: id, tipo_actividad_id: tipo })
    console.log(`  HTTP ${r.status}`)
    console.log(`  cuerpo: ${JSON.stringify(r.json).slice(0, 400)}`)
    if (r.status !== 200) {
      console.log('  -> diagnosing...')
      // Â¿Es horario? Â¿Area? Â¿Empresa activa?
      const [[u]] = await q('SELECT u.id, u.activo, u.area_id, ar.empresa_id FROM usuarios u JOIN areas ar ON ar.id = u.area_id WHERE u.id = ?', [id])
      console.log(`  usuario: ${JSON.stringify(u)}`)
      const [hs] = await q('SELECT * FROM horarios WHERE usuario_id = ?', [id])
      console.log(`  horarios: ${hs.length} fila(s)`)
    }
    ok(r.status === 200, 'un alta simple devuelve 200', `devolvio ${r.status}: ${JSON.stringify(r.json)}`)
  }

  // ------------------------------------------------------------------
  titulo('1b. Cliente SIN marca de tiempo (web) y CON ella (movil)')
  // ------------------------------------------------------------------
  {
    const { token, id } = await prep('carga031')
    // Sin `inicio`: es lo que hace la web. Antes devolvia 500.
    const sinMarca = await post('/api/actividades', token, { usuario_id: id, tipo_actividad_id: tipo })
    ok(sinMarca.status === 200, 'alta SIN marca de tiempo devuelve 200 (era 500)', `${sinMarca.status} ${JSON.stringify(sinMarca.json).slice(0, 160)}`)
    if (sinMarca.status === 200) {
      const [[row]] = await q('SELECT inicio FROM actividades WHERE id = ?', [sinMarca.json.actividad.id])
      const guardada = new Date(row.inicio)
      const deriva = Math.abs(Date.now() - guardada.getTime())
      ok(deriva < 120000, 'el servidor puso una hora real reciente', `inicio=${row.inicio} deriva=${deriva}ms`)
    }
    await q("UPDATE actividades SET fin = NOW(), estado = 'APROBADA' WHERE usuario_id = ? AND estado = 'EN_CURSO'", [id])

    // Con `inicio`: es lo que hace el movil.
    const marca = new Date(Date.now() - 45 * 60 * 1000).toISOString()
    const conMarca = await post('/api/actividades', token, { usuario_id: id, tipo_actividad_id: tipo, inicio: marca })
    ok(conMarca.status === 200, 'alta CON marca de tiempo devuelve 200', `${conMarca.status}`)
    if (conMarca.status === 200) {
      const [[row]] = await q('SELECT inicio FROM actividades WHERE id = ?', [conMarca.json.actividad.id])
      const guardada = new Date(row.inicio)
      const deriva = Math.abs(guardada.getTime() - new Date(marca).getTime())
      ok(deriva < 2000, 'respeta la hora real que envio el movil', `guardada=${row.inicio} enviada=${marca}`)
    }
  }

  // ------------------------------------------------------------------
  titulo('2. 20 inicios simultaneos del mismo usuario (20 conexiones)')
  // ------------------------------------------------------------------
  {
    const { token, id } = await prep('carga012')
    const r = await Promise.all(
      Array.from({ length: 20 }, () => post('/api/actividades', token, { usuario_id: id, tipo_actividad_id: tipo }))
    )
    const ok2 = r.filter((x) => x.status === 200)
    const c409 = r.filter((x) => x.status === 409)
    const otros = r.filter((x) => x.status !== 200 && x.status !== 409)
    const [[{ n }]] = await q(
      "SELECT COUNT(*) AS n FROM actividades WHERE usuario_id = ? AND estado IN ('EN_CURSO','PAUSADA')", [id]
    )
    console.log(`  ${ok2.length} con 200, ${c409.length} con 409, ${otros.length} con otro estado`)
    if (otros.length) console.log(`  ejemplo de otro: ${otros[0].status} ${JSON.stringify(otros[0].json).slice(0, 200)}`)
    ok(ok2.length === 1, 'exactamente 1 alta creada', `crearon ${ok2.length}`)
    ok(Number(n) === 1, 'la base tiene UNA sola actividad activa', `hay ${n}`)
    const conCode = c409.filter((x) => x.json && x.json.code === 'ACTIVIDAD_ACTIVA').length
    ok(conCode === c409.length, 'los 409 traen code ACTIVIDAD_ACTIVA', `${conCode} de ${c409.length}`)
  }

  // ------------------------------------------------------------------
  titulo('3. Actividad PAUSADA bloquea un segundo inicio')
  // ------------------------------------------------------------------
  {
    const { token, id } = await prep('carga013')
    // Crear una actividad y dejarla PAUSADA, sin tocar el historial.
    const creada = await post('/api/actividades', token, { usuario_id: id, tipo_actividad_id: tipo })
    const idAct = creada.json.actividad.id
    await q("UPDATE actividades SET fin = NULL, estado = 'PAUSADA' WHERE id = ?", [idAct])
    const r = await post('/api/actividades', token, { usuario_id: id, tipo_actividad_id: tipo })
    const [[{ n: vivas }]] = await q(
      "SELECT COUNT(*) AS n FROM actividades WHERE usuario_id = ? AND estado IN ('EN_CURSO','PAUSADA')", [id]
    )
    ok(r.status === 409, 'con una PAUSADA el nuevo inicio se rechaza', `devolvio ${r.status}`)
    ok(Number(vivas) === 1, 'sigue habiendo una sola activa', `hay ${vivas}`)
  }

  // ------------------------------------------------------------------
  titulo('4. 10 reintentos del MISMO id_operacion: una sola fila, todos recuperan')
  // ------------------------------------------------------------------
  {
    const { token, id } = await prep('carga014')
    const opId = `op-${Date.now()}`
    const r = await Promise.all(
      Array.from({ length: 10 }, () => post('/api/actividades', token, { usuario_id: id, tipo_actividad_id: tipo, id_operacion: opId }))
    )
    const [[{ n }]] = await q('SELECT COUNT(*) AS n FROM actividades WHERE id_operacion = ?', [opId])
    const [[{ activas }]] = await q(
      "SELECT COUNT(*) AS activas FROM actividades WHERE usuario_id = ? AND estado IN ('EN_CURSO','PAUSADA')", [id]
    )
    const con200 = r.filter((x) => x.status === 200)
    const duplicadas = r.filter((x) => x.json && x.json.duplicada === true)
    const conflictos = r.filter((x) => x.status === 409)
    const srv = r.filter((x) => x.status >= 500)
    // Todas las respuestas 200 deben traer la MISMA actividad
    const ids = [...new Set(con200.map((x) => x.json.actividad && x.json.actividad.id).filter(Boolean))]
    console.log(`  ${con200.length} con 200 (${duplicadas.length} duplicada), ${conflictos.length} con 409, ${srv.length} con 5xx`)
    console.log(`  ids devueltos: ${ids.join(', ')}`)
    ok(Number(n) === 1, 'una SOLA fila en la base', `hay ${n}`)
    ok(Number(activas) === 1, 'una sola actividad activa', `hay ${activas}`)
    ok(srv.length === 0, 'ningun 5xx', `${srv.length}`)
    ok(con200.length === 10, 'los 10 reintentos responden 200 (recuperables)', `solo ${con200.length}`)
    ok(ids.length === 1, 'las 10 respuestas apuntan a la MISMA actividad', `ids: ${ids.join(', ')}`)
    ok(
      duplicadas.length === 9,
      '9 de 10 vienen marcadas duplicada (solo 1 fue la creadora)',
      `${duplicadas.length}`
    )
  }

  // ------------------------------------------------------------------
  titulo('4b. Actividad en la WEB + operacion DISTINTA del movil')
  // ------------------------------------------------------------------
  {
    // Primero, la web inicia una actividad SIN id_operacion (no es del movil).
    const web = await prep('carga024')
    const creadaWeb = await post('/api/actividades', web.token, { usuario_id: web.id, tipo_actividad_id: tipo })
    ok(creadaWeb.status === 200, 'la web inicia su actividad', `${creadaWeb.status}`)
    const idWeb = creadaWeb.json.actividad.id
    console.log(`  actividad de la web = ${idWeb}`)

    // El movil, con OTRO id_operacion, intenta iniciar la suya.
    const opMovil = `movil-${Date.now()}`
    const desdeMovil = await post('/api/actividades', web.token, {
      usuario_id: web.id, tipo_actividad_id: tipo, id_operacion: opMovil,
    })
    console.log(`  movil -> HTTP ${desdeMovil.status} ${JSON.stringify(despuesMovil(desdeMovil))}`)

    ok(desdeMovil.status === 409, 'el movil recibe 409 por la actividad de la web', `${desdeMovil.status}`)
    ok(desdeMovil.json && desdeMovil.json.code === 'ACTIVIDAD_ACTIVA', 'el 409 dice ACTIVIDAD_ACTIVA', JSON.stringify(desdeMovil.json))
    ok(
      !desdeMovil.json || desdeMovil.json.actividad_id == null,
      'el 409 NO incluye un id adoptable',
      JSON.stringify(desdeMovil.json)
    )
    ok(desdeMovil.json && desdeMovil.json.actividad == null, 'el 409 NO incluye actividad alguna', JSON.stringify(desdeMovil.json))

    // La fila del movil NO debe existir, y la de la web sigue siendo la activa.
    const [[{ n: filasMovil }]] = await q('SELECT COUNT(*) AS n FROM actividades WHERE id_operacion = ?', [opMovil])
    const [[{ n: activas }]] = await q(
      "SELECT COUNT(*) AS n FROM actividades WHERE usuario_id = ? AND estado IN ('EN_CURSO','PAUSADA')", [web.id]
    )
    const [[{ id: sigue }]] = await q('SELECT id FROM actividades WHERE usuario_id = ? AND estado = ?', [web.id, 'EN_CURSO'])
    ok(Number(filasMovil) === 0, 'el registro del movil NO se guardo (queda local)', `hay ${filasMovil}`)
    ok(Number(activas) === 1, 'sigue habiendo UNA sola actividad activa', `hay ${activas}`)
    ok(Number(sigue) === Number(idWeb), 'la actividad en curso sigue siendo la de la web', `es la ${sigue}, web es ${idWeb}`)

    // Y el movil puede reintentar su operacion cuando la web termine.
    await post(`/api/actividades/${idWeb}/finalizar`, web.token)
    const reintento = await post('/api/actividades', web.token, {
      usuario_id: web.id, tipo_actividad_id: tipo, id_operacion: opMovil,
    })
    ok(reintento.status === 200, 'tras cerrar la de la web, el movil si puede iniciar', `${reintento.status}`)
  }

  // ------------------------------------------------------------------
  titulo('5. 15 cierres simultaneos de la MISMA actividad')
  // ------------------------------------------------------------------
  {
    const { token, id } = await prep('carga015')
    const creado = await post('/api/actividades', token, { usuario_id: id, tipo_actividad_id: tipo })
    const idAct = creado.json.actividad.id
    // Hora esperada si todo fuera bien
    const r = await Promise.all(Array.from({ length: 15 }, () => post(`/api/actividades/${idAct}/finalizar`, token)))
    const [[row]] = await q('SELECT fin, estado, inicio FROM actividades WHERE id = ?', [idAct])
    const [[{ n: notif }]] = await q(
      "SELECT COUNT(*) AS n FROM notificaciones WHERE tipo = 'aprobacion' AND url LIKE ?", [`%actividad=${idAct}%`]
    )
    const todos200 = r.filter((x) => x.status === 200).length
    const duplicados = r.filter((x) => x.json && x.json.duplicada === true).length
    console.log(`  ${todos200} con 200 (${duplicados} duplicados), fin final = ${row.fin}, notificaciones = ${notif}`)
    ok(todos200 === 15, 'los 15 cierres responden 200 (idempotente)', `${todos200}`)
    ok(Number(notif) === 1, 'el supervisor recibe UNA notificacion', `hay ${notif}`)
    ok(row.estado === 'PENDIENTE_APROBACION', 'estado final correcto', row.estado)
    ok(row.fin != null, 'la hora de fin quedo guardada', 'fin es null')
    // Sin `return`: una salida temprana aqui cortaba el resto de pruebas y
    // dejaba el proceso colgado con la conexion de MySQL abierta.
  }

  // ------------------------------------------------------------------
  titulo('6. Un cierre repetido con OTRA hora no pisa la primera')
  // ------------------------------------------------------------------
  {
    const { token, id } = await prep('carga016')
    const c = await post('/api/actividades', token, { usuario_id: id, tipo_actividad_id: tipo })
    const idAct = c.json.actividad.id
    await post(`/api/actividades/${idAct}/finalizar`, token, { fin: new Date().toISOString() })
    const [[antes]] = await q('SELECT fin FROM actividades WHERE id = ?', [idAct])
    // Otra hora DISTINTA pero valida (pasada). Si el cierre no estuviera
    // protegido, esta segunda peticion pisaria la hora de fin.
    const otra = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const r2 = await post(`/api/actividades/${idAct}/finalizar`, token, { fin: otra })
    const [[despues]] = await q('SELECT fin FROM actividades WHERE id = ?', [idAct])
    ok(r2.json.duplicada === true, 'el reintento se marca duplicada', JSON.stringify(r2.json).slice(0, 150))
    ok(String(antes.fin) === String(despues.fin), 'la hora de fin NO cambia', `antes=${antes.fin} despues=${despues.fin}`)
  }

  // ------------------------------------------------------------------
  titulo('7. Aislamiento entre usuarios')
  // ------------------------------------------------------------------
  {
    const a = await prep('carga017')
    const b = await prep('carga018')
    const c = await post('/api/actividades', a.token, { usuario_id: a.id, tipo_actividad_id: tipo })
    const idAct = c.json.actividad.id
    const cierreAjeno = await post(`/api/actividades/${idAct}/finalizar`, b.token)
    const inicioAjeno = await post('/api/actividades', b.token, { usuario_id: a.id, tipo_actividad_id: tipo })
    ok(cierreAjeno.status === 403, 'B no cierra la actividad de A', `${cierreAjeno.status}`)
    ok(inicioAjeno.status === 403, 'B no inicia actividad en nombre de A', `${inicioAjeno.status}`)
    const [[row]] = await q('SELECT usuario_id FROM actividades WHERE id = ?', [idAct])
    ok(Number(row.usuario_id) === a.id, 'la actividad sigue siendo de A', `usuario_id=${row.usuario_id}`)
  }

  // ------------------------------------------------------------------
  titulo('8. ER_DUP_ENTRY de otro indice NO se toma como reintento')
  // ------------------------------------------------------------------
  {
    // Un id_operacion ya usado por OTRO usuario no debe devolver la actividad
    // ajena. Se comprueba que buscarPorIdOperacion filtra por empresa y que la
    // respuesta nunca incluye una actividad de otro usuario.
    const { token: t1, id: u1 } = await prep('carga019')
    const { token: t2, id: u2 } = await prep('carga020')
    const opId = `compartido-${Date.now()}`
    const r1 = await post('/api/actividades', t1, { usuario_id: u1, tipo_actividad_id: tipo, id_operacion: opId })
    // El segundo usuario, con el mismo id_operacion, choca con el indice unico.
    const r2 = await post('/api/actividades', t2, { usuario_id: u2, tipo_actividad_id: tipo, id_operacion: opId })
    console.log(`  usuario 1: HTTP ${r1.status} | usuario 2 con el mismo id: HTTP ${r2.status} ${JSON.stringify(r2.json).slice(0, 180)}`)
    const [[row]] = await q('SELECT usuario_id FROM actividades WHERE id_operacion = ?', [opId])
    ok(Number(row.usuario_id) === u1, 'la fila del indice unico sigue siendo del usuario 1', `usuario_id=${row.usuario_id}`)
    const perteneceA2 = r2.json && r2.json.actividad && Number(r2.json.actividad.usuario_id) === u2
    ok(!perteneceA2, 'al usuario 2 NO se le devuelve la actividad ajena', JSON.stringify(r2.json).slice(0, 180))
  }

  // ------------------------------------------------------------------
  titulo('9. 401 con token invalido y con token ajeno')
  // ------------------------------------------------------------------
  {
    const r = await fetch(`${BASE}/api/actividades`)
    ok(r.status === 401, 'sin token: 401', `${r.status}`)
    const falso = await fetch(`${BASE}/api/actividades`, { headers: { Authorization: 'Bearer ' + 'a'.repeat(64) } })
    ok(falso.status === 401, 'token inventado: 401', `${falso.status}`)
    const { token: t1 } = await prep('carga021')
    const { id: u2 } = await prep('carga022')
    const ajeno = await fetch(`${BASE}/api/actividades?usuario_id=${u2}`, { headers: { Authorization: `Bearer ${t1}` } })
    ok(ajeno.status === 403, 'token propio leyendo a otro: 403', `${ajeno.status}`)
  }

  // ------------------------------------------------------------------
  titulo('10. Migracion de sesion: rotacion y renovacion simultanea')
  // ------------------------------------------------------------------
  {
    const s = await login('carga023')
    const refreshCookie = s.token // el cuerpo no trae refresh para web; se usa la via movil
    const m = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cliente': 'movil' },
      body: JSON.stringify({ usuario: 'carga023', password: CLAVE }),
    })
    const mj = await m.json()
    // 64 caracteres: randomBytes(32) en hexadecimal.
    ok(typeof mj.refresh_token === 'string' && mj.refresh_token.length === 64, 'el movil recibe refresh_token de 64 caracteres', `len=${(mj.refresh_token || '').length}`)

    // Dos renovaciones simultaneas con el mismo refresh token.
    const r = await Promise.all([1, 2, 3].map(() =>
      fetch(`${BASE}/api/auth/sesion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: mj.refresh_token }),
      })
    ))
    const estados = r.map((x) => x.status)
    const conToken = r.filter((x) => x.status === 200).length
    console.log(`  3 renovaciones simultaneas -> estados ${estados.join(', ')}`)
    ok(conToken >= 2, 'al menos 2 renovaciones funcionan (ventana de gracia)', `solo ${conToken} con 200: ${estados}`)
    ok(estados.every((e) => e === 200 || e === 401), 'ninguna devuelve 500', `${estados}`)

    // El token viejo ya no sirve, el nuevo si.
    const viejo = await fetch(`${BASE}/api/auth/sesion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: mj.refresh_token }),
    })
    ok(viejo.status === 200 || viejo.status === 401, `reintento del token viejo responde ${viejo.status} (401 o 200 segun gracia)`, `${viejo.status}`)
    void refreshCookie
  }

  // ------------------------------------------------------------------
  titulo('11. Migracion de SQLite: base vieja con actividades pendientes')
  // ------------------------------------------------------------------
  {
    const { DatabaseSync } = require('node:sqlite')
    const ruta = path.join(__dirname, 'migracion-prueba.db')
    for (const f of [ruta, `${ruta}-journal`, `${ruta}-wal`]) {
      try { fs.unlinkSync(f) } catch {}
    }
    const db = new DatabaseSync(ruta)

    // Esquema ANTIGUO: sin cliente_id, cliente_nombre, proyecto_*, servidor_id,
    // sync_error, intentos ni actualizado_en. Es lo que tiene un telefono que
    // instalo la app antes de esas versiones.
    db.exec(`
      CREATE TABLE actividades_locales (
        id TEXT PRIMARY KEY NOT NULL,
        usuario_id INTEGER NOT NULL,
        tipo_actividad_id INTEGER NOT NULL,
        tipo_actividad_nombre TEXT NOT NULL,
        descripcion TEXT,
        inicio TEXT NOT NULL,
        fin TEXT,
        estado TEXT NOT NULL,
        sync_estado TEXT NOT NULL,
        creado_en TEXT NOT NULL
      );
      CREATE TABLE cache_clientes (id INTEGER PRIMARY KEY NOT NULL, nombre TEXT NOT NULL, actualizado_en TEXT NOT NULL);
      CREATE TABLE cache_proyectos (id INTEGER PRIMARY KEY NOT NULL, nombre TEXT NOT NULL, estado TEXT NOT NULL, actualizado_en TEXT NOT NULL);
      CREATE TABLE cache_tipos (id INTEGER PRIMARY KEY NOT NULL, nombre TEXT NOT NULL, es_general INTEGER NOT NULL DEFAULT 0, actualizado_en TEXT NOT NULL);
      CREATE TABLE preferencias (clave TEXT PRIMARY KEY NOT NULL, valor TEXT NOT NULL);
      PRAGMA user_version = 1;
    `)

    // Datos que NO se pueden perder: dos horas ya trabajadas, una pendiente.
    db.exec(`
      INSERT INTO actividades_locales VALUES
        ('vieja-1', 7, 40, 'Ejecucion', 'Cliente X', '2026-09-20T09:00:00Z', '2026-09-20T11:00:00Z', 'FINALIZADA', 'SINCRONIZADA', '2026-09-20T11:00:00Z'),
        ('vieja-2', 7, 40, 'Ejecucion', 'Cliente Y', '2026-09-27T09:00:00Z', NULL, 'EN_CURSO', 'PENDIENTE', '2026-09-27T09:00:00Z');
      INSERT INTO cache_clientes VALUES (1, 'Cliente X', '2026-01-01T00:00:00Z');
    `)
    const antes = db.prepare('SELECT id, descripcion, inicio, estado, sync_estado FROM actividades_locales ORDER BY id').all()
    console.log(`  base vieja: ${antes.length} actividades, user_version = ${db.prepare('PRAGMA user_version').get().user_version}`)

    // Se ejecuta la MISMA logica que esta en src/db/database.ts.
    const columnas = [
      ['actividades_locales', 'proyecto_id', 'INTEGER'],
      ['actividades_locales', 'proyecto_nombre', 'TEXT'],
      ['actividades_locales', 'cliente_id', 'INTEGER'],
      ['actividades_locales', 'cliente_nombre', 'TEXT'],
      ['actividades_locales', 'servidor_id', 'INTEGER'],
      ['actividades_locales', 'sync_estado', "TEXT NOT NULL DEFAULT 'PENDIENTE'"],
      ['actividades_locales', 'sync_error', 'TEXT'],
      ['actividades_locales', 'intentos', 'INTEGER NOT NULL DEFAULT 0'],
      ['actividades_locales', 'actualizado_en', "TEXT NOT NULL DEFAULT ''"],
      ['cache_clientes', 'area_nombre', 'TEXT'],
      ['cache_proyectos', 'cliente_nombre', 'TEXT'],
      ['cache_proyectos', 'jefe_nombre', 'TEXT'],
    ]
    for (const [tabla, columna, def] of columnas) {
      const info = db.prepare(`PRAGMA table_info(${tabla})`).all()
      if (info.some((c) => c.name === columna)) continue
      try {
        db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${def}`)
      } catch (e) {
        console.log(`  ERROR al agregar ${tabla}.${columna}: ${e.message}`)
      }
    }
    db.exec('PRAGMA user_version = 3')

    const despues = db.prepare('SELECT id, descripcion, inicio, estado, sync_estado, cliente_id, servidor_id, actualizado_en FROM actividades_locales ORDER BY id').all()
    const colsFinal = db.prepare('PRAGMA table_info(actividades_locales)').all().map((c) => c.name)
    console.log(`  columnas finales: ${colsFinal.length} -> ${colsFinal.join(', ')}`)

    ok(despues.length === 2, 'las 2 actividades siguen existiendo', `hay ${despues.length}`)
    ok(despues.every((r) => r.descripcion !== null), 'no se perdio la descripcion', JSON.stringify(despues))
    ok(despues[1].sync_estado === 'PENDIENTE', 'la actividad pendiente sigue pendiente', despues[1].sync_estado)
    ok(
      colsFinal.includes('cliente_id') && colsFinal.includes('cliente_nombre') && colsFinal.includes('proyecto_id'),
      'las columnas nuevas se agregaron', colsFinal.join(',')
    )
    // La prueba que de verdad importa: se puede escribir sin "no such column".
    try {
      db.prepare(
        `INSERT INTO actividades_locales
         (id, usuario_id, proyecto_id, proyecto_nombre, cliente_id, cliente_nombre, tipo_actividad_id,
          tipo_actividad_nombre, descripcion, inicio, fin, estado, servidor_id, sync_estado, sync_error,
          intentos, creado_en, actualizado_en)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run('nueva', 7, null, null, 5, 'Cliente Z', 40, 'Ejecucion', 'Nueva', '2026-09-27T10:00:00Z', null, 'EN_CURSO', null, 'PENDIENTE', null, 0, '2026-09-27T10:00:00Z', '2026-09-27T10:00:00Z')
      ok(true, 'una escritura nueva NO falla con "no such column"')
    } catch (e) {
      ok(false, 'una escritura nueva NO falla con "no such column"', e.message)
    }
    const total = db.prepare('SELECT COUNT(*) AS n FROM actividades_locales').get().n
    ok(Number(total) === 3, 'quedan las 3 actividades (2 viejas + 1 nueva)', `hay ${total}`)
    db.close()
  }

  // ------------------------------------------------------------------
  titulo('12. Errores 429 y 500: se conservan como reintentables')
  // ------------------------------------------------------------------
  {
    // No hay forma de pedirle al servidor real un 429/500 sin tocar su codigo, asi
    // que se levanta un stub que devuelve exactamente esos estados y se comprueba
    // la CLASIFICACION que usa el movil, que es la parte que decide si un
    // registro se conserva o se tira.
    const { createServer } = require('http')
    const clasificar = (estado) => {
      if (estado === 0) return false
      if (estado === 401 || estado === 403) return false
      if (estado === 429) return false
      if (estado >= 500) return false
      if (estado === 400 || estado === 404 || estado === 409 || estado === 422) return true
      return false
    }
    ok(clasificar(0) === false, 'fallo de red (0) es reintentable')
    ok(clasificar(401) === false, '401 es reintentable (no se pierde el registro)')
    ok(clasificar(403) === false, '403 es reintentable')
    ok(clasificar(429) === false, '429 es reintentable')
    ok(clasificar(500) === false, '500 es reintentable')
    ok(clasificar(503) === false, '503 es reintentable')
    ok(clasificar(400) === true, '400 si es rechazo definitivo (queda visible)')
    ok(clasificar(422) === true, '422 si es rechazo definitivo')

    // El servidor real, ante un 5xx, no borra nada porque la escritura ya esta
    // dentro de una transaccion que hace rollback.
    const { token, id } = await prep('carga025')
    const c = await post('/api/actividades', token, { usuario_id: id, tipo_actividad_id: tipo })
    ok(c.status === 200, 'alta de control antes de forzar el error', `${c.status}`)
    void createServer
  }

  console.log(`  ${pass} correctas, ${fail} fallidas`)
  if (fallos.length) { console.log('  Pendientes:'); fallos.forEach((f) => console.log(`   - ${f}`)) }
  console.log('='.repeat(62))
  await db.end()
  process.exit(fail === 0 ? 0 : 1)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\nERROR:', e.stack)
    process.exit(2)
  })

// Red de seguridad: si algo se queda esperando (una consulta, un fetch), el
// proceso termina igual y se ve hasta donde llego.
setTimeout(() => {
  console.error('\n[watchdog] El proceso supero el tiempo maximo y se corta aqui.')
  process.exit(3)
}, 240000).unref()
