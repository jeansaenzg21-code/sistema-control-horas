// El importador se prueba contra el Excel REAL de PC FACTORY, no contra un
// archivo inventado. Si el documento cambia, este script avisa.
//
// Este archivo es distinto al de Santa Rosa en tres puntos que antes rompian la
// importacion:
//   1. las hojas NO se llaman "Cotizacion": se llaman como el cliente
//      ("PC FACTORY", "PC FACTORY (2)"), y hay VARIAS cotizaciones en el libro;
//   2. dentro de la propia hoja hay una tabla de actividades en DIAS, seguida de
//      un total calculado (17 dias * 9 = 153 h) que NO es una asignacion;
//   3. no hay hoja de matriz ni hoja de planificacion.
//
//   node tests/presupuestos/importar-pcfactory.test.js

const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

let pass = 0
let fail = 0
const fallos = []

function ok(condicion, mensaje, extra) {
  if (condicion) {
    pass++
    console.log(`  ok    ${mensaje}`)
  } else {
    fail++
    fallos.push(mensaje)
    console.log(`  FALLA ${mensaje}${extra ? `\n          ${extra}` : ''}`)
  }
}

function titulo(t) {
  console.log(`\n${t}\n${'-'.repeat(t.length)}`)
}

function sinAcentos(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

async function cargarImportador() {
  const fuente = fs.readFileSync(path.join(process.cwd(), 'lib/presupuestos/importar-excel.ts'), 'utf8')
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const Module = require('node:module')
  const ruta = path.join(process.cwd(), 'lib/presupuestos/__importador_compilado.js')
  const mod = new Module(ruta, null)
  mod.filename = ruta
  mod.paths = Module._nodeModulePaths(path.join(process.cwd(), 'lib/presupuestos'))
  mod._compile(js, ruta)
  return mod.exports
}

async function main() {
  const { analizarPresupuesto } = await cargarImportador()
  const rutaExcel = path.join(process.cwd(), 'Cotización PCFACTORY.xlsx')

  if (!fs.existsSync(rutaExcel)) {
    console.error(`No se encontro el Excel en: ${rutaExcel}`)
    process.exit(1)
  }

  const archivo = fs.readFileSync(rutaExcel)
  const a = await analizarPresupuesto(archivo)

  titulo('La hoja se reconoce por contenido, no por su nombre')
  ok(a.hojas.length === 2, `el archivo trae 2 hojas (${a.hojas.length})`, a.hojas.join(' | '))
  ok(
    !a.hojas.some((h) => sinAcentos(h).includes('cotizaci')),
    'ninguna hoja se llama "cotización": antes se rechazaba el archivo entero'
  )
  ok(a.servicios.length === 2, `se leen las DOS cotizaciones del libro (${a.servicios.length})`)

  titulo('Cliente y área del documento')
  ok(sinAcentos(a.cliente).includes('pc factory'), 'el cliente sale del Excel', String(a.cliente))
  ok(sinAcentos(a.area).includes('consultoria'), 'el área sale del Excel', String(a.area))

  titulo('Las dos cotizaciones, con sus horas')
  const porNombre = new Map(a.servicios.map((s) => [s.nombre, s]))
  const max100 = a.servicios.find((s) => sinAcentos(s.nombre).includes('max 100'))
  const cien200 = a.servicios.find((s) => sinAcentos(s.nombre).includes('100 -200'))
  ok(max100 != null, 'se encuentra la variante "max 100 colab"')
  ok(cien200 != null, 'se encuentra la variante "100 -200 colab"')
  ok(max100?.horasTotales === 30, `la primera declara 30 h (${max100?.horasTotales})`)
  ok(cien200?.horasTotales === 38, `la segunda declara 38 h (${cien200?.horasTotales})`)
  ok(
    max100?.nombre !== cien200?.nombre,
    'son dos servicios distintos, no el mismo duplicado'
  )

  titulo('Personas y categorías dentro de cada bloque')
  const asigna100 = (max100?.asignaciones ?? []).map((x) => x.nombreTexto)
  ok(
    asigna100.some((n) => sinAcentos(n) === 'julia alayo'),
    'JULIA ALAYO se reconoce como persona',
    JSON.stringify(asigna100)
  )
  ok(
    (max100?.asignaciones ?? []).some((x) => sinAcentos(x.nombreTexto) === 'julia alayo' && x.horas === 4),
    'JULIA ALAYO tiene 4 h'
  )
  ok(
    (max100?.asignaciones ?? []).some((x) => sinAcentos(x.nombreTexto) === 'eduardo chiscul' && x.horas === 20),
    'EDUARDO CHISCUL tiene 20 h en la primera'
  )
  ok(
    (cien200?.asignaciones ?? []).some((x) => sinAcentos(x.nombreTexto) === 'eduardo chiscul' && x.horas === 24),
    'EDUARDO CHISCUL tiene 24 h en la segunda'
  )

  titulo('La categoría sin persona NO se reparte sola')
  const sinPersona = (max100?.asignaciones ?? []).filter((x) => x.nombreTexto === null)
  ok(sinPersona.length === 1, `queda 1 fila sin persona en la primera (${sinPersona.length})`)
  ok(sinPersona[0]?.horas === 6, `esas 6 h son las de ASISTENTE "A" (${sinPersona[0]?.horas})`)
  ok(sinPersona[0]?.requiereConfirmacion === true, 'la fila sin persona exige confirmación')
  ok(
    (cien200?.asignaciones ?? []).some((x) => x.nombreTexto === null && x.horas === 10),
    'en la segunda son 10 h sin persona'
  )

  titulo('La tabla de actividades NO se cuela como horas de una persona')
  const todas = a.servicios.flatMap((s) => s.asignaciones)
  ok(!todas.some((x) => x.horas === 153), 'las 153 h del total de días NO aparecen como asignación')
  ok(!todas.some((x) => x.horas === 17), 'el total de 17 días NO aparece como asignación')
  ok(!todas.some((x) => x.horas === 5), 'los 5 días de una tarea NO aparecen como asignación')
  ok(
    !todas.some((x) => x.horas === 20 && x.nombreTexto === null),
    'el bloque "TIEMPO MES" (20 h) NO aparece como asignación sin persona'
  )
  const suma = Math.round(todas.reduce((t, x) => t + x.horas, 0) * 100) / 100
  ok(suma === 30 + 38, `las asignaciones suman exactamente 68 h (${suma})`)

  titulo('Sin matriz ni hoja de planificación el archivo entra igual')
  ok(a.totales.horasConsolidado === 0, 'no hay consolidados: este archivo no trae la hoja de matriz')
  ok(a.totales.horasComplementario === 0, 'no hay complementarios')
  ok(a.totales.horasDetallado === 68, `el total detallado es 68 h (${a.totales.horasDetallado})`)
  ok(a.planificacion.length === 0, 'no se inventa un cronograma')

  titulo('La planificación ilegible se avisa, no se calla')
  const aviso = a.observaciones.find((o) => o.tipo === 'PLANIFICACION_NO_LEIBLE')
  ok(aviso != null, 'hay una observación por el cronograma en días')
  ok(aviso?.severidad === 'REVISAR', 'es de severity REVISAR, no bloqueante')
  ok(
    aviso?.detalle?.tareas === 4,
    `se detectan las 4 tareas del cronograma (${aviso?.detalle?.tareas})`
  )
  ok(
    /suponer la jornada|suponer/i.test(aviso?.mensaje ?? ''),
    'el aviso dice que convertir días a horas exigiría suponer la jornada'
  )

  titulo('Las horas sin persona se reportan como bloqueantes')
  const bloqueantes = a.observaciones.filter((o) => o.severidad === 'BLOQUEANTE')
  ok(bloqueantes.length === 2, `2 observaciones bloqueantes, una por cotización (${bloqueantes.length})`)
  ok(
    bloqueantes.every((o) => o.detalle?.categoria != null),
    'cada bloqueante dice de qué categoría son las horas'
  )

  titulo('Determinismo')
  const b = await analizarPresupuesto(archivo)
  ok(JSON.stringify(a) === JSON.stringify(b), 'dos lecturas del mismo archivo dan exactamente lo mismo')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Pasaron: ${pass}   Fallaron: ${fail}`)
  if (fallos.length > 0) {
    console.log('\nFallos:')
    for (const f of fallos) console.log(`  - ${f}`)
  }
  console.log(`${'='.repeat(60)}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('Error ejecutando la prueba:', e)
  process.exit(1)
})
