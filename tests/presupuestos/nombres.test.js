// Reconocimiento de personas entre el Excel y el personal cargado.
//
// El Excel trae el NOMBRE primero y el personal se carga con los apellidos
// primero. Estas pruebas usan los nombres reales de Santa Rosa.

const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

let pass = 0
let fail = 0
const fallos = []
function ok(c, m, extra) {
  if (c) { pass++; console.log(`  ok    ${m}`) }
  else { fail++; fallos.push(m); console.log(`  FALLA ${m}${extra ? `\n          ${extra}` : ''}`) }
}
function titulo(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`) }

const fuente = fs.readFileSync('lib/presupuestos/nombres.ts', 'utf8')
const js = ts.transpileModule(fuente, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
const Module = require('node:module')
const mod = new Module(path.resolve('lib/presupuestos/nombres.ts'), null)
mod.paths = Module._nodeModulePaths(path.resolve('lib/presupuestos'))
mod._compile(js, path.resolve('lib/presupuestos/nombres.ts'))
const { buscarPersona, palabras, explicarCoincidencia } = mod.exports

// El personal tal y como esta cargado en la base (apellidos primero, con
// nombres intermedios y apellidos adicionales).
const PERSONAL = [
  { id: 5, nombre: 'CASTILLO CAMPOS WALTER ISRAEL' },
  { id: 26, nombre: 'FLORES CASTILLO YONNY ALEXANDER' },
  { id: 31, nombre: 'CAMPOS AZAÑA ANDRE VICTOR' },
  { id: 48, nombre: 'ALAYO BERECHE JULIA MERCEDES' },
  { id: 55, nombre: 'CHISCUL MOLINA EDUARDO EMILIO' },
  { id: 59, nombre: 'BONIFACIO CAMPOS ALEJANDRO' },
  { id: 12, nombre: 'QUISPE ARANA MARIA' },
  { id: 14, nombre: 'QUISPE LOAYZA PEDRO' },
  { id: 22, nombre: 'CUSIHUAMAN CARMEN HUMBERTO JORDAN' },
  { id: 33, nombre: 'RODRIGUEZ GUTIERREZ MELANIE PIERINA' },
]

function main() {
  titulo('Los nombres del Excel se reconocen en el personal')
  const casos = [
    ['EDUARDO CHISCUL', 55, 'CHISCUL MOLINA EDUARDO EMILIO'],
    ['Yonny flores', 26, 'FLORES CASTILLO YONNY ALEXANDER'],
    ['JULIA ALAYO', 48, 'ALAYO BERECHE JULIA MERCEDES'],
  ]
  for (const [excel, idEsperado, nombreReal] of casos) {
    const r = buscarPersona(excel, PERSONAL)
    ok(r !== null, `"${excel}" se reconoce`)
    if (r) {
      ok(r.usuarioId === idEsperado, `  -> apunta a ${nombreReal} (id ${idEsperado})`, `obtuvo id ${r.usuarioId} (${r.usuarioNombre})`)
      ok(r.nivel === 'CONTIENE', `  -> nivel CONTIENE (el Excel viene abreviado)`)
    }
  }

  titulo('Lo que NO es una persona sigue sin reconocerse')
  for (const etiqueta of ['Trainee', 'Trainee ', 'JUNIOR', 'Junior', 'LIDER PROCESOS', 'SOCIO', 'ASISTENTE "A"']) {
    const r = buscarPersona(etiqueta, PERSONAL)
    ok(r === null, `"${etiqueta}" no se adjudica a nadie`, r ? `se asocio a ${r.usuarioNombre}` : '')
  }
  ok(buscarPersona(null, PERSONAL) === null, 'una fila sin nombre no se adjudica a nadie')
  ok(buscarPersona('PERSONA QUE NO EXISTE ZZZ', PERSONAL) === null, 'un nombre inexistente no inventa')

  titulo('La ambiguedad se rechaza, no se elige una')
  // Dos personas comparten apellidos; el nombre corto no puede decidir.
  const r = buscarPersona('QUISPE', PERSONAL)
  ok(r === null, '"QUISPE" con 3 posibles no se adjudica a ninguno', r ? `eligio ${r.usuarioNombre}` : '')

  titulo('Casos limite')
  // Orden invertido: el Excel puede traer apellido primero.
  const invertido = buscarPersona('CHISCUL EDUARDO', PERSONAL)
  ok(invertido !== null && invertido.usuarioId === 55, 'también funciona si el Excel trae apellido primero')

  // Con acentos y mayusculas variations.
  const conAcentos = buscarPersona('Cusihuaman Carmen', PERSONAL)
  ok(conAcentos !== null && conAcentos.usuarioId === 22, 'funciona con acentos y mayusculas', conAcentos ? conAcentos.usuarioNombre : 'null')

  // Una sola palabra suelta NO se arriesga, aunque exista como parte de un nombre.
  ok(buscarPersona('CAMPOS', PERSONAL) === null, 'un solo apellido no se adjudica (habria 2 candidatos)')

  // Nombre exacto de una persona: nivel EXACTA.
  const exacta = buscarPersona('BONIFACIO CAMPOS ALEJANDRO', PERSONAL)
  ok(exacta !== null && exacta.nivel === 'EXACTA', 'un nombre identico da nivel EXACTA')

  titulo('Las palabras se normalizan bien')
  // El guion parte en dos palabras: "Pérez-González" son dos.
  ok(palabras('Ñoño  Pérez-González, Jr.').length === 4, 'quita signos, comas y pasa a minusculas', JSON.stringify(palabras('Ñoño  Pérez-González, Jr.')))
  ok(palabras('A').length === 0, 'descarta palabras de una letra')
  // La enye se conserva como n, que es lo que evita que "Muñoz" y "Munoz" queden
  // distintas por un acento de mas.
  ok(palabras('MUÑOZ').join() === palabras('Munoz').join(), 'la enye se compara igual sin tilde', `muñoz=${palabras('MUÑOZ')} munoz=${palabras('Munoz')}`)
  ok(buscarPersona('ANDRÉ CAMPOS', PERSONAL) !== null, 'un nombre con tilde encuentra al mismo sin ella')

  titulo('El motivo que se guarda es legible')
  const bueno = buscarPersona('EDUARDO CHISCUL', PERSONAL)
  const motivo = explicarCoincidencia('EDUARDO CHISCUL', bueno)
  ok(motivo.includes('CHISCUL MOLINA'), 'dice a quien quedo asignado', motivo)
  const malo = explicarCoincidencia('Trainee', null)
  ok(motivo.length > 0 && malo.includes('Trainee'), 'y cuando no encuentra, lo explica', malo)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Pasaron: ${pass}   Fallaron: ${fail}`)
  if (fallos.length) { console.log('\nFallos:'); for (const f of fallos) console.log(`  - ${f}`) }
  console.log('='.repeat(60))
  process.exit(fail === 0 ? 0 : 1)
}

main()
