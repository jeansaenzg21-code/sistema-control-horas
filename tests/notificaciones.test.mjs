// Pruebas de regresión para /api/notificaciones.
//
// Cubren el defecto corregido (POST con `mensaje` válido devolvía 400), el
// rechazo de mensajes vacíos/ inválidos, la autenticación y los permisos, y el
// funcionamiento del resto de la ruta (listado y marcado como leída).
//
// Son pruebas de INTEGRACIÓN: requieren una instancia de la API en ejecución
// con datos de prueba (ver DEPLOYMENT.md §14 y §16.3). Sin dependencias
// externas: usan el runner nativo `node:test` y `fetch` de Node 20+.
//
// Variables de entorno (todas opcionales):
//   TEST_BASE_URL       URL base de la API     (por defecto http://127.0.0.1:3002)
//   TEST_ADMIN_USER     usuario administrador  (por defecto admin)
//   TEST_ADMIN_PASS     contraseña admin       (por defecto Demo1234!)
//   TEST_USER_USER      usuario normal         (por defecto personal)
//   TEST_USER_PASS      contraseña usuario     (por defecto Demo1234!)
//
// Uso:  node --test tests/notificaciones.test.mjs

import test, { before } from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3002'
const ADMIN = {
  usuario: process.env.TEST_ADMIN_USER ?? 'admin',
  password: process.env.TEST_ADMIN_PASS ?? 'Demo1234!',
}
const USER = {
  usuario: process.env.TEST_USER_USER ?? 'personal',
  password: process.env.TEST_USER_PASS ?? 'Demo1234!',
}

let adminToken
let userToken
let adminId
let userId

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

async function login({ usuario, password }) {
  const res = await api('/api/auth/login', { method: 'POST', body: { usuario, password } })
  assert.equal(res.status, 200, `login de "${usuario}" debería devolver 200 (recibido ${res.status})`)
  assert.ok(res.json?.token, `login de "${usuario}" debería devolver un token`)
  return res.json.token
}

async function idDeSesion(token) {
  const res = await api('/api/auth/session', { token })
  assert.equal(res.status, 200, `sesión debería devolver 200 (recibido ${res.status})`)
  assert.ok(res.json?.usuario?.id, 'la sesión debería incluir el usuario')
  return res.json.usuario.id
}

before(async () => {
  adminToken = await login(ADMIN)
  userToken = await login(USER)
  adminId = await idDeSesion(adminToken)
  userId = await idDeSesion(userToken)
})

test('crea una notificación con mensaje válido y la persiste', async () => {
  const titulo = `Regresión válida ${Date.now()}`
  const mensaje = 'Mensaje de prueba válido'
  const creada = await api('/api/notificaciones', {
    method: 'POST',
    token: adminToken,
    body: { usuario_id: adminId, titulo, mensaje, tipo: 'general', url: '/aprobaciones' },
  })
  assert.equal(creada.status, 200, `POST con mensaje válido debería devolver 200 (recibido ${creada.status})`)
  assert.equal(creada.json?.ok, true)

  const lista = await api(`/api/notificaciones?usuario_id=${adminId}`, { token: adminToken })
  assert.equal(lista.status, 200)
  const encontrada = lista.json.find((n) => n.titulo === titulo)
  assert.ok(encontrada, 'la notificación creada debería aparecer en el listado')
  assert.equal(encontrada.mensaje, mensaje)
})

test('crea una notificación sin mensaje (mensaje opcional)', async () => {
  const titulo = `Regresión sin mensaje ${Date.now()}`
  const creada = await api('/api/notificaciones', {
    method: 'POST',
    token: adminToken,
    body: { usuario_id: adminId, titulo, tipo: 'general' },
  })
  assert.equal(creada.status, 200, `POST sin mensaje debería devolver 200 (recibido ${creada.status})`)
  assert.equal(creada.json?.ok, true)
})

test('trata el mensaje vacío ("") como ausente', async () => {
  const creada = await api('/api/notificaciones', {
    method: 'POST',
    token: adminToken,
    body: { usuario_id: adminId, titulo: `Regresión vacío ${Date.now()}`, mensaje: '' },
  })
  assert.equal(creada.status, 200)
})

test('rechaza un mensaje con solo espacios', async () => {
  const r = await api('/api/notificaciones', {
    method: 'POST',
    token: adminToken,
    body: { usuario_id: adminId, titulo: 'Regresión espacios', mensaje: '   ' },
  })
  assert.equal(r.status, 400)
  assert.match(String(r.json?.error), /mensaje/i)
})

test('rechaza un mensaje que no es texto', async () => {
  const r = await api('/api/notificaciones', {
    method: 'POST',
    token: adminToken,
    body: { usuario_id: adminId, titulo: 'Regresión no-texto', mensaje: 12345 },
  })
  assert.equal(r.status, 400)
  assert.match(String(r.json?.error), /mensaje/i)
})

test('rechaza un mensaje demasiado largo (> 2000)', async () => {
  const r = await api('/api/notificaciones', {
    method: 'POST',
    token: adminToken,
    body: { usuario_id: adminId, titulo: 'Regresión largo', mensaje: 'a'.repeat(2001) },
  })
  assert.equal(r.status, 400)
  assert.match(String(r.json?.error), /largo/i)
})

test('rechaza la creación sin autenticación', async () => {
  const r = await api('/api/notificaciones', {
    method: 'POST',
    body: { usuario_id: adminId, titulo: 'Regresión sin token' },
  })
  assert.equal(r.status, 401)
})

test('rechaza el listado sin autenticación', async () => {
  const r = await api(`/api/notificaciones?usuario_id=${adminId}`)
  assert.equal(r.status, 401)
})

test('un usuario normal no puede notificar a otro usuario', async () => {
  const r = await api('/api/notificaciones', {
    method: 'POST',
    token: userToken,
    body: { usuario_id: adminId, titulo: 'Regresión ajena' },
  })
  assert.equal(r.status, 403)
})

test('un usuario normal no puede listar notificaciones de otro usuario', async () => {
  const r = await api(`/api/notificaciones?usuario_id=${adminId}`, { token: userToken })
  assert.equal(r.status, 403)
})

test('un usuario normal puede crear una notificación para sí mismo', async () => {
  const titulo = `Regresión propia ${Date.now()}`
  const creada = await api('/api/notificaciones', {
    method: 'POST',
    token: userToken,
    body: { usuario_id: userId, titulo, mensaje: 'para mí', tipo: 'general' },
  })
  assert.equal(creada.status, 200)
  assert.equal(creada.json?.ok, true)
})

test('marca todas las notificaciones como leídas (PUT marcar_todas)', async () => {
  const r = await api('/api/notificaciones', {
    method: 'PUT',
    token: userToken,
    body: { usuario_id: userId, marcar_todas: true },
  })
  assert.equal(r.status, 200)
  assert.equal(r.json?.ok, true)
})

test('un usuario normal no puede marcar las de otro usuario', async () => {
  const r = await api('/api/notificaciones', {
    method: 'PUT',
    token: userToken,
    body: { usuario_id: adminId, marcar_todas: true },
  })
  assert.equal(r.status, 403)
})
