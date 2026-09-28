// Lectura del Excel de presupuesto.
//
// Todo lo que sale de aquí es una EXTRACCIÓN, nunca una decisión. Cuando el
// documento es ambiguo o se contradice, se anota una observación y la resolución
// queda en manos del Líder. El módulo no toca la base de datos: es una función
// pura sobre el archivo, para poder probarla contra el Excel real.

import ExcelJS from 'exceljs'

export type OrigenServicio = 'DETALLADO' | 'CONSOLIDADO' | 'COMPLEMENTARIO'

export type AsignacionExtraida = {
  /** Lo que dice el Excel. Puede ser "Trainee", o null si la fila no tiene nombre. */
  nombreTexto: string | null
  categoria: string | null
  horas: number
  tarifa: number | null
  importe: number | null
  /** Sin persona identificable, o con un nombre que no se puede resolver. */
  requiereConfirmacion: boolean
  motivo: string | null
  filaOrigen: number
}

export type ServicioExtraido = {
  /** Estable entre importaciones del mismo documento: sirve para versionar. */
  clave: string
  origen: OrigenServicio
  nombre: string
  cliente: string | null
  area: string | null
  horasTotales: number
  /** El "Fee" del Excel es un cargo fijo, no horas. Viaja aparte. */
  fee: number | null
  importeTotal: number | null
  asignaciones: AsignacionExtraida[]
  nota: string | null
  filaInicio: number
  /** False en los consolidados: se guardan como referencia, no cuentan saldo. */
  generaBolsa: boolean
}

export type SubetapaExtraida = {
  etapa: string | null
  subetapa: string
  horas: number
  semanaInicio: number | null
  semanaFin: number | null
  mes: string | null
  filaOrigen: number
}

export type TipoObservacion =
  | 'CONSOLIDADO'
  | 'COMPLEMENTO_SIN_CONFIRMAR'
  | 'IDENTIDAD_AMBIGUA'
  | 'SIN_PERSONA'
  | 'HORAS_DIFERENTES'
  | 'FORMULA_SIN_VALOR'

export type Observacion = {
  tipo: TipoObservacion
  severidad: 'INFO' | 'REVISAR' | 'BLOQUEANTE'
  mensaje: string
  detalle: Record<string, unknown>
}

export type AnalisisPresupuesto = {
  hojas: string[]
  /**
   * Cliente y área que trae el documento. Sirven para crear el cliente al
   * importar, en vez de pedir que se escriba a mano lo que ya está en el Excel.
   * Vienen del primer bloque: todos los del documento deben coincidir.
   */
  cliente: string | null
  area: string | null
  servicios: ServicioExtraido[]
  planificacion: SubetapaExtraida[]
  observaciones: Observacion[]
  totales: {
    horasDetallado: number
    horasConsolidado: number
    horasComplementario: number
    /** Lo que consumirá el presupuesto: detallado + complemento. */
    horasPresupuestadas: number
    /** Lo que suman los consolidados, para contrastar. */
    horasSegunConsolidado: number
  }
}

type Hoja = ExcelJS.Worksheet

// --- celdas ----------------------------------------------------------------

/**
 * Valor efectivo de una celda, resolviendo fórmulas por su resultado.
 *
 * Hay que atender a `formula` y a `sharedFormula`: el libro usa las dos. Una
 * celda con fórmula compartida llega como `{ result, sharedFormula }` SIN
 * `formula`, y si solo se mirara `formula` devolvería el objeto entero en vez del
 * número. Eso ocurre en Hoja2 (las horas de "Junior" y "Trainee").
 */
function valor(celda: ExcelJS.Cell | undefined): unknown {
  if (!celda) return null
  const v = celda.value as unknown
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && v !== null) {
    const f = v as {
      formula?: string
      sharedFormula?: string
      result?: unknown
      richText?: { text: string }[]
      text?: string
    }
    if (f.formula !== undefined || f.sharedFormula !== undefined) return f.result ?? null
    if (Array.isArray(f.richText)) return f.richText.map((r) => r.text).join('')
    if (typeof f.text === 'string') return f.text
  }
  return v
}

/**
 * Texto de la fórmula, si la celda la tiene. Sirve para saber de dónde sale una
 * cifra, por ejemplo si una hoja se apoya en la matriz por persona.
 *
 * Con fórmulas compartidas se devuelve la referencia al maestro: es lo único que
 * esa celda guarda, y da la misma familia de función.
 */
function formula(celda: ExcelJS.Cell | undefined): string | null {
  const v = celda?.value as unknown
  if (v && typeof v === 'object') {
    const f = v as { formula?: string; sharedFormula?: string }
    const s = f.formula ?? f.sharedFormula
    if (typeof s === 'string' && s !== '') return s
  }
  return null
}

function texto(celda: ExcelJS.Cell | undefined): string | null {
  const v = valor(celda)
  if (v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function numero(celda: ExcelJS.Cell | undefined): number | null {
  const v = valor(celda)
  if (v === null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

function normalizar(s: string | null): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function sinPrefijoHoja(s: string | null): string {
  return normalizar(s).replace(/^cotizacion\s+/, '')
}

// --- personas ---------------------------------------------------------------

// El Excel mezcla nombres de personas con nombres de rol. Estas tres aparecen
// con nombre propio; el resto ("Trainee", "Junior", "SOCIO", "GERENTE",
// "SENIOR A PROCESOS"...) son categorías y NO se pueden adjudicar a alguien.
const PERSONAS_RECONOCIDAS = new Set(['julia alayo', 'eduardo chiscul', 'yonny flores'])

function esPersonaConocida(nombre: string | null): boolean {
  return nombre !== null && PERSONAS_RECONOCIDAS.has(normalizar(nombre))
}

function motivoDeConfirmacion(nombre: string | null): string | null {
  if (nombre === null) return 'La fila tiene horas pero no indica a quién se asignan.'
  if (!esPersonaConocida(nombre)) {
    return `"${nombre}" es una categoría o un rol, no una persona identificable.`
  }
  return null
}

// --- cotización -------------------------------------------------------------

const COL = { D: 4, F: 6, H: 8, J: 10, L: 12, N: 14, P: 16 }
const MARCA = 'formato de presupuesto de tiempo'
const HOJA_MATRIZ = 'horas por servicio'

type FilaCruda = {
  fila: number
  marca: string | null
  etiquetaD: string | null
  valorF: string | null
  categoria: string | null
  horas: number | null
  tarifa: number | null
  importe: number | null
  formulaHoras: string | null
}

function leerFilas(hoja: Hoja): FilaCruda[] {
  const salida: FilaCruda[] = []
  hoja.eachRow({ includeEmpty: false }, (fila, n) => {
    const d = texto(fila.getCell(COL.D))
    salida.push({
      fila: n,
      marca: d !== null && normalizar(d).includes(MARCA) ? d : null,
      etiquetaD: d,
      valorF: texto(fila.getCell(COL.F)),
      categoria: texto(fila.getCell(COL.H)),
      horas: numero(fila.getCell(COL.J)),
      tarifa: numero(fila.getCell(COL.L)),
      importe: numero(fila.getCell(COL.N)),
      formulaHoras: formula(fila.getCell(COL.J)),
    })
  })
  return salida
}

function extraerBloques(filas: FilaCruda[]): ServicioExtraido[] {
  const bloques: ServicioExtraido[] = []

  for (let i = 0; i < filas.length; i += 1) {
    if (filas[i].marca === null) continue

    // Cabecera: CLIENTE, AREA y SERVICIO están en las filas siguientes.
    let cliente: string | null = null
    let area: string | null = null
    let nombre: string | null = null
    let finCabecera = i
    for (let k = i + 1; k < Math.min(i + 12, filas.length); k += 1) {
      const etiqueta = normalizar(filas[k].etiquetaD)
      if (etiqueta.startsWith('cliente')) cliente = filas[k].valorF
      else if (etiqueta.startsWith('area')) area = filas[k].valorF
      else if (etiqueta.startsWith('servicio')) {
        nombre = filas[k].valorF
        finCabecera = k
        break
      }
    }
    // Sin nombre de servicio no hay bloque: no se inventa nada.
    if (nombre === null) continue

    const asignaciones: AsignacionExtraida[] = []
    let horasDeFilas = 0
    let horasDeclaradas: number | null = null
    let fee: number | null = null
    let importeTotal: number | null = null
    let nota: string | null = null
    let vieneDeMatriz = false
    let finBloque = filas.length

    for (let k = finCabecera + 1; k < filas.length; k += 1) {
      const f = filas[k]
      if (f.marca !== null) {
        finBloque = k
        break
      }

      const etiqueta = normalizar(f.categoria ?? '')

      if (etiqueta.startsWith('total horas')) {
        horasDeclaradas = f.horas
        if (f.importe !== null) importeTotal = f.importe
        continue
      }
      if (etiqueta === 'fee') {
        fee = f.importe
        continue
      }
      // Nota del autor, en la columna D, fuera de la tabla.
      if (f.etiquetaD !== null && normalizar(f.etiquetaD).startsWith('cobro')) {
        nota = f.etiquetaD
        continue
      }
      // Sin horas no hay asignación: las filas de tarifa vacías son un tarifario.
      if (f.horas === null || f.horas === 0) continue

      // Si las horas salen de la matriz por persona, este bloque es un consolidado.
      if (f.formulaHoras !== null && normalizar(f.formulaHoras).includes(HOJA_MATRIZ)) {
        vieneDeMatriz = true
      }

      horasDeFilas += f.horas
      const motivo = motivoDeConfirmacion(f.valorF)
      asignaciones.push({
        nombreTexto: f.valorF,
        categoria: f.categoria,
        horas: f.horas,
        tarifa: f.tarifa,
        importe: f.importe,
        requiereConfirmacion: motivo !== null,
        motivo,
        filaOrigen: f.fila,
      })
    }

    // El total declarado manda; si no está, se usa la suma de las filas.
    const horasTotales = horasDeclaradas ?? horasDeFilas

    bloques.push({
      clave: `${sinPrefijoHoja(cliente)}|${normalizar(nombre)}|${filas[i].fila}`,
      origen: vieneDeMatriz ? 'CONSOLIDADO' : 'DETALLADO',
      nombre,
      cliente,
      area,
      horasTotales: redondear(horasTotales),
      fee,
      importeTotal,
      asignaciones,
      nota,
      filaInicio: filas[i].fila,
      generaBolsa: !vieneDeMatriz,
    })
  }

  return bloques
}

// --- matriz por persona -----------------------------------------------------

type CeldaMatriz = {
  fila: number
  servicio: string
  persona: string | null
  horas: number
}

/**
 * Lee la hoja 'Horas por servicio': una matriz persona x servicio.
 *
 * Los nombres de persona NO están en la fila 1 ( ahí van los meses). Están en la
 * fila de encabezado de cada sección, que es la que empieza con "Procesos de", y
 * valen para las filas que vienen debajo. Por eso se acumulan: hay dos secciones
 * ("implementación" y "mantenimiento") y cada una con su propia fila de nombres.
 */
function extraerMatriz(hoja: Hoja): CeldaMatriz[] {
  const salida: CeldaMatriz[] = []
  let personas: { col: number; persona: string | null }[] = []

  hoja.eachRow({ includeEmpty: false }, (fila, n) => {
    const etiqueta = texto(fila.getCell(2))
    if (etiqueta === null) return

    // Fila de encabezado de sección: define los nombres de persona.
    if (normalizar(etiqueta).startsWith('procesos de')) {
      personas = []
      // El libro usa celdas COMBINADAS: "Eduardo Chiscul" ocupa cuatro columnas
      // seguidas y exceljs devuelve el mismo texto en las cuatro. Sin quedarse con
      // una sola, la misma persona se contaría cuatro veces.
      const vistas = new Set<string>()
      fila.eachCell({ includeEmpty: false }, (celda, col) => {
        if (col <= 2) return
        const t = texto(celda)
        if (!t) return
        const clave = normalizar(t)
        if (vistas.has(clave)) return
        vistas.add(clave)
        personas.push({ col, persona: t })
      })
      return
    }
    if (personas.length === 0) return

    for (const { col, persona } of personas) {
      const horas = numero(fila.getCell(col))
      if (horas === null || horas === 0) continue
      salida.push({ fila: n, servicio: etiqueta, persona, horas })
    }
  })

  return salida
}

/**
 * Horas que la matriz tiene y el detalle no, dentro de un mismo servicio.
 *
 * Con Santa Rosa esto encuentra las 2 h de acompañamiento del Comité: el detalle
 * del servicio tiene 1 h y 12 h, y la matriz añade 2 h más. En cambio NO marca
 * las 4 h de Hostigamiento que la matriz atribuye a Yonny Flores, porque esas 4 h
 * ya están en el detalle (sin dueño). Eso no son horas de más, es una
 * atribución discordante, y se reporta aparte.
 */
function complementos(
  matriz: CeldaMatriz[],
  detallados: ServicioExtraido[]
): CeldaMatriz[] {
  const detallePorServicio = new Map<string, Set<number>>()
  for (const s of detallados) {
    const clave = normalizar(s.nombre)
    if (!detallePorServicio.has(clave)) detallePorServicio.set(clave, new Set())
    for (const a of s.asignaciones) {
      detallePorServicio.get(clave)!.add(redondear(a.horas))
    }
  }

  return matriz.filter((celda) => {
    const clave = normalizar(celda.servicio)
    const horas = detallePorServicio.get(clave)
    // Servicio que no existe en el detalle, u horas que el detalle no contempla.
    if (horas === undefined) return false
    return !horas.has(redondear(celda.horas))
  })
}

// --- planificación ----------------------------------------------------------

/**
 * La planificación viene como una rejilla: columnas E..X son semanas S1..S20 y
 * las filas son sub-etapas. Se devuelven en semanas RELATIVAS a propósito: el
 * Excel no trae fecha de inicio real y convertirla sería inventarla.
 */
function extraerPlanificacion(hoja: Hoja): SubetapaExtraida[] {
  const salida: SubetapaExtraida[] = []

  // Fila 3-4: nombres de mes y de semana por columna.
  const mesPorColumna = new Map<number, string | null>()
  const semanaPorColumna = new Map<number, number | null>()
  for (let col = 5; col <= 24; col += 1) {
    const mes = texto(hoja.getRow(3).getCell(col))
    if (mes) mesPorColumna.set(col, mes)
    const semana = texto(hoja.getRow(4).getCell(col))
    const n = semana ? Number(semana.replace(/\D/g, '')) : NaN
    semanaPorColumna.set(col, Number.isFinite(n) && n > 0 ? n : null)
  }

  let etapa: string | null = null
  for (let n = 5; n <= 16; n += 1) {
    const etiquetaEtapa = texto(hoja.getRow(n).getCell(3))
    if (etiquetaEtapa) etapa = etiquetaEtapa
    const subetapa = texto(hoja.getRow(n).getCell(4))
    if (subetapa === null) continue

    const semanas: number[] = []
    let horas = 0
    let mes: string | null = null
    for (let col = 5; col <= 24; col += 1) {
      const h = numero(hoja.getRow(n).getCell(col))
      if (h === null || h === 0) continue
      horas += h
      const s = semanaPorColumna.get(col)
      if (s) semanas.push(s)
      if (!mes) mes = mesPorColumna.get(col) ?? null
    }
    if (horas === 0) continue

    salida.push({
      etapa,
      subetapa,
      horas: redondear(horas),
      semanaInicio: semanas.length ? Math.min(...semanas) : null,
      semanaFin: semanas.length ? Math.max(...semanas) : null,
      mes,
      filaOrigen: n,
    })
  }

  return salida
}

/**
 * Reparto de personas de la hoja de planificación: porcentaje, nombre y horas
 * redondeadas.
 *
 * Hace falta para detectar identidades ambiguas: las 28 h de la planificación
 * están a nombre de "Junior", mientras que en la cotización las mismas 28 h
 * están a nombre de "Yonny Flores". Sin mirar aquí, la ambigüedad no se ve.
 */
function extraerRepartoPlanificacion(hoja: Hoja): { nombre: string; horas: number }[] {
  const salida: { nombre: string; horas: number }[] = []
  for (let n = 1; n <= 40; n += 1) {
    const nombre = texto(hoja.getRow(n).getCell(4))
    const porcentaje = numero(hoja.getRow(n).getCell(3))
    if (nombre === null || porcentaje === null) continue
    // Solo el reparto: porcentaje entre 0 y 1 y un nombre al lado.
    if (porcentaje <= 0 || porcentaje > 1) continue

    // Las horas redondeadas están en la última columna con número de la fila: el
    // autor calculó el desglose por semanas, lo sumó en una columna y aplicó
    // ROUNDUP en la de más a la derecha (19, 129, 28, 10). Las filas de "Junior"
    // y "Trainee" llegan con fórmula compartida, así que no se puede buscar por
    // ROUNDUP: se toma el último número de la fila, que es el total redondeado.
    let horas = 0
    for (let col = 30; col >= 5; col -= 1) {
      const v = numero(hoja.getRow(n).getCell(col))
      if (v !== null) {
        horas = v
        break
      }
    }
    if (horas > 0) salida.push({ nombre, horas: redondear(horas) })
  }
  return salida
}

// --- observaciones ----------------------------------------------------------

function construirObservaciones(
  consolidados: ServicioExtraido[],
  detallados: ServicioExtraido[],
  extras: CeldaMatriz[],
  planificacion: SubetapaExtraida[],
  reparto: { nombre: string; horas: number }[]
): Observacion[] {
  const obs: Observacion[] = []

  for (const c of consolidados) {
    obs.push({
      tipo: 'CONSOLIDADO',
      severidad: 'INFO',
      mensaje: `"${c.nombre}" es un consolidado de los bloques detallados (${c.horasTotales} h). Se conserva como referencia y no genera bolsa.`,
      detalle: { servicio: c.nombre, horas: c.horasTotales, fila: c.filaInicio },
    })
  }

  for (const e of extras) {
    obs.push({
      tipo: 'COMPLEMENTO_SIN_CONFIRMAR',
      severidad: 'BLOQUEANTE',
      mensaje: `La matriz "Horas por servicio" tiene ${e.horas} h de "${e.servicio}" que ningún bloque detallado recoge. El consolidado las suma. Confirme si contratan esas horas y su periodicidad antes de crear la bolsa.`,
      detalle: { servicio: e.servicio, persona: e.persona, horas: e.horas, fila: e.fila },
    })
  }

  for (const s of detallados) {
    for (const a of s.asignaciones) {
      if (a.nombreTexto === null) {
        obs.push({
          tipo: 'SIN_PERSONA',
          severidad: 'BLOQUEANTE',
          mensaje: `"${s.nombre}" tiene ${a.horas} h de categoría "${a.categoria ?? 'sin categoría'}" sin persona asignada. Quedan pendientes hasta que el Líder las reparta.`,
          detalle: { servicio: s.nombre, categoria: a.categoria, horas: a.horas, fila: a.filaOrigen },
        })
      } else if (a.requiereConfirmacion) {
        obs.push({
          tipo: 'IDENTIDAD_AMBIGUA',
          severidad: 'REVISAR',
          mensaje: `${a.horas} h de "${s.nombre}" aparecen con la etiqueta "${a.nombreTexto}", que no es una persona identificable.`,
          detalle: { servicio: s.nombre, etiqueta: a.nombreTexto, horas: a.horas, fila: a.filaOrigen },
        })
      }
    }
  }

  // La misma cantidad de horas atribuida a nombres distintos, comparando cada
  // servicio con la hoja de planificación.
  //
  // Se compara servicio por servicio a propósito. Agrupar solo por cifra de horas
  // daría falsos positivos: "Trainee" tiene 10 h en tres servicios distintos, y
  // eso no es una ambigüedad de identidad: son tres servicios distintos.
  // Lo que sí es una ambigüedad real es que las mismas horas del mismo servicio
  // aparezcan con dos nombres: las 28 h están como "Yonny flores" en la
  // cotización y como "Junior" en la planificación.
  for (const s of detallados) {
    for (const a of s.asignaciones) {
      if (a.nombreTexto === null) continue
      const planificado = reparto.find((p) => redondear(p.horas) === redondear(a.horas))
      if (!planificado) continue
      if (normalizar(planificado.nombre) === normalizar(a.nombreTexto)) continue
      obs.push({
        tipo: 'IDENTIDAD_AMBIGUA',
        severidad: 'REVISAR',
        mensaje: `Las mismas ${a.horas} h de "${s.nombre}" están a nombre de "${a.nombreTexto}" en la cotización y de "${planificado.nombre}" en la planificación. No se vinculan automáticamente.`,
        detalle: {
          servicio: s.nombre,
          horas: a.horas,
          nombreCotizacion: a.nombreTexto,
          nombrePlanificacion: planificado.nombre,
        },
      })
    }
  }

  // La planificación puede no cuadrar con las horas contratadas.
  if (planificacion.length > 0) {
    const horasPlan = redondear(planificacion.reduce((t, p) => t + p.horas, 0))
    const horasDetalladas = redondear(detallados.reduce((t, s) => t + s.horasTotales, 0))
    const horasPrimerServicio = redondear(detallados[0]?.horasTotales ?? 0)
    if (horasPlan !== horasPrimerServicio && horasPlan !== horasDetalladas) {
      obs.push({
        tipo: 'HORAS_DIFERENTES',
        severidad: 'REVISAR',
        mensaje: `La planificación suma ${horasPlan} h y la cotización del primer servicio indica ${horasPrimerServicio} h. La diferencia puede ser redondeo por persona; no se corrige automáticamente.`,
        detalle: { horasPlanificacion: horasPlan, horasCotizadas: horasPrimerServicio, horasDetallado: horasDetalladas },
      })
    }
  }

  return obs
}

// --- entrada principal ------------------------------------------------------

export async function analizarPresupuesto(archivo: Buffer): Promise<AnalisisPresupuesto> {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(archivo as unknown as ArrayBuffer)

  const hojas = libro.worksheets.map((h) => h.name)
  const hojaCotizacion = libro.worksheets.find((h) => normalizar(h.name).includes('cotizaci'))
  if (!hojaCotizacion) {
    throw new Error('El archivo no tiene una hoja de cotización reconocible.')
  }

  const bloques = extraerBloques(leerFilas(hojaCotizacion))
  if (bloques.length === 0) {
    throw new Error('No se encontró ningún bloque de presupuesto en la hoja de cotización.')
  }

  const detallados = bloques.filter((b) => b.origen === 'DETALLADO')
  const consolidados = bloques.filter((b) => b.origen === 'CONSOLIDADO')

  const hojaMatriz = libro.worksheets.find((h) => normalizar(h.name).includes('horas por servicio'))
  const matriz = hojaMatriz ? extraerMatriz(hojaMatriz) : []
  const extras = complementos(matriz, detallados)

  // Los complementos se convierten en servicios aparte, nunca mezclados.
  const porServicio = new Map<string, CeldaMatriz[]>()
  for (const e of extras) {
    const clave = normalizar(e.servicio)
    if (!porServicio.has(clave)) porServicio.set(clave, [])
    porServicio.get(clave)!.push(e)
  }
  for (const [clave, celdas] of porServicio) {
    const nombre = celdas[0].servicio
    detallados.push({
      clave: `complemento|${clave}`,
      origen: 'COMPLEMENTARIO',
      nombre,
      cliente: bloques[0]?.cliente ?? null,
      area: bloques[0]?.area ?? null,
      horasTotales: redondear(celdas.reduce((t, c) => t + c.horas, 0)),
      fee: null,
      importeTotal: null,
      asignaciones: celdas.map((c) => ({
        nombreTexto: c.persona,
        categoria: null,
        horas: c.horas,
        tarifa: null,
        importe: null,
        requiereConfirmacion: motivoDeConfirmacion(c.persona) !== null,
        motivo: motivoDeConfirmacion(c.persona),
        filaOrigen: c.fila,
      })),
      nota: 'Horas que solo aparecen en el consolidado. Pendientes de confirmación.',
      filaInicio: celdas[0].fila,
      // No cuenta como bolsa hasta que el Líder confirma.
      generaBolsa: false,
    })
  }

  const hojaPlanificacion = libro.worksheets.find((h) => normalizar(h.name) === 'hoja2')
  const planificacion = hojaPlanificacion ? extraerPlanificacion(hojaPlanificacion) : []

  const complementarios = detallados.filter((s) => s.origen === 'COMPLEMENTARIO')
  const reparto = hojaPlanificacion ? extraerRepartoPlanificacion(hojaPlanificacion) : []
  const observaciones = construirObservaciones(consolidados, detallados, extras, planificacion, reparto)

  return {
    hojas,
    cliente: bloques[0]?.cliente ?? null,
    area: bloques[0]?.area ?? null,
    servicios: [...detallados, ...consolidados],
    planificacion,
    observaciones,
    totales: {
      horasDetallado: redondear(
        detallados.filter((s) => s.origen === 'DETALLADO').reduce((t, s) => t + s.horasTotales, 0)
      ),
      horasConsolidado: redondear(consolidados.reduce((t, s) => t + s.horasTotales, 0)),
      horasComplementario: redondear(complementarios.reduce((t, s) => t + s.horasTotales, 0)),
      horasPresupuestadas: redondear(detallados.reduce((t, s) => t + s.horasTotales, 0)),
      horasSegunConsolidado: redondear(consolidados.reduce((t, s) => t + s.horasTotales, 0)),
    },
  }
}
