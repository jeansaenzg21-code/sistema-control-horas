// Configuracion comun de la base de datos de pruebas.
//
// Las pruebas NUNCA usan credenciales escritas en el codigo. Toman los datos
// de las variables de entorno TEST_DB_* y fallan con un mensaje claro si falta
// alguna, para que nadie se deje una clave en el repositorio por accidente.
function requerir(nombre) {
  const valor = process.env[nombre]
  if (valor == null || String(valor).trim() === '') {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Definela (por ejemplo en un archivo .env) antes de ejecutar las pruebas.`
    )
  }
  return String(valor).trim()
}

module.exports = {
  host: requerir('TEST_DB_HOST'),
  port: Number(process.env.TEST_DB_PORT || 3306),
  user: requerir('TEST_DB_USER'),
  password: requerir('TEST_DB_PASSWORD'),
  database: requerir('TEST_DB_NAME'),
}