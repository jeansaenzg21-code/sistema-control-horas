import mysql from 'mysql2/promise'

const enProduccion = process.env.NODE_ENV === 'production'

function valorEntorno(nombre: string, valorLocal: string): string {
  const valor = process.env[nombre]
  if (enProduccion && !valor) {
    throw new Error(`Falta la variable de entorno ${nombre}`)
  }
  return valor || valorLocal
}

const pool = mysql.createPool({
  host: valorEntorno('DB_HOST', 'localhost'),
  port: Number(process.env.DB_PORT) || 3306,
  user: valorEntorno('DB_USER', 'root'),
  password: valorEntorno('DB_PASSWORD', ''),
  database: valorEntorno('DB_NAME', 'paredescano'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

export default pool
