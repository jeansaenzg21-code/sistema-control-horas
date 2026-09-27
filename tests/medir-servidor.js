// Medidor del SERVIDOR durante la carga. Se ejecuta en la maquina que se quiere
// medir (no en la que genera la carga), en paralelo con carga.js.
//
//   node medir-servidor.js --nivel 50 --salida metricas-50.json
//
// Se ejecuta por SSH en el servidor objetivo:
//   ssh usuario@IP 'cd ~/pruebas && node medir-servidor.js --nivel 50'
//
// Detiene la prueba si el sistema entra en terreno peligroso, para no dejar el
// VPS colgado ni la base en un estado inconsistente.
const { execSync } = require('child_process')
const fs = require('fs')

const args = process.argv.slice(2)
function opt(n, d) { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const NIVEL = Number(opt('nivel', 25))
const INTERVALO = Number(opt('intervalo', 5)) * 1000
const SALIDA = opt('salida', `metricas-nivel-${NIVEL}.json`)
const DURACION_MAX = Number(opt('max', 1800)) * 1000

// CRITERIOS DE INTERRUPCION. Estos son los umbrales, nolos que se
// esperan: en un VPS de 1 GB, el OOM killer no avisa antes de matar el proceso.
const UMBRAL = {
  swapUsadoMB: 400,      // swap alta y subiendo = la RAM no da
  cargaCPU: 4,           // el servidor esta saturado = nada avanza
  ratioSwaps: 300,       //放送 salidas/entradas de swap por segundo
  mysqlDemasiadas: 90,   // conexiones MySQL cerca del max_connections
  rssNodeMB: 700,        // el proceso Node cerca del limite de RAM
}

function cmd(c) {
  try { return execSync(c, { encoding: 'utf8', timeout: 8000 }).trim() } catch { return '' }
}

function leer() {
  const [memAvailable, , loadavg] = cmd(
    "awk '/MemAvailable/{print $2}' /proc/meminfo; awk '/SwapFree/{print $2}' /proc/meminfo; awk '{print $1}' /proc/loadavg"
  ).split('\n')

  const vm = cmd("vmstat 1 2 | tail -1").split(/\s+/)
  const pids = cmd("ps -eo pid,rss,comm --no-headers")
  let nodoRSS = 0
  for (const l of pids.split('\n')) {
    if (/next-server|node/i.test(l)) nodoRSS += Number(l.trim().split(/\s+/)[1] || 0)
  }
  const mysqldRSS = pids.split('\n').filter((l) => /mysqld/.test(l))
    .reduce((s, l) => s + Number(l.trim().split(/\s+/)[1] || 0), 0)

  const conns = Number(cmd(
    `mysql -N -B -e "SHOW STATUS LIKE 'Threads_connected'" 2>/dev/null | awk '{print $2}'`
  ) || 0)
  const maxConns = Number(cmd(
    `mysql -N -B -e "SHOW VARIABLES LIKE 'max_connections'" 2>/dev/null | awk '{print $2}'`
  ) || 151)

  return {
    t: new Date().toISOString(),
    load1: Number((loadavg || 0)),
    memAvailableMB: Math.round((Number(memAvailable) || 0) / 1024),
    swapOcupadaMB: Number(cmd("awk '/SwapTotal/{t=$2}/SwapFree/{f=$2}END{print int((t-f)/1024)}' /proc/meminfo") || 0),
    swapInPorSeg: Number(vm[6] || 0),
    swapOutPorSeg: Number(vm[7] || 0),
    cpuOcioso: Number(vm[14] || 0),
    rssNodeMB: Math.round(nodoRSS / 1024),
    rssMysqldMB: Math.round(mysqldRSS / 1024),
    mysqlConexiones: conns,
    mysqlMaxConexiones: maxConns,
  }
}

const muestras = []
let paradas = 0
const inicio = Date.now()
let motivo = null

console.log(`Midiendo el servidor durante la prueba de ${NIVEL} usuarios. Ctrl+C para cortar.`)
console.log('Umbrales de parada: ' + JSON.stringify(UMBRAL))
console.log('')

const t = setInterval(() => {
  const m = leer()
  muestras.push(m)

  const critico = []
    if (m.swapOcupadaMB > UMBRAL.swapUsadoMB) critico.push(`swap ${m.swapOcupadaMB} MB`)
  if (m.load1 > UMBRAL.cargaCPU) critico.push(`carga ${m.load1}`)
  if (m.swapInPorSeg > UMBRAL.ratioSwaps || m.swapOutPorSeg > UMBRAL.ratioSwaps) {
    critico.push(`swap activo ${m.swapInPorSeg}/${m.swapOutPorSeg} por seg`)
  }
  if (m.mysqlConexiones > UMBRAL.mysqlDemasiadas) critico.push(`MySQL ${m.mysqlConexiones} conexiones`)
  if (m.rssNodeMB > UMBRAL.rssNodeMB) critico.push(`Node ${m.rssNodeMB} MB`)

  console.log(
    `[${muestras.length}] carga=${m.load1} memLibre=${m.memAvailableMB}MB swap=${m.swapOcupadaMB}MB ` +
    `node=${m.rssNodeMB}MB mysql=${m.rssMysqldMB}MB(${m.mysqlConexiones}/${m.mysqlMaxConexiones} con) ` +
    `cpuOcioso=${m.cpuOcioso}%`
  )

  if (critico.length) {
    paradas++
    console.log(`  AVISO ${paradas}/3: ${critico.join(', ')}`)
    if (paradas >= 3) {
      motivo = critico.join(', ')
      console.log(`\nINTERRUMPIDO por 3 avisos seguidos: ${motivo}`)
      clearInterval(t)
      escribir()
      process.exit(3)
    }
  } else {
    paradas = 0
  }

  if (Date.now() - inicio > DURACION_MAX) {
    console.log('\nDuracion maxima alcanzada.')
    clearInterval(t)
    escribir()
    process.exit(0)
  }
}, INTERVALO)

process.on('SIGINT', () => { clearInterval(t); escribir(); process.exit(0) })

function escribir() {
  const resumen = {
    nivel: NIVEL,
    muestras: muestras.length,
    interrupted: motivo,
    max: {
      carga: Math.max(...muestras.map((m) => m.load1), 0),
      memMinimaLibreMB: Math.min(...muestras.map((m) => m.memAvailableMB).filter(Number.isFinite), Infinity),
      swapMaximaMB: Math.max(...muestras.map((m) => m.swapOcupadaMB || 0), 0),
      nodeMaxMB: Math.max(...muestras.map((m) => m.rssNodeMB), 0),
      mysqldMaxMB: Math.max(...muestras.map((m) => m.rssMysqldMB), 0),
      mysqlConexionesMax: Math.max(...muestras.map((m) => m.mysqlConexiones), 0),
    },
    serie: muestras,
  }
  if (!isFinite(resumen.max.memMinimaLibreMB)) resumen.max.memMinimaLibreMB = null
  fs.writeFileSync(SALIDA, JSON.stringify(resumen, null, 2))
  console.log(`\nMétricas escritas en ${SALIDA}`)
  console.log(`máximos: carga=${resumen.max.carga} node=${resumen.max.nodeMaxMB}MB mysqld=${resumen.max.mysqldMaxMB}MB swap=${resumen.max.swapMaximaMB}MB mysql=${resumen.max.mysqlConexionesMax} conexiones`)
}
