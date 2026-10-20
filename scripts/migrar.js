const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'sql', 'migraciones')

async function main() {
  const host = process.env.DB_HOST || process.env.TEST_DB_HOST
  const port = Number(process.env.DB_PORT || process.env.TEST_DB_PORT || 3306)
  const user = process.env.DB_USER || process.env.TEST_DB_USER
  const password = process.env.DB_PASSWORD || process.env.TEST_DB_PASSWORD
  const database = process.env.DB_NAME || process.env.TEST_DB_NAME

  if (!host || !user || password == null || !database) {
    console.error('Faltan variables DB_* o TEST_DB_* para ejecutar las migraciones.')
    process.exit(1)
  }

  const conn = await mysql.createConnection({
    host, port, user, password, database, multipleStatements: true,
  })

  await conn.query(`CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
    id int unsigned NOT NULL AUTO_INCREMENT,
    nombre varchar(255) NOT NULL,
    aplicada_en datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_migraciones_nombre (nombre)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  const [aplicadas] = await conn.query('SELECT nombre FROM migraciones_aplicadas')
  const ya = new Set(aplicadas.map((r) => r.nombre))

  const archivos = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const archivo of archivos) {
    if (ya.has(archivo)) {
      console.log(`[skip] ${archivo}`)
      continue
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8')
    console.log(`[run]  ${archivo}`)
    try {
      await conn.beginTransaction()
      await conn.query(sql)
      await conn.query('INSERT INTO migraciones_aplicadas (nombre) VALUES (?)', [archivo])
      await conn.commit()
    } catch (e) {
      await conn.rollback()
      console.error(`Error en ${archivo}:`, e.message)
      await conn.end()
      process.exit(1)
    }
  }

  await conn.end()
  console.log('Migraciones completadas.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
PY