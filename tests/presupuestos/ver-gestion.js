// Comprueba que la agregacion de la vista de gestion ejecuta TODO su SQL contra
// la base real. Es la unica forma de cazar el tipo de fallo que acabo de
// corregir (columnas inexistentes) sin depender del navegador y de una sesion.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = new Map()
function cargarTs(relativa) {
  const absoluta = path.resolve(relativa)
  if (cache.has(absoluta)) return cache.get(absoluta)
  const js = ts.transpileModule(fs.readFileSync(absoluta, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const Module = require('node:module')
  const mod = new Module(absoluta, null)
  mod.filename = absoluta
  mod.paths = Module._nodeModulePaths(path.dirname(absoluta))
  cache.set(absoluta, mod.exports)
  const req = mod.require.bind(mod)
  mod.require = (p) => (p.startsWith('@/') ? cargarTs(path.join(process.cwd(), p.slice(2) + '.ts')) : req(p))
  mod._compile(js, absoluta)
  return mod.exports
}

async function main() {
  const envTxt = fs.readFileSync('.env.local', 'utf8')
  for (const l of envTxt.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  }
  const { obtenerGestionProyecto } = cargarTs('lib/presupuestos/gestion.ts')
  const proyectoId = Number(process.argv[2] ?? 14)

  const g = await obtenerGestionProyecto(proyectoId, Number(process.argv[3] ?? 55), {
    puedeVerImportes: true,
    puedeGestionar: true,
    esAdmin: true,
  })

  console.log('proyecto   :', g.proyecto.nombre)
  console.log('  cliente  :', g.proyecto.cliente, '| area:', g.proyecto.area, '| lider:', g.proyecto.lider)
  console.log('  estado   :', g.proyecto.estado, '| inicio:', g.proyecto.fechaInicio, '(null = sin confirmar)')
  console.log('presupuestos:', g.presupuestos.map((p) => `v${p.version} ${p.estado}`).join(', ') || 'ninguno')
  console.log('disponibles para vincular:', g.presupuestosDisponibles.length)
  const i = g.indicadores
  console.log('indicadores: contratadas=%s propuestas=%s registradas=%s aprobadas=%s disponibles=%s desv=%s (%s%%) fechas=%s',
    i.horasContratadas, i.horasPropuestas, i.horasRegistradas, i.horasAprobadas,
    i.horasDisponibles, i.desviacionHoras, i.desviacionPorcentaje, i.cronogramaConFechas)
  console.log('equipo     :', g.equipo.length, 'integrantes')
  for (const x of g.equipo) {
    console.log(`   ${x.nombre.padEnd(34)} asig=${x.asignado} reg=${x.registrado} disp=${x.disponible} (${x.porcentaje}%)`)
  }
  console.log('servicios  :', g.servicios.length)
  for (const s of g.servicios) {
    console.log(`   ${s.origen.padEnd(14)} ${String(s.horas).padStart(7)} h  activo=${s.activo ? 'si' : 'no'}  saldo=${s.saldo === null ? 'n/d' : s.saldo}  ${s.nombre.slice(0, 42)}`)
  }
  console.log('sin resolver:', g.sinResolver.length)
  for (const a of g.sinResolver) {
    console.log(`   ${String(a.horas).padStart(6)} h  ${(a.etiqueta ?? '(sin persona)').padEnd(16)} ${a.motivo ? '· ' + String(a.motivo).slice(0, 60) : ''}`)
  }
  console.log('planificacion:', g.planificacion.length, 'sub-etapas,', g.planificacion.reduce((t, p) => t + p.horas, 0), 'h')
  console.log('   vinculados a servicio:', g.planificacion.filter((p) => p.servicioId).length, '/', g.planificacion.length)
  console.log('desviaciones :', g.desviaciones.length)
  console.log('permisos     :', JSON.stringify(g.permisos))

  const { default: pool } = cargarTs('lib/db.ts')
  await pool.end()
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
