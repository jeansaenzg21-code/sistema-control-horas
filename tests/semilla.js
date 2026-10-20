// Semilla de datos SINTETICOS para la base de pruebas `paredescano_test`.
// Nunca escribe en `paredescano` (la base real). Los catálogos se copian desde
// la base real para que el código ejercite exactamente las mismas rutas.
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')

const _cfg = require('./config.js')
const ORIGEN = { ..._cfg, database: process.env.DB_NAME || 'paredescano' }
const PRUEBA = _cfg

const USUARIOS = Number(process.env.USUARIOS || 200)
const ACTIVIDADES = Number(process.env.ACTIVIDADES || 50000)
const CONTRASENA = 'Prueba123!'

let paso = 0
function announces(msg) {
  paso++
  console.log(`[${paso}] ${msg}`)
}

async function main() {
  const origen = await mysql.createConnection(ORIGEN)
  const prueba = await mysql.createConnection(PRUEBA)

  announces('copiando empresa')
  const [empresas] = await origen.query(
    'SELECT id, nombre, descripcion, pais, ciudad FROM empresa ORDER BY id LIMIT 1'
  )
  if (!empresas.length) throw new Error('La base real no tiene empresas.')
  const [insEmp] = await prueba.query(
    'INSERT INTO empresa (nombre, descripcion, pais, ciudad) VALUES (?, ?, ?, ?)',
    ['Paredes Cano (PRUEBA)', empresas[0].descripcion, empresas[0].pais, empresas[0].ciudad]
  )
  // El AUTO_INCREMENT viene del volcado del esquema, así que el id asignado no
  // tiene por qué coincidir con el de la base real: se usa el que devolvio MySQL.
  const empresaId = insEmp.insertId

  announces('copiando areas')
  const [areasOrigen] = await origen.query('SELECT id, empresa_id, nombre, descripcion FROM areas ORDER BY id')
  if (!areasOrigen.length) throw new Error('La base real no tiene areas.')
  // En la base real hay areas con el mismo nombre en empresas distintas; al
  // meterlas todas en una sola empresa de prueba el nombre dejaria de ser único.
  // Se sufija el id de origen para respetar el indice unico (empresa_id, nombre).
  await prueba.query(
    'INSERT INTO areas (empresa_id, nombre, descripcion, activo) VALUES ?',
    [areasOrigen.map((a) => [empresaId, `${a.nombre} [prueba ${a.id}]`, a.descripcion, 1])]
  )
  const [areas] = await prueba.query('SELECT id FROM areas ORDER BY id LIMIT 1')
  const areaId = areas[0].id

  announces('copiando tipos_actividad')
  const [tiposOrigen] = await origen.query(
    'SELECT nombre, es_general, activo FROM tipos_actividad ORDER BY id'
  )
  await prueba.query('INSERT INTO tipos_actividad (nombre, es_general, activo) VALUES ?', [
    tiposOrigen.map((t) => [t.nombre, t.es_general, t.activo]),
  ])
  const [tipos] = await prueba.query(
    'SELECT id FROM tipos_actividad WHERE es_general = 1 AND activo = 1 ORDER BY id LIMIT 1'
  )
  if (!tipos.length) throw new Error('No hay ningun tipo de actividad general activo.')
  const tipoId = tipos[0].id

  announces('creando usuarios sinteticos')
  const hash = await bcrypt.hash(CONTRASENA, 10)
  const filas = []
  for (let i = 1; i <= USUARIOS; i++) {
    const n = String(i).padStart(3, '0')
    filas.push([`Carga Prueba ${n}`, `carga${n}`, `carga${n}@prueba.invalid`, hash, 'PERSONAL', areaId])
  }
  filas.push(['Supervisor Prueba', 'supervisor', 'supervisor@prueba.invalid', hash, 'SUPERVISOR', areaId])
  filas.push(['Administracion Prueba', 'administracion', 'administracion@prueba.invalid', hash, 'ADMINISTRACION', areaId])
  await prueba.query(
    'INSERT INTO usuarios (nombre, usuario, correo, password_hash, rol, area_id) VALUES ?',
    [filas]
  )

  announces(`generando ${ACTIVIDADES} actividades historicas`)
  const [usuarios] = await prueba.query('SELECT id FROM usuarios WHERE rol = ? ORDER BY id', ['PERSONAL'])
  const LOTE = 5000
  let insertados = 0
  const base = Date.UTC(2025, 0, 1)
  while (insertados < ACTIVIDADES) {
    const n = Math.min(LOTE, ACTIVIDADES - insertados)
    const rows = []
    for (let i = 0; i < n; i++) {
      const u = usuarios[(insertados + i) % usuarios.length]
      const inicio = new Date(base + Math.floor(Math.random() * 300) * 86400000 + Math.floor(Math.random() * 28800) * 1000)
      const fin = new Date(inicio.getTime() + (900 + Math.floor(Math.random() * 9000)) * 1000)
      rows.push([u.id, tipoId, 'Registro sintetico de carga', 1, inicio, fin, 'APROBADA'])
    }
    await prueba.query(
      'INSERT INTO actividades (usuario_id, tipo_actividad_id, descripcion, facturable, inicio, fin, estado) VALUES ?',
      [rows]
    )
    insertados += n
  }

  const [[ag]] = await prueba.query('SELECT COUNT(*) AS n FROM actividades')
  const [[ug]] = await prueba.query('SELECT COUNT(*) AS n FROM usuarios')
  console.log(`\nOK  usuarios=${ug.n}  actividades=${ag.n}`)
  console.log(`Acceso de pruebas:  carga001 / ${CONTRASENA}`)
  console.log(`                    supervisor / ${CONTRASENA}`)
  console.log(`                    administracion / ${CONTRASENA}`)

  await origen.end()
  await prueba.end()
}

main().catch((e) => {
  console.error(`FALLO en el paso ${paso}: ${e.message}`)
  process.exit(1)
})
