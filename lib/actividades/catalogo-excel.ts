// Lectura del Excel "TIME CONTROL - ACTIVIDADES": la lista de códigos de
// actividades que la consultoría usa para imputar horas.
//
// La hoja es una lista plana de dos columnas (CODIGO | ACTIVIDAD) con secciones
// marcadas por una fila que solo tiene texto en la segunda columna y está
// rodeada de guiones o puntos:
//
//     AC-1  | VISITA DE RECONOCIMIENTO (Conciliacion Fisica o Contable)
//            ---- ADMINISTRACION ----
//     AD-01 | CAPACITACION
//
// La sección es el área a la que pertenece la actividad. Aquí no se deduce:
// se decide con la tabla SECCIONES, que dice a qué área va cada encabezado.
//
// Igual que en lib/presupuestos/importar-excel.ts, esto es una EXTRACCIÓN:
// devuelve lo que hay y anota los problemas como observaciones. No corrige el
// contenido sin que el tipo de corrección esté escrito a mano en CORRECCIONES,
// y no tira ninguna fila en silencio.

export type ActividadExtraida = {
  /** Código del Excel tal cual (AC-1, AD-01, PT-32). Puede ser null. */
  codigo: string | null
  /** Nombre ya normalizado a Title Case, como las actividades generales. */
  nombre: string
  /** Lo que decía el Excel, antes de corregir y aplicar mayúsculas. */
  nombreOriginal: string
  /** Título de la sección del Excel donde aparece. */
  seccion: string
  /** Área de destino dentro de la empresa. null si el encabezado no está mapeado. */
  area: string | null
  /** Filas del archivo, para poder rastrear el origen de cada actividad. */
  filaOrigen: number
}

export type SeccionExtraida = {
  titulo: string
  area: string | null
  /** El área no existe todavía y hay que crearla para poder importar. */
  crearArea: boolean
  actividades: ActividadExtraida[]
}

export type TipoObservacion =
  /** Encabezado de sección que no está en la tabla SECCIONES: no se puede importar. */
  | 'SIN_AREA_DESTINO'
  /** El área de destino todavía no existe en la empresa. */
  | 'AREA_A_CREAR'
  /** Fila con texto de actividad pero sin código. */
  | 'SIN_CODIGO'
  /** Código con un formato que no es `PREFIJO-NUMERO`. */
  | 'CODIGO_AMBIGUO'
  /** Dos actividades del mismo área con el mismo código. */
  | 'CODIGO_REPETIDO'
  /** Dos actividades del mismo área con el mismo nombre. */
  | 'NOMBRE_REPETIDO'
  /** Nombre que se corrigió con una entrada de CORRECCIONES. */
  | 'NOMBRE_CORREGIDO'
  /** Nombre que parece tener un error de tipeo, corregido o no. */
  | 'NOMBRE_SOSPECHOSO'
  /** Filas antes de la primera sección: títulos y encabezado de tabla. */
  | 'PREAMBULO'
  /** Palabras a las que se devolvió la tilde que el Excel no traía. */
  | 'TILDES_RESTITUIDAS'
  /** La sección del Excel se mapea a un área que está desactivada. */
  | 'AREA_INACTIVA'
  /** Sección sin ninguna actividad legible. */
  | 'SECCION_VACIA'

export type Observacion = {
  tipo: TipoObservacion
  severidad: 'INFO' | 'REVISAR' | 'BLOQUEANTE'
  mensaje: string
  detalle: Record<string, unknown>
}

export type AnalisisCatalogo = {
  secciones: SeccionExtraida[]
  observaciones: Observacion[]
  total: number
  areasDestino: string[]
}

type DestinoArea = {
  claves: string[]
  area: string
  crearSiFalta: boolean
}

/**
 * Encabezado de sección -> área de destino.
 *
 * No se puede resolver por parecido de texto: el Excel dice "ACTIVOS FIJOS" y
 * el área se llama "Gestión de Inventarios y Activo Fijo"; "COMPUTO" es
 * "Tecnología de Información" y "Tax & Legal" es "Impuestos y Legal". La
 * equivalencia es una decisión de negocio, así que está escrita aquí y se
 * puede revisar de un vistazo en lugar de repartida por el código.
 */
export const SECCIONES: DestinoArea[] = [
  { claves: ['ACTIVOS FIJOS', 'ACTIVO FIJO'], area: 'Gestión de Inventarios y Activo Fijo', crearSiFalta: false },
  { claves: ['ADMINISTRACION', 'ADMINISTRACIÓN'], area: 'Administración', crearSiFalta: false },
  { claves: ['AUDITORIA', 'AUDITORÍA'], area: 'Auditoría', crearSiFalta: false },
  { claves: ['CONTABILIDAD'], area: 'Contabilidad', crearSiFalta: true },
  { claves: ['COMPUTO', 'CÓMPUTO', 'TI'], area: 'Tecnología de Información', crearSiFalta: false },
  { claves: ['CONSULTORIA', 'CONSULTORÍA'], area: 'Consultoría', crearSiFalta: false },
  { claves: ['TAX & LEGAL', 'TAX Y LEGAL', 'IMPUESTOS Y LEGAL'], area: 'Impuestos y Legal', crearSiFalta: false },
  {
    claves: ['PRECIOS DE TRANSFERENCIA', 'PRECIOS DE TRANSFERENCIA ', 'TRANSFERENCIA'],
    area: 'Precio de Transferencia',
    crearSiFalta: false,
  },
]

/** Prefijo de dos a cuatro letras, guion y número: AC-1, AD-01, PT-32. */
const RE_CODIGO = /^[A-Z]{1,4}-\d+$/

/**
 * Encabezado de sección. El archivo mezcla guiones y puntos como separadores y
 * usa la elipsis tipográfica (…, U+2026) en "....Tax & Legal…."; si solo se
 * aceptaran guiones, esa sección se leería como parte de la anterior y sus 11
 * actividades acabarían en el área equivocada.
 */
const RE_SECCION = /^[\s.\u2026\-_*~]{2,}\s*(.+?)\s*[\s.\u2026\-_*~]{2,}$/

/**
 * Errores de tipeo corregidos al vuelo.
 *
 * Solo se corrige lo que es inequívoco: una letra corrida o una letra que
 * falta. Cada corrección queda registrada como observación para que se pueda
 * revisar en la pantalla de importación, no como un arreglo silencioso. Lo que
 * no se puede saber sin preguntar (dónde termina una palabra y empieza la
 * siguiente) NO se corrige: se avisa.
 */
const CORRECCIONES: Array<{ de: string; a: string; motivo: string }> = [
  { de: 'EVAUACION', a: 'EVALUACION', motivo: 'EVAUACION no es una palabra: falta la L de EVALUACION.' },
  { de: 'DESCRIPCION', a: 'DESCRIPCIÓN', motivo: 'DESCRIPCION no es una palabra: falta la I de DESCRIPCION.' },
  { de: 'AJSUTES', a: 'AJUSTES', motivo: 'AJSUTES no existe: la forma correcta es AJUSTES.' },
  { de: 'TRASNFERENCIA', a: 'TRANSFERENCIA', motivo: 'TRANSFERENCIA con la S corrida.' },
  { de: 'COPORATIVA', a: 'CORPORATIVA', motivo: 'COPORATIVA no existe: la forma correcta es CORPORATIVA.' },
  { de: 'COPANIA', a: 'COMPANIA', motivo: 'COPANIA no existe: la forma correcta es COMPANIA.' },
]

/**
 * Palabras a las que se les devuelve la tilde que el Excel no tiene.
 *
 * El archivo esta escrito casi entero sin tildes ("REVISION", "ANALISIS",
 * "TRAMITES"), pero las cinco actividades generales del catalogo si las llevan
 * ("Revision, Informes y Cierre"). Sin esta tabla el desplegable de 229
 * actividades quedaria mitad con tilde y mitad sin, al lado de unas generales
 * que si las tienen.
 *
 * Son las unicas palabras del archivo que necesitan tilde: no hay un
 * corrector ortografico detras, hay una lista escrita a mano y revisable. Las
 * claves van SIN tilde porque es como llegan del Excel.
 */
const TILDES: Record<string, string> = {
  ACCION: 'ACCIÓN',
  ACTUALIZACION: 'ACTUALIZACIÓN',
  ADECUACION: 'ADECUACIÓN',
  ADMINISTRACION: 'ADMINISTRACIÓN',
  AMBITO: 'ÁMBITO',
  AMORTIZACION: 'AMORTIZACIÓN',
  ANALISIS: 'ANÁLISIS',
  ANO: 'AÑO',
  ANOS: 'AÑOS',
  APLICACION: 'APLICACIÓN',
  APROBACION: 'APROBACIÓN',
  AREA: 'ÁREA',
  AREAS: 'ÁREAS',
  ATENCION: 'ATENCIÓN',
  AUDITORIA: 'AUDITORÍA',
  BUSQUEDA: 'BÚSQUEDA',
  CAPACITACION: 'CAPACITACIÓN',
  CARACTERISTICAS: 'CARACTERÍSTICAS',
  CATALOGO: 'CATÁLOGO',
  CLASIFICACION: 'CLASIFICACIÓN',
  CODIGO: 'CÓDIGO',
  CODIGOS: 'CÓDIGOS',
  COMPANIA: 'COMPAÑÍA',
  CONCILIACION: 'CONCILIACIÓN',
  CONFECCION: 'CONFECCIÓN',
  CONFIRMACION: 'CONFIRMACIÓN',
  CONSOLIDACION: 'CONSOLIDACIÓN',
  COORDINACION: 'COORDINACIÓN',
  CRITICOS: 'CRÍTICOS',
  DECLARACION: 'DECLARACIÓN',
  DEFINICION: 'DEFINICIÓN',
  DEPRECIACION: 'DEPRECIACIÓN',
  DEPURACION: 'DEPURACIÓN',
  DETERMINACION: 'DETERMINACIÓN',
  DIAGNOSTICO: 'DIAGNÓSTICO',
  DIGITACION: 'DIGITACIÓN',
  DISENO: 'DISEÑO',
  DOCUMENTACION: 'DOCUMENTACIÓN',
  ECONOMICAS: 'ECONÓMICAS',
  ECONOMICOS: 'ECONÓMICOS',
  ELABORACION: 'ELABORACIÓN',
  EMISION: 'EMISIÓN',
  ESPECIFICACION: 'ESPECIFICACIÓN',
  ESTRUCTURACION: 'ESTRUCTURACIÓN',
  EVALUACION: 'EVALUACIÓN',
  FISICA: 'FÍSICA',
  FISICO: 'FÍSICO',
  GRABACION: 'GRABACIÓN',
  IMPRESION: 'IMPRESIÓN',
  INFORMACION: 'INFORMACIÓN',
  MAQUINAS: 'MÁQUINAS',
  METODOS: 'MÉTODOS',
  NOMINA: 'NÓMINA',
  NOTARIAS: 'NOTARÍAS',
  OPERACION: 'OPERACIÓN',
  ORGANIZACION: 'ORGANIZACIÓN',
  PLANIFICACION: 'PLANIFICACIÓN',
  POLITICAS: 'POLÍTICAS',
  PREPARACION: 'PREPARACIÓN',
  PRESENTACION: 'PRESENTACIÓN',
  PRODUCCION: 'PRODUCCIÓN',
  PUBLICAS: 'PÚBLICAS',
  RECEPCION: 'RECEPCIÓN',
  RECOPILACION: 'RECOPILACIÓN',
  REESTRUCTURACION: 'REESTRUCTURACIÓN',
  RELACION: 'RELACIÓN',
  REUNION: 'REUNIÓN',
  REVISION: 'REVISIÓN',
  SELECCION: 'SELECCIÓN',
  SOLUCION: 'SOLUCIÓN',
  SUPERVISION: 'SUPERVISIÓN',
  TECNICO: 'TÉCNICO',
  TESORERIA: 'TESORERÍA',
  TRAMITES: 'TRÁMITES',
  TRANSACCION: 'TRANSACCIÓN',
  TRANSMISION: 'TRANSMISIÓN',
  UBICACION: 'UBICACIÓN',
  VALIDACION: 'VALIDACIÓN',
  VALORIZACION: 'VALORIZACIÓN',
}

/**
 * Errores de tipeo que se detectan pero NO se corrigen, porque la corrección
 * tendría que decidir dónde acaba una palabra y empieza la siguiente.
 */
const RE_SOSPECHOSO_DIGITO = /[a-zà-ÿ]\d|\d[a-zà-ÿ]{3}/
const RE_SOSPECHOSO_PUNTOS = /\.{3,}|\s{2,}|\s+[,.;:]/

/** Siglas y abreviaturas que deben quedar en mayúsculas al aplicar Title Case. */
const SIGLAS = new Set([
  'AFP', 'CCI', 'CIIU', 'CD', 'EPT', 'IGV', 'INEI', 'PDT', 'RRHH', 'SIC', 'SUNAFIL', 'SUNAT', 'WP',
])

/**
 * Palabras que van en minúscula aunque estén en mayúsculas en el Excel, para
 * que el resultado se parezca a las actividades generales ("Levantamiento y
 * Diagnóstico"). No se cuentan como siglas, aunque sean cortas.
 */
const CONECTORES = new Set([
  'A', 'AL', 'CON', 'DE', 'DEL', 'EL', 'EN', 'ETC', 'E', 'LA', 'LAS', 'LO', 'LOS', 'O', 'PARA',
  'POR', 'SE', 'SU', 'U', 'UN', 'UNA', 'VS', 'Y',
])

/** Letras, tildes y ñ, más dígitos y punto para no partir "EE.FF." */
const RE_SIGLA_ABREVIADA = /^[A-Z]{1,3}(\.[A-Z]{1,3})+\.?$/

function textoCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  if (typeof valor === 'object') {
    const objeto = valor as { richText?: { text: string }[]; text?: unknown; result?: unknown }
    if (Array.isArray(objeto.richText)) return objeto.richText.map((r) => r.text).join('').trim()
    if (objeto.text !== undefined) return String(objeto.text).trim()
    if (objeto.result !== undefined) return String(objeto.result).trim()
  }
  return String(valor).trim()
}

/**
 * Compara nombres ignorando tildes, mayúsculas, espacios y signos.
 *
 * "Gestión de Inventarios y Activo Fijo" y "GESTION DE INVENTARIOS Y ACTIVO
 * FIJO" tienen que dar la misma clave, porque uno es el nombre guardado y el
 * otro el encabezado del Excel.
 */
export function claveTexto(valor: unknown): string {
  return textoCelda(valor)
    .replace(/\uFFFD/g, 'I')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
}

function enMayusculas(parte: string): boolean {
  const letras = parte.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '')
  return SIGLAS.has(letras) || RE_SIGLA_ABREVIADA.test(parte)
}

function enMinusculas(parte: string): boolean {
  return CONECTORES.has(parte.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, ''))
}

/**
 * Mayúsculas, tildes y minúsculas de un nombre de actividad.
 *
 * El Excel viene todo en mayúsculas y casi todo sin tildes, con una mezcla
 * que no ayuda: "AJSUTES ESTADÍSTICOS" sí lleva tilde en la segunda palabra y
 * la primera está mal. Se corrigen los acentos con la tabla TILDES, se dejan
 * intactas las siglas (SUNAT, AFP, RRHH), las abreviaturas con punto (EE.FF.) y
 * los conectores ("de", "y", "o"), y se capitaliza la primera letra de cada
 * palabra. Es el mismo criterio con el que están escritas las cinco
 * actividades generales del catálogo.
 *
 * @param restituidas Si se pasa un conjunto, se le añaden las palabras a las
 *   que se les devolvió la tilde, para poder enseñarlas en la importación en
 *   lugar de corregirlas en silencio.
 */
export function aTitulo(texto: string, restituidas?: Set<string>): string {
  const limpio = texto.replace(/\uFFFD/g, 'I').replace(/\s{2,}/g, ' ').trim()
  if (limpio === '') return ''

  let base = limpio.toUpperCase()
  for (const correccion of CORRECCIONES) {
    if (base.includes(correccion.de)) base = base.split(correccion.de).join(correccion.a)
  }
  for (const [sinTilde, conTilde] of Object.entries(TILDES)) {
    if (!new RegExp(`\\b${sinTilde}\\b`).test(base)) continue
    base = base.replace(new RegExp(`\\b${sinTilde}\\b`, 'g'), conTilde)
    restituidas?.add(conTilde.charAt(0) + conTilde.slice(1).toLowerCase())
  }

  let primeraParte = true
  return base.replace(/[A-ZÁÉÍÓÚÜÑ0-9.]+|[^A-ZÁÉÍÓÚÜÑ0-9.]+/g, (parte) => {
    // Los separadores (espacio, guion, barra, paréntesis, coma) se devuelven
    // tal cual: solo se toca el texto de cada palabra.
    if (!/^[A-ZÁÉÍÓÚÜÑ0-9.]/.test(parte)) return parte
    if (enMayusculas(parte)) {
      primeraParte = false
      return parte
    }
    if (!primeraParte && enMinusculas(parte)) return parte.toLowerCase()
    primeraParte = false
    return parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase()
  })
}

function buscarDestino(titulo: string): DestinoArea | null {
  const clave = claveTexto(titulo)
  return SECCIONES.find((destino) => destino.claves.some((c) => claveTexto(c) === clave)) ?? null
}

/**
 * Lee el archivo y devuelve las actividades agrupadas por área de destino.
 *
 * Devuelve las secciones aunque no tengan área mapeada, con `area: null`, para
 * que quien importa vea que faltaba una equivalencia en vez de notar que
 * desaparecieron filas.
 */
export function analizarCatalogoActividades(filas: unknown[][]): AnalisisCatalogo {
  const secciones: SeccionExtraida[] = []
  const observaciones: Observacion[] = []
  const codigosVistos = new Map<string, number>()
  const nombresVistos = new Map<string, number>()
  const preambulo: string[] = []

  let seccion: SeccionExtraida | null = null
  let total = 0
  const tildesRestituidas = new Set<string>()

  filas.forEach((fila, indice) => {
    const numFila = indice + 1
    const colCodigo = textoCelda(fila?.[0])
    const colNombre = textoCelda(fila?.[1])

    const encabezado = colCodigo === '' ? colNombre.match(RE_SECCION) : null
    if (encabezado) {
      const titulo = encabezado[1].trim()
      const destino = buscarDestino(titulo)
      if (!destino) {
        observaciones.push({
          tipo: 'SIN_AREA_DESTINO',
          severidad: 'BLOQUEANTE',
          mensaje: `La sección "${titulo}" (fila ${numFila}) no tiene área de destino. Hay que decidir a qué división pertenece antes de importar.`,
          detalle: { seccion: titulo, fila: numFila, actividades: 0 },
        })
      } else if (destino.crearSiFalta) {
        observaciones.push({
          tipo: 'AREA_A_CREAR',
          severidad: 'INFO',
          mensaje: `La sección "${titulo}" se importa en el área "${destino.area}", que se creará si no existe.`,
          detalle: { seccion: titulo, area: destino.area, fila: numFila },
        })
      }
      seccion = {
        titulo,
        area: destino?.area ?? null,
        crearArea: destino?.crearSiFalta ?? false,
        actividades: [],
      }
      secciones.push(seccion)
      return
    }

    if (colCodigo === '' && colNombre === '') return

    if (!seccion) {
      preambulo.push(`fila ${numFila}: "${colCodigo}" / "${colNombre}"`)
      return
    }

    if (colNombre === '') {
      observaciones.push({
        tipo: 'SIN_CODIGO',
        severidad: 'REVISAR',
        mensaje: `La fila ${numFila} de "${seccion.titulo}" tiene el código "${colCodigo}" pero no tiene actividad.`,
        detalle: { seccion: seccion.titulo, codigo: colCodigo, fila: numFila },
      })
      return
    }

    if (colCodigo === '') {
      observaciones.push({
        tipo: 'SIN_CODIGO',
        severidad: 'REVISAR',
        mensaje: `La fila ${numFila} de "${seccion.titulo}" tiene la actividad "${colNombre}" pero no tiene código. Se importa sin código.`,
        detalle: { seccion: seccion.titulo, nombre: colNombre, fila: numFila },
      })
    }

    const codigo = colCodigo === '' ? null : colCodigo.replace(/\s+/g, '').toUpperCase()
    const nombre = aTitulo(colNombre, tildesRestituidas)
    const area = seccion.area

    if (codigo !== null && !RE_CODIGO.test(codigo)) {
      observaciones.push({
        tipo: 'CODIGO_AMBIGUO',
        severidad: 'REVISAR',
        mensaje: `El código "${colCodigo}" de la fila ${numFila} no tiene el formato PREFIJO-NUMERO. Se conserva tal cual.`,
        detalle: { seccion: seccion.titulo, codigo: colCodigo, fila: numFila },
      })
    }

    for (const correccion of CORRECCIONES) {
      if (colNombre.toUpperCase().includes(correccion.de)) {
        observaciones.push({
          tipo: 'NOMBRE_CORREGIDO',
          severidad: 'INFO',
          mensaje: `"${colNombre}" (fila ${numFila}) se guardó como "${nombre}": ${correccion.motivo}`,
          detalle: { seccion: seccion.titulo, codigo, original: colNombre, nombre, fila: numFila },
        })
        break
      }
    }

    if (RE_SOSPECHOSO_DIGITO.test(nombre) || RE_SOSPECHOSO_PUNTOS.test(colNombre)) {
      observaciones.push({
        tipo: 'NOMBRE_SOSPECHOSO',
        severidad: 'REVISAR',
        mensaje: `Revisa "${nombre}" (fila ${numFila}, código ${codigo ?? 'sin código'}): parece tener un error de tipeo que no se corrige solo.`,
        detalle: { seccion: seccion.titulo, codigo, nombre, original: colNombre, fila: numFila },
      })
    }

    const claveArea = claveTexto(area ?? seccion.titulo)

    if (codigo !== null) {
      const claveCodigo = `${claveArea}|${codigo}`
      const filaPrevia = codigosVistos.get(claveCodigo)
      if (filaPrevia !== undefined) {
        observaciones.push({
          tipo: 'CODIGO_REPETIDO',
          severidad: 'REVISAR',
          mensaje: `El código ${codigo} aparece dos veces en "${area ?? seccion.titulo}" (filas ${filaPrevia} y ${numFila}). El código del Excel no es único y no sirve para identificar una actividad.`,
          detalle: { seccion: seccion.titulo, codigo, filas: [filaPrevia, numFila], nombre },
        })
      } else {
        codigosVistos.set(claveCodigo, numFila)
      }
    }

    const claveNombre = `${claveArea}|${claveTexto(nombre)}`
    const filaNombrePrevia = nombresVistos.get(claveNombre)
    if (filaNombrePrevia !== undefined) {
      observaciones.push({
        tipo: 'NOMBRE_REPETIDO',
        severidad: 'REVISAR',
        mensaje: `"${nombre}" aparece dos veces en "${area ?? seccion.titulo}" (filas ${filaNombrePrevia} y ${numFila}).`,
        detalle: { seccion: seccion.titulo, nombre, filas: [filaNombrePrevia, numFila], codigo },
      })
    } else {
      nombresVistos.set(claveNombre, numFila)
    }

    seccion.actividades.push({ codigo, nombre, nombreOriginal: colNombre, seccion: seccion.titulo, area, filaOrigen: numFila })
    total += 1
  })

  if (preambulo.length > 0) {
    observaciones.push({
      tipo: 'PREAMBULO',
      severidad: 'INFO',
      mensaje: `Se ignoraron ${preambulo.length} fila(s) anteriores a la primera sección (títulos y encabezado de tabla).`,
      detalle: { filas: preambulo.slice(0, 10) },
    })
  }

  if (tildesRestituidas.size > 0) {
    const palabras = [...tildesRestituidas].sort((a, b) => a.localeCompare(b, 'es'))
    observaciones.push({
      tipo: 'TILDES_RESTITUIDAS',
      severidad: 'INFO',
      mensaje: `El archivo está escrito casi entero sin tildes y las actividades generales del catálogo sí las tienen. Se devolvieron las tildes de ${palabras.length} palabras: ${palabras.join(', ')}.`,
      detalle: { palabras, total: palabras.length },
    })
  }

  for (const item of secciones) {
    if (item.actividades.length === 0) {
      observaciones.push({
        tipo: 'SECCION_VACIA',
        severidad: 'REVISAR',
        mensaje: `La sección "${item.titulo}" no tiene actividades legibles.`,
        detalle: { seccion: item.titulo, area: item.area },
      })
    }
  }

  const areasDestino: string[] = []
  for (const item of secciones) {
    if (item.area && !areasDestino.some((existente) => claveTexto(existente) === claveTexto(item.area))) {
      areasDestino.push(item.area)
    }
  }

  return { secciones, observaciones, total, areasDestino }
}
