// Matriz de permisos del presupuesto.
//
// Se prueba `decidirGestion`, que es la función pura que decide. No necesita
// base de datos: son las reglas del negocio, y tienen que quedar fijas.
//
// Lo que se verifica aquí es exactamente lo que pidió el negocio:
//   - El LIDER del proyecto puede.
//   - Un Jefe de Área que NO participa, no puede (aunque sea jefe del área).
//   - Un Jefe de Área que SÍ es LIDER, puede.
//   - El ADMIN puede, pero como excepción, y con justificación.
//   - Sin proyecto vinculado solo se puede vincular, y solo el ADMIN.

const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

let pass = 0
let fail = 0
const fallos = []
function ok(c, m, extra) {
  if (c) {
    pass++
    console.log(`  ok    ${m}`)
  } else {
    fail++
    fallos.push(m)
    console.log(`  FALLA ${m}${extra ? `\n          ${extra}` : ''}`)
  }
}
function titulo(t) {
  console.log(`\n${t}\n${'-'.repeat(t.length)}`)
}

function cargarPermisos() {
  const fuente = fs.readFileSync('lib/presupuestos/permisos.ts', 'utf8')
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const Module = require('node:module')
  const mod = new Module('permisos', null)
  mod.paths = Module._nodeModulePaths(path.join(process.cwd(), 'lib', 'presupuestos'))
  // Traduce el alias "@/lib/..." de Next.js a la ruta real. `decidirGestion` es
  // pura, pero el modulo importa db y permisos al cargarse.
  const requireOriginal = mod.require.bind(mod)
  mod.require = (peticion) => {
    if (peticion.startsWith('@/')) {
      return requireOriginal(path.join(process.cwd(), peticion.slice(2) + '.ts'))
    }
    return requireOriginal(peticion)
  }
  mod._compile(js, 'permisos')
  return mod.exports
}

const { decidirGestion } = cargarPermisos()
const PROYECTO = 42
const SIN_PROYECTO = null

function como({ accion, esAdmin, esLider, proyectoId = PROYECTO }) {
  return decidirGestion({
    accion,
    esAdmin,
    esLiderDelProyecto: esLider,
    proyectoId,
  })
}

const ACCIONES = ['APROBAR', 'ACTIVAR_BOLSAS', 'REPARTIR']

function main() {
  titulo('El Lider del proyecto puede todo lo suyo')
  for (const accion of ACCIONES) {
    const d = como({ accion, esAdmin: false, esLider: true })
    ok(d.permitido, `${accion}: el Lider puede`, d.motivo)
    ok(!d.esExcepcion, `${accion}: no es una excepcion`)
    ok(d.motivo.includes('Líder') || d.motivo.includes('Lider'), `${accion}: el motivo dice que es el Lider`)
  }

  titulo('Un Jefe de Area que NO participa, no puede')
  // Es lo que se pidió explícitamente: ser jefe de área no da permiso por sí solo.
  for (const accion of ACCIONES) {
    const d = como({ accion, esAdmin: false, esLider: false })
    ok(!d.permitido, `${accion}: sin ser Lider no puede`, d.motivo)
    ok(!d.esExcepcion, `${accion}: no se marca como excepcion`)
    ok(
      d.motivo.includes('Líder') || d.motivo.includes('Lider'),
      `${accion}: el motivo explica que hace falta ser Lider`,
      d.motivo
    )
  }

  titulo('Un Jefe de Area que SI es Lider, si puede')
  for (const accion of ACCIONES) {
    const d = como({ accion, esAdmin: false, esLider: true })
    ok(d.permitido, `${accion}: puede porque es Lider del proyecto`, d.motivo)
  }

  titulo('El administrador puede, pero es EXCEPCION')
  for (const accion of ACCIONES) {
    const d = como({ accion, esAdmin: true, esLider: false })
    ok(d.permitido, `${accion}: el administrador puede`)
    ok(d.esExcepcion, `${accion}: queda marcado como excepcion`)
    ok(
      d.motivo.toLowerCase().includes('excepci') || d.motivo.toLowerCase().includes('excep'),
      `${accion}: el motivo advierte que es excepcion`,
      d.motivo
    )
  }

  titulo('El administrador que ademas es Lider, no es excepcion')
  for (const accion of ACCIONES) {
    const d = como({ accion, esAdmin: true, esLider: true })
    ok(d.permitido, `${accion}: puede`)
    ok(!d.esExcepcion, `${accion}: no es excepcion porque es el Lider de verdad`)
  }

  titulo('Sin proyecto, solo se puede vincular y solo el ADMIN')
  for (const accion of ACCIONES) {
    const d = como({ accion, esAdmin: true, esLider: false, proyectoId: SIN_PROYECTO })
    ok(!d.permitido, `${accion}: no se puede sin proyecto`, d.motivo)
    ok(d.motivo.includes('proyecto'), `${accion}: el motivo habla del proyecto`, d.motivo)
  }
  for (const esAdmin of [true, false]) {
    const d = como({ accion: 'VINCULAR', esAdmin, esLider: false, proyectoId: SIN_PROYECTO })
    ok(d.permitido === esAdmin, `VINCULAR sin proyecto: ${esAdmin ? 'el admin puede' : 'un jefe de area no puede'}`)
    if (esAdmin) ok(!d.esExcepcion, 'VINCULAR por el admin es el paso normal, no una excepcion')
  }

  titulo('La matriz completa se puede resumir')
  const filas = []
  for (const accion of ACCIONES) {
    filas.push({
      accion,
      lider: como({ accion, esAdmin: false, esLider: true }).permitido,
      jefeAreaNoParticipa: como({ accion, esAdmin: false, esLider: false }).permitido,
      admin: como({ accion, esAdmin: true, esLider: false }).permitido,
      adminEsLider: como({ accion, esAdmin: true, esLider: true }).permitido,
    })
  }
  console.table(filas)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Pasaron: ${pass}   Fallaron: ${fail}`)
  if (fallos.length) {
    console.log('\nFallos:')
    for (const f of fallos) console.log(`  - ${f}`)
  }
  console.log('='.repeat(60))
  process.exit(fail === 0 ? 0 : 1)
}

main()
