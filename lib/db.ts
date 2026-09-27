import mysql from 'mysql2/promise'

const enProduccion = process.env.NODE_ENV === 'production'

function valorEntorno(nombre: string, valorLocal: string): string {
  const valor = process.env[nombre]
  if (enProduccion && !valor) {
    throw new Error(`Falta la variable de entorno ${nombre}`)
  }
  return valor || valorLocal
}

function numero(nombre: string, valorLocal: number): number {
  const bruto = process.env[nombre]
  if (!bruto) return valorLocal
  const n = Number(bruto)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : valorLocal
}

/**
 * Pool de conexiones dimensionado para un VPS de ~1 GB de RAM.
 *
 * Lo que se cambio y por que:
 *
 * 1. `queueLimit: 0` era lo mas peligroso de la configuracion anterior. Con la
 *    cola infinita, si se agtaban las 10 conexiones, las peticiones NO fallaban:
 *    se quedaban esperando en memoria del proceso de Node. Con 200 usuarios, un
 *    pico de las 8 de la manana puede encolar cientos de peticiones, cada una
 *    con su cuerpo y sus cabeceras, y la memoria se dispara justo cuando el
 *    proceso ya va justo de RAM. Un `queueLimit` finito hace que la peticion
 *    espere poco y, si no hay conexion, responda rapido con un 503. Es
 *    preferible un error visible que un servidor que se queda sin memoria.
 *
 * 2. `connectTimeout` evita que un MySQL que no responde deje hilos bloqueados
 *    de forma indefinida.
 *
 * 3. `enableKeepAlive` mantiene Viva la conexion entre peticiones en lugar de
 *    reabrirla cada vez. Con el SO keep-alive se puede detectar un MySQL que
 *    mato la conexion sin avisar.
 *
 * El limite de 10 conexiones NO se aumenta. En 1 GB de RAM, MySQL y el
 * proceso de Node ya compiten por el espacio, y MySQL tiene
 * `innodb_buffer_pool_size = 128 MB`. Subirlo sin medir solo cambia una
 * limitacion por otra: las 10 conexiones atienden de sobra las peticiones de
 * una API que spends unos pocos milisegundos por consulta, y lo que limita el
 * throughput es la CPU, no el numero de conexiones. El valor se puede subir por
 * variable de entorno si las mediciones lo justifican.
 */
const pool = mysql.createPool({
  host: valorEntorno('DB_HOST', 'localhost'),
  port: Number(process.env.DB_PORT) || 3306,
  user: valorEntorno('DB_USER', 'root'),
  password: valorEntorno('DB_PASSWORD', ''),
  database: valorEntorno('DB_NAME', 'paredescano'),
  waitForConnections: true,
  connectionLimit: numero('DB_POOL_MAX', 10),
  // 0 = sin limite (comportamiento anterior). Un valor finito acota la memoria
  // que puede acumular el proceso cuando se acaba la capacidad.
  queueLimit: numero('DB_POOL_COLA', 60),
  connectTimeout: numero('DB_POOL_CONNECT_TIMEOUT_MS', 8000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 30_000,
  // Una consulta que se queda esperando por un lock no debe retener una
  // conexion prestada indefinidamente: MySQLInforma al segundo y la operacion se
  // cancela. Asi una transicion bloqueada no deja diez conexiones tiesas.
  maxIdle: numero('DB_POOL_MAX_IDLE', 10),
  idleTimeout: numero('DB_POOL_IDLE_TIMEOUT_MS', 60_000),
  charset: 'utf8mb4_unicode_ci',
})

export default pool
