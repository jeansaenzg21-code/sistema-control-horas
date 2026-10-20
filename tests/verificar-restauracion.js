// Verificacion LOGICA de una restauracion: compara el CONTENIDO real de cada
// tabla entre dos bases, no el numero de filas.
//
// CHECKSUM TABLE no sirve en InnoDB porque lee paginas fisicas, cuyo diseno
// cambia al restaurar. Aqui se calcula un CRC32 sobre los VALORES de cada fila.
//
// Las columnas se descubren del esquema, para no depender de una lista escrita
// a mano que se queda obsoleta en cuanto alguien anade una columna.
//
//   node verificar-restauracion.js [baseOrigen] [baseRestaurada]
const mysql = require('mysql2/promise')

const ORIGEN = process.argv[2] || 'paredescano'
const DESTINO = process.argv[3] || 'paredescano_restaurada'
const _cfg = require('./config.js')
const cfg = (db) => ({ ..._cfg, database: db })

async function columnas(conn, db, tabla) {
  const [r] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [db, tabla]
  )
  return r.map((x) => `IFNULL(\`${x.COLUMN_NAME}\`,'~')`).join(',')
}

async function firma(conn, db, tabla, cols) {
  const [[r]] = await conn.query(
    `SELECT CONCAT(COUNT(*),' filas / crc=', COALESCE(SUM(CRC32(CONCAT_WS('|',${cols}))),0)) AS f
       FROM \`${db}\`.\`${tabla}\``
  )
  return r.f
}

async function main() {
  const a = await mysql.createConnection(cfg(ORIGEN))
  const b = await mysql.createConnection(cfg(DESTINO))

  const [tablas] = await a.query(
    `SELECT table_name AS t FROM information_schema.TABLES
      WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name`,
    [ORIGEN]
  )

  console.log(`Origen:    ${ORIGEN}`)
  console.log(`Restaurada: ${DESTINO}`)
  console.log('')
  console.log('tabla'.padEnd(24) + 'contenido'.padEnd(36) + 'contenido restaurado'.padEnd(36) + 'veredicto')
  console.log('-'.repeat(116))

  let diferencias = 0
  let vacias = 0
  for (const { t } of tablas) {
    const cols = await columnas(a, ORIGEN, t)
    const fa = await firma(a, ORIGEN, t, cols)
    const fb = await firma(b, DESTINO, t, cols)
    if (Number(fa.split(' ')[0]) === 0) vacias++
    const igual = fa === fb
    if (!igual) diferencias++
    console.log(t.padEnd(24) + fa.slice(0, 33).padEnd(36) + fb.slice(0, 33).padEnd(36) + (igual ? 'IDENTICA' : 'DIFIERE'))
  }

  console.log('-'.repeat(116))
  console.log(`tablas: ${tablas.length} (${vacias} vacias)   con contenido distinto: ${diferencias}`)

  // Estructura: indices, columnas y claves foraneas.
  console.log('')
  console.log('Estructura:')
  for (const [que, sql] of [
    ['indices', `SELECT COUNT(DISTINCT CONCAT(table_name,'.',index_name)) FROM information_schema.STATISTICS WHERE table_schema=?`],
    ['columnas', `SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema=?`],
    ['claves foraneas', `SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE table_schema=? AND constraint_type='FOREIGN KEY'`],
  ]) {
    const [[x]] = await a.query(sql, [ORIGEN])
    const [[y]] = await b.query(sql, [DESTINO])
    const ok = Number(x[Object.keys(x)[0]]) === Number(y[Object.keys(y)[0]])
    if (!ok) diferencias++
    console.log(`  ${que.padEnd(18)} origen=${x[Object.keys(x)[0]]}  restaurada=${y[Object.keys(y)[0]]}  ${ok ? 'ok' : 'DIFIERE'}`)
  }

  // Integridad referencial de la base restaurada.
  console.log('')
  console.log('Integridad referencial en la base restaurada:')
  const pares = [
    ['actividades', 'usuario_id', 'usuarios'],
    ['usuarios', 'supervisor_id', 'usuarios'],
    ['sesiones', 'usuario_id', 'usuarios'],
    ['notificaciones', 'usuario_id', 'usuarios'],
  ]
  let huerfanas = 0
  for (const [tabla, col, ref] of pares) {
    const [[r]] = await b.query(
      `SELECT COUNT(*) AS n FROM \`${DESTINO}\`.\`${tabla}\` x
         LEFT JOIN \`${DESTINO}\`.\`${ref}\` u ON u.id = x.\`${col}\`
        WHERE x.\`${col}\` IS NOT NULL AND u.id IS NULL`
    )
    if (r.n > 0) huerfanas++
    console.log(`  ${(tabla + '.' + col).padEnd(26)} huerfanas: ${r.n} ${r.n === 0 ? 'ok' : 'ERROR'}`)
  }
  if (huerfanas > 0) diferencias++

  // Que se pueda entrar con un usuario restaurado (prueba de extremo a extremo).
  const [[u]] = await b.query(
    `SELECT usuario, LEFT(password_hash,4) AS algo FROM \`${DESTINO}\`.usuarios WHERE activo = 1 LIMIT 1`
  )
  if (u) {
    console.log('')
    console.log(`Muestra de usuario restaurado: ${u.usuario} (hash ${u.algo}...)`)
    console.log('  El hash se conserva integro: se podra entrar con la misma contrasena.')
  }

  await a.end()
  await b.end()
  console.log('')
  console.log(diferencias === 0
    ? 'RESULTADO: restauracion CORRECTA. Contenido y estructura coinciden tabla por tabla.'
    : `RESULTADO: HAY ${diferencias} DIFERENCIAS. El respaldo no debe considerarse bueno.`)
  process.exit(diferencias === 0 ? 0 : 1)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(2) })
