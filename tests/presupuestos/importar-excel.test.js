// El importador se prueba contra el Excel REAL de Colegio Santa Rosa, no contra
// un archivo inventado. Si el documento cambia, este script avisa.
//
// Se ejecuta con node y el mismo estilo que el resto de pruebas del proyecto:
//   node tests/presupuestos/importar-excel.test.js
//
// Para correrlo con TypeScript sin instalar nada se compila el importador a
// JavaScript en memoria con el compilador de TypeScript que ya es dependencia del
// proyecto.

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

/** Sin acentos y en minúsculas, para comparar sin depender de la escritura. */
function sinAcentos(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function iguales(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Carga el importador de TypeScript sin emitting a disco. */
async function cargarImportador() {
  const fuente = fs.readFileSync(path.join(process.cwd(), 'lib/presupuestos/importar-excel.ts'), 'utf8')
  const js = ts.transpileModule(fuente, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
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
  const rutaExcel = path.join(process.cwd(), 'Presupuesto Colegio Santa Rosa (1).xlsx')

  if (!fs.existsSync(rutaExcel)) {
    console.error(`No se encontro el Excel en: ${rutaExcel}`)
    process.exit(1)
  }

  const archivo = fs.readFileSync(rutaExcel)
  const a = await analizarPresupuesto(archivo)
  const detallados = a.servicios.filter((s) => s.origen === 'DETALLADO')
  const consolidados = a.servicios.filter((s) => s.origen === 'CONSOLIDADO')
  const complementarios = a.servicios.filter((s) => s.origen === 'COMPLEMENTARIO')
  const obs = (tipo) => a.observaciones.filter((o) => o.tipo === tipo)

  titulo('Hojas del documento')
  ok(a.hojas.length === 3, `lee 3 hojas (${a.hojas.join(' | ')})`, `leidas: ${a.hojas.length}`)
  ok(
    a.hojas.some((h) => h.toLowerCase().includes('cotizaci')),
    'encuentra la hoja de cotizacion'
  )
  ok(
    a.hojas.some((h) => h.toLowerCase().includes('horas por servicio')),
    'encuentra la hoja "Horas por servicio"'
  )
  ok(a.hojas.some((h) => h.toLowerCase() === 'hoja2'), 'encuentra la hoja de planificacion')

  titulo('Detallados frente a consolidados')
  ok(detallados.length === 5, `5 bloques detallados (leidos ${detallados.length})`)
  ok(consolidados.length === 2, `2 bloques consolidados (leidos ${consolidados.length})`)
  // OJO: el Excel original escribe "Servicos Multiples" sin tilde. Se compara
  // sin acentos para no depender de cómo esté escrito el documento.
  ok(
    consolidados.every((c) => sinAcentos(c.nombre).includes('multiples')),
    'los consolidados son los "Servicos Multiples" del documento'
  )
  ok(
    consolidados.every((c) => c.generaBolsa === false),
    'los consolidados NO generan bolsa'
  )
  ok(detallados.every((d) => d.generaBolsa === true), 'los detallados SI generan bolsa')

  titulo('Horas: la cifra que importa')
  ok(
    a.totales.horasDetallado === 270,
    `los detallados suman 270 h (${a.totales.horasDetallado})`,
    'Esperado 270 = 186+18+13+21+32'
  )
  ok(
    a.totales.horasSegunConsolidado === 272,
    `los consolidados suman 272 h (${a.totales.horasSegunConsolidado})`,
    'Esperado 272 = 252 consolidados + 20 de mantenimiento... en realidad 252+20'
  )
  ok(
    a.totales.horasDetallado + a.totales.horasComplementario === 272,
    `detallado + complemento = 272 h (${a.totales.horasDetallado} + ${a.totales.horasComplementario})`
  )
  ok(
    a.totales.horasDetallado !== 542,
    'NO se suman los consolidados a las bolsas (no da 542 h)'
  )

  titulo('Servicios y sus horas')
  // Solo los detallados: un complemento puede llamarse igual que su servicio y
  // taparia al detalle en el mapa por nombre.
  const porNombre = new Map(detallados.map((s) => [s.nombre, s.horasTotales]))
  const esperado = [
    ['Elaboración e implementación documentaria de un SG-SST', 186],
    // El Excel dice "del Seguridad", no "de Seguridad". Se copia literal.
    ['Mantenimiento de Sistema de Gestión del Seguridad y Salud en el Trabajo', 18],
    ['Instalación, Activación y Empoderamiento del Comité de Seguridad y Salud en el Trabajo', 13],
    ['Elaboración e implementación de Monitoreo de Riesgo Psicosocial', 21],
    ['Implementación del Sistema de Prevención del hostigamiento Sexual Laboral', 32],
  ]
  for (const [nombre, horas] of esperado) {
    ok(porNombre.get(nombre) === horas, `${horas} h en "${nombre.slice(0, 45)}..." (${porNombre.get(nombre)})`)
  }

  titulo('Cuadre interno de cada bloque')
  let cuadran = 0
  for (const s of a.servicios.filter((x) => x.origen === 'DETALLADO')) {
    const suma = Math.round(s.asignaciones.reduce((t, x) => t + x.horas, 0) * 100) / 100
    if (suma === s.horasTotales) cuadran += 1
  }
  ok(cuadran === 5, `las asignaciones suman lo mismo que el total en los 5 bloques (${cuadran}/5)`)

  titulo('Las 2 horas de acompanamiento que solo estan en el consolidado')
  ok(complementarios.length >= 1, `detecta el servicio complementario (${complementarios.length})`)
  ok(
    a.totales.horasComplementario === 2,
    `son 2 h (${a.totales.horasComplementario})`,
    'Esperado 2: el acompanamiento mensual del Comite'
  )
  ok(
    complementarios.every((c) => c.generaBolsa === false),
    'el complemento NO genera bolsa hasta que el Lider confirme'
  )
  ok(
    obs('COMPLEMENTO_SIN_CONFIRMAR').length > 0 &&
      obs('COMPLEMENTO_SIN_CONFIRMAR')[0].severidad === 'BLOQUEANTE',
    'avisa como BLOQUEANTE que hay que confirmarlas'
  )

  titulo('Horas sin persona: no se inventan duenos')
  const sinPersona = obs('SIN_PERSONA')
  ok(sinPersona.length > 0, `detecta filas con horas y sin persona (${sinPersona.length})`)
  ok(
    sinPersona.some((o) => o.detalle.horas === 4),
    'detectaSpecifically las 4 h sin nombre del bloque de Hostigamiento'
  )
  const sinDueño = a.servicios.flatMap((s) => s.asignaciones).filter((x) => x.horas === 4 && x.nombreTexto === null)
  ok(sinDueño.length > 0, `las 4 h quedan con nombreTexto null (${sinDueño.length})`)
  ok(sinDueño.every((x) => x.requiereConfirmacion), 'las 4 h piden confirmacion')

  titulo('Trainee es categoria, no persona')
  const trainees = a.servicios.flatMap((s) => s.asignaciones).filter((x) => (x.nombreTexto || '').toLowerCase() === 'trainee')
  ok(trainees.length > 0, `encuentra las filas de Trainee (${trainees.length})`)
  ok(trainees.every((t) => t.requiereConfirmacion), 'Trainee siempre queda pendiente de confirmar')
  ok(
    trainees.every((t) => (t.motivo || '').includes('categoría')),
    'el motivo explica que es una categoría'
  )

  titulo('Identidad ambigua: las mismas 28 h con dos nombres')
  const yonny = a.servicios.flatMap((s) => s.asignaciones).filter((x) => (x.nombreTexto || '').toLowerCase() === 'yonny flores')
  ok(yonny.some((y) => y.horas === 28), 'Yonny Flores tiene las 28 h en el bloque detalloso')
  const ambigua28 = obs('IDENTIDAD_AMBIGUA').filter((o) => o.detalle.horas === 28)
  ok(ambigua28.length > 0, 'avisa de la ambiguedad de las 28 h')
  ok(
    ambigua28[0] && ambigua28[0].detalle.nombrePlanificacion === 'Junior',
    'detecta tambien el nombre "Junior" de la hoja de planificacion',
    ambigua28[0] ? JSON.stringify(ambigua28[0].detalle) : 'sin observacion'
  )
  ok(
    ambigua28[0] && sinAcentos(ambigua28[0].detalle.nombreCotizacion) === 'yonny flores',
    'y lo contrasta con "Yonny flores" de la cotizacion',
    ambigua28[0] ? JSON.stringify(ambigua28[0].detalle) : 'sin observacion'
  )

  titulo('Planificacion en semanas relativas, sin inventar fechas')
  ok(a.planificacion.length > 5, `extrae las sub-etapas (${a.planificacion.length})`)
  const horasPlan = Math.round(a.planificacion.reduce((t, p) => t + p.horas, 0))
  ok(horasPlan === 184, `la planificacion suma 184 h (${horasPlan})`)
  ok(
    a.planificacion.every((p) => p.semanaInicio === null || p.semanaInicio >= 1),
    'todas las semanas empiezan en 1 o mas'
  )
  ok(
    a.planificacion.every((p) => !('fechaInicio' in p) && !('fechaFin' in p)),
    'ninguna sub-etapa trae fecha de calendario'
  )

  titulo('Diferencia entre planificacion y cotizacion')
  const dif = obs('HORAS_DIFERENTES')
  ok(dif.length > 0, 'avisa de que las cifras no cuadran')
  ok(dif[0] && dif[0].detalle.horasPlanificacion === 184, 'informa 184 h planificadas')
  ok(dif[0] && dif[0].detalle.horasCotizadas === 186, 'informa 186 h cotizadas')

  titulo('El Fee no se cuela como horas')
  const conFee = a.servicios.filter((s) => s.fee !== null && s.fee > 0)
  ok(conFee.length > 0, `guarda el Fee aparte en ${conFee.length} servicios`)
  ok(
    conFee.every((s) => s.horasTotales < 300),
    'ningun servicio con Fee se dispara a horas'
  )

  titulo('La nota del autor se conserva')
  const conNota = a.servicios.find((s) => (s.nota || '').toLowerCase().includes('cobro mixto'))
  ok(!!conNota, 'encuentra la nota de cobro mixto')
  ok(!!conNota && conNota.nota.includes('2 horas'), 'la nota menciona las 2 horas mensuales')

  titulo('Determinismo')
  const b = await analizarPresupuesto(archivo)
  ok(iguales(a, b), 'dos lecturas del mismo archivo dan exactamente lo mismo')

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
