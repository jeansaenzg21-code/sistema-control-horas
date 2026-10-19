// Matriz de permisos del presupuesto.
//
// Se prueba `decidirGestion`, que es la función pura que decide. No necesita
// base de datos: son las reglas del negocio, y tienen que quedar fijas.
//
// Reglas vigentes (cambiaron cuando el negocio decidió que cargar el presupuesto
// por parte del jefe de área ES la aprobación):
//   - El presupuesto cuelga del cliente, no del proyecto: el vínculo con proyecto
//     es opcional y no da acceso a nadie.
//   - El JEFE DEL ÁREA del cliente puede importar, aprobar, activar bolsas,
//     repartir horas y vincular proyecto, tenga o no proyecto.
//   - El LIDER del proyecto vinculado puede lo mismo sobre su presupuesto.
//   - El ADMIN puede sobre cualquier presupuesto y ya no es EXCEPCIÓN.
//   - Un jefe de OTRA área, sin ser líder ni admin, no puede.

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

function como({ accion, esAdmin, esLider, proyectoId = PROYECTO, esJefeArea = false }) {
  return decidirGestion({
    accion,
    esAdmin,
    esLiderDelProyecto: esLider,
    proyectoId,
    esJefeDelAreaDelCliente: esJefeArea,
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

  titulo('El jefe del AREA del cliente puede TODO, sin ser Lider')
  // Cambio de negocio: el presupuesto cuelga del cliente y cargar el Excel ya es
  // la decisión de aprobarlo, asi que el jefe del área no necesita un proyecto ni
  // ser su Líder para aprobarlo, activarlo ni repartirlo.
  for (const accion of ['IMPORTAR', ...ACCIONES, 'VINCULAR']) {
    const d = como({ accion, esAdmin: false, esLider: false, esJefeArea: true, proyectoId: SIN_PROYECTO })
    ok(d.permitido, `${accion}: el jefe del área del cliente puede`, d.motivo)
    ok(!d.esExcepcion, `${accion}: no es una excepcion`)
    ok(d.motivo.includes('jefe del área'), `${accion}: el motivo dice que es el jefe del área`, d.motivo)
  }

  titulo('Un jefe de OTRA area, sin ser Lider ni admin, no puede')
  for (const accion of ACCIONES) {
    const d = como({ accion, esAdmin: false, esLider: false })
    ok(!d.permitido, `${accion}: sin ser del área, ni Lider ni admin, no puede`, d.motivo)
    ok(!d.esExcepcion, `${accion}: no se marca como excepcion`)
    ok(d.motivo.length > 0, `${accion}: y se le explica por que`, d.motivo)
  }

  titulo('El administrador puede, y ya no es EXCEPCION')
  // Antes el admin que no era Líder quedaba registrado como excepción con
  // justificación obligatoria. Con el presupuesto colgando del cliente, el admin
  // actua como parte de la gestion normal y no como excepción.
  for (const accion of ACCIONES) {
    const d = como({ accion, esAdmin: true, esLider: false })
    ok(d.permitido, `${accion}: el administrador puede`)
    ok(!d.esExcepcion, `${accion}: ya no queda marcado como excepcion`)
    ok(d.motivo.toLowerCase().includes('administrador'), `${accion}: el motivo dice que actua como administrador`, d.motivo)
  }

  titulo('El administrador tambien puede sin proyecto')
  for (const accion of ACCIONES) {
    const d = como({ accion, esAdmin: true, esLider: false, proyectoId: SIN_PROYECTO })
    ok(d.permitido, `${accion}: puede sin proyecto`, d.motivo)
    ok(!d.esExcepcion, `${accion}: no es excepcion`)
  }

  titulo('Un jefe de OTRA area puede VINCULAR solo con admin o siendo del area')
  for (const esAdmin of [true, false]) {
    const d = como({ accion: 'VINCULAR', esAdmin, esLider: false, proyectoId: SIN_PROYECTO })
    ok(d.permitido === esAdmin, `VINCULAR sin proyecto: ${esAdmin ? 'el admin puede' : 'un jefe de OTRA area no puede'}`)
    if (esAdmin) ok(!d.esExcepcion, 'VINCULAR por el admin es el paso normal, no una excepcion')
  }

  titulo('Cargar el presupuesto: el jefe del AREA del cliente si puede')
  // Corrección del negocio: importar es parte del trabajo del jefe de área.
  const importarComo = (esAdmin, esJefeArea) =>
    decidirGestion({
      accion: 'IMPORTAR',
      esAdmin,
      esLiderDelProyecto: false,
      proyectoId: SIN_PROYECTO,
      esJefeDelAreaDelCliente: esJefeArea,
    })

  ok(importarComo(false, true).permitido, 'el jefe del área del cliente puede importar su presupuesto')
  ok(!importarComo(false, true).esExcepcion, 'y no es una excepcion')
  ok(importarComo(true, false).permitido, 'el administrador tambien puede importar')
  ok(!importarComo(false, false).permitido, 'un jefe de OTRA area no puede')
  ok(importarComo(false, false).motivo.length > 0, 'y se le explica por que')

  // Y puede hacerlo sin proyecto: todavia no hay ninguno.
  ok(importarComo(false, true).permitido, 'puede importar aunque el presupuesto aun no tenga proyecto')

  // Y ahora tambien puede aprobarlo, que antes no podia.
  ok(
    como({ accion: 'APROBAR', esAdmin: false, esLider: false, esJefeArea: true, proyectoId: SIN_PROYECTO }).permitido,
    'y también aprobarlo, sin ser Líder y sin proyecto'
  )

  titulo('La matriz completa se puede resumir')
  const filas = []
  for (const accion of ACCIONES) {
    filas.push({
      accion,
      lider: como({ accion, esAdmin: false, esLider: true }).permitido,
      jefeArea: como({ accion, esAdmin: false, esLider: false, esJefeArea: true }).permitido,
      jefeAreaSinProyecto: como({ accion, esAdmin: false, esLider: false, esJefeArea: true, proyectoId: SIN_PROYECTO }).permitido,
      jefeAreaOtraArea: como({ accion, esAdmin: false, esLider: false }).permitido,
      admin: como({ accion, esAdmin: true, esLider: false }).permitido,
      adminEsExcepcion: como({ accion, esAdmin: true, esLider: false }).esExcepcion,
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
