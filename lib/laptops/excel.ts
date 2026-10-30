// Lectura del Excel de inventario de laptops.
//
// El archivo tiene tres hojas de inventario real (Paredes Cano, Smart Service y
// Valrex) y una cuarta hoja de custodia (Hoja1 / ALMACEN P100). Las tres primeras
// suman 118 equipos; Hoja1 se extrae aparte para no duplicar series ni inflar el
// total. Esta funcion no toca la base de datos: solo convierte el libro en filas
// tipadas para que la ruta de importacion decida que hacer con ellas.

import ExcelJS from 'exceljs'

export type PropiedadLaptop = 'Propia' | 'Smart Service' | 'Valrex'

export type EstadoLaptop =
  | 'Asignado'
  | 'Asignado / Reservado'
  | 'Disponible'
  | 'En reparación'
  | 'BAJA'
  | 'Vendido'
  | 'No disponible'
  | 'Pendiente'

export type FilaLaptop = {
  codigo: string
  tipo_activo: string
  propiedad: PropiedadLaptop
  responsable_actual: string | null
  estado: EstadoLaptop
  area: string | null
  area_destino: string | null
  procesador: string | null
  marca: string | null
  modelo: string | null
  ram: string | null
  numero_serie: string | null
  disco: string | null
  proveedor: string | null
  observacion: string | null
  origen_hoja: string
  origen_seccion: string | null
  origen_fila: number
}

export type FilaAlmacenP100 = {
  usuario_nombre: string | null
  numero_serie: string | null
  estado: string | null
  marca: string | null
  estado_operativo: string | null
  destino: string | null
  observacion: string | null
  origen_fila: number
}

export type AdvertenciaLaptops = {
  hoja: string
  fila: number | null
  mensaje: string
}

export type AnalisisLaptops = {
  filas: FilaLaptop[]
  almacenP100: FilaAlmacenP100[]
  advertencias: AdvertenciaLaptops[]
  resumen: {
    total: number
    almacenP100: number
    porPropiedad: Record<string, number>
    porEstado: Record<string, number>
  }
}

const HOJAS: Array<{ nombre: string; propiedad: PropiedadLaptop; tipoActivo: string }> = [
  { nombre: 'Laptops Propias (Paredes Cano)', propiedad: 'Propia', tipoActivo: 'Laptop' },
  { nombre: 'LAPTOPS ALQUILADAS - SMART SERV', propiedad: 'Smart Service', tipoActivo: 'Alquilado' },
  { nombre: 'LAPTOPS ALQUILADAS - VALREX', propiedad: 'Valrex', tipoActivo: 'Alquilado' },
]

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

function texto(celda: ExcelJS.Cell | undefined): string | null {
  const v = valor(celda)
  if (v === null) return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

function normalizar(valorTexto: string | null): string {
  return String(valorTexto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function escoger(registro: Record<string, string | null>, claves: string[]): string | null {
  for (const clave of claves) {
    const v = registro[normalizar(clave)]
    if (v) return v
  }
  return null
}

function normalizarEstado(valorEstado: string | null): EstadoLaptop {
  const n = normalizar(valorEstado)
  if (!n) return 'Pendiente'
  if (n === 'asignado') return 'Asignado'
  if (n === 'asignado / reservado') return 'Asignado / Reservado'
  if (n === 'disponible') return 'Disponible'
  if (n === 'en reparacion') return 'En reparación'
  if (n === 'baja') return 'BAJA'
  if (n === 'vendido') return 'Vendido'
  if (n === 'no diponible' || n === 'no disponible') return 'No disponible'
  if (n === 'pendiente') return 'Pendiente'
  return 'Pendiente'
}

function esTituloSeccion(primera: string | null): boolean {
  return /^\d+\.\s/.test(String(primera ?? ''))
}

function esFilaCabecera(primera: string | null): boolean {
  const n = normalizar(primera)
  return n === 'titulo / codigo' || n === 'n°' || n === 'n'
}

function registroDeFila(
  fila: ExcelJS.Row,
  cabecera: Map<number, string>
): Record<string, string | null> {
  const registro: Record<string, string | null> = {}
  for (const [columna, clave] of cabecera) {
    if (!clave) continue
    registro[clave] = texto(fila.getCell(columna))
  }
  return registro
}

function contarPor(filas: FilaLaptop[], campo: 'propiedad' | 'estado'): Record<string, number> {
  const conteo: Record<string, number> = {}
  for (const fila of filas) {
    const clave = String(fila[campo])
    conteo[clave] = (conteo[clave] ?? 0) + 1
  }
  return conteo
}

function leerHojaPrincipal(
  hoja: ExcelJS.Worksheet,
  config: (typeof HOJAS)[number],
  advertencias: AdvertenciaLaptops[]
): FilaLaptop[] {
  const filas: FilaLaptop[] = []
  let seccion: string | null = null
  let cabecera: Map<number, string> | null = null

  for (let r = 1; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r)
    const primera = texto(fila.getCell(1))

    if (esTituloSeccion(primera)) {
      seccion = primera
      cabecera = null
      continue
    }

    if (esFilaCabecera(primera)) {
      cabecera = new Map()
      for (let c = 1; c <= hoja.columnCount; c++) {
        const nombre = texto(fila.getCell(c))
        if (nombre) cabecera.set(c, normalizar(nombre))
      }
      continue
    }

    if (!cabecera) continue

    const codigoCrudo = primera ?? escoger(registroDeFila(fila, cabecera), ['N°'])
    if (!codigoCrudo) continue

    const codigo = config.propiedad === 'Valrex'
      ? `VAL-${codigoCrudo.trim()}`
      : codigoCrudo.trim()

    const registro = registroDeFila(fila, cabecera)
    const estadoCrudo = escoger(registro, ['Estado'])
    const estado = normalizarEstado(estadoCrudo)
    if (estadoCrudo && normalizar(estadoCrudo) !== normalizar(estado) && normalizar(estadoCrudo) !== 'no diponible') {
      advertencias.push({
        hoja: hoja.name,
        fila: r,
        mensaje: `Estado no reconocido "${estadoCrudo}" en ${codigo}; se guarda como ${estado}.`,
      })
    }
    if (normalizar(estadoCrudo) === 'no diponible') {
      advertencias.push({
        hoja: hoja.name,
        fila: r,
        mensaje: `"No Diponible" corregido a "No disponible" en ${codigo}.`,
      })
    }

    const area = escoger(registro, ['Área', 'Área / Destino', 'Área destino'])
    const areaDestino = escoger(registro, ['Área destino'])
    const proveedor = escoger(registro, ['Proveedor'])
      ?? (config.propiedad === 'Valrex' ? 'Valrex' : null)

    filas.push({
      codigo,
      tipo_activo: escoger(registro, ['Activo']) ?? config.tipoActivo,
      propiedad: config.propiedad,
      responsable_actual: escoger(registro, [
        'Propietario actual',
        'Custodio actual',
        'Custodio',
        'Custodio / Proveedor',
        'Último usuario',
      ]),
      estado,
      area,
      area_destino: areaDestino,
      procesador: escoger(registro, ['Procesador']),
      marca: escoger(registro, ['Marca']),
      modelo: escoger(registro, ['Modelo']),
      ram: escoger(registro, ['RAM']),
      numero_serie: escoger(registro, ['Número de serie']),
      disco: escoger(registro, ['Disk', 'Disco']),
      proveedor,
      observacion: escoger(registro, [
        'Observación',
        'Obs. Inventario',
        'Falla / Detalle técnico',
        'Motivo de devolución / soporte',
        'Motivo / Detalle técnico',
      ]),
      origen_hoja: hoja.name,
      origen_seccion: seccion,
      origen_fila: r,
    })
  }

  return filas
}

function leerHoja1(hoja: ExcelJS.Worksheet): FilaAlmacenP100[] {
  let filaCabecera = 0
  for (let r = 1; r <= hoja.rowCount; r++) {
    if (normalizar(texto(hoja.getRow(r).getCell(3))) === 'usuarios') {
      filaCabecera = r
      break
    }
  }
  if (!filaCabecera) return []

  const filas: FilaAlmacenP100[] = []
  for (let r = filaCabecera + 1; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r)
    const usuario = texto(fila.getCell(3))
    const serie = texto(fila.getCell(4))
    if (!usuario && !serie) continue
    filas.push({
      usuario_nombre: usuario,
      numero_serie: serie,
      estado: texto(fila.getCell(5)),
      marca: texto(fila.getCell(6)),
      estado_operativo: texto(fila.getCell(7)),
      destino: texto(fila.getCell(8)),
      observacion: texto(fila.getCell(9)),
      origen_fila: r,
    })
  }
  return filas
}

export async function analizarExcelLaptops(archivo: Buffer): Promise<AnalisisLaptops> {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(archivo as unknown as ArrayBuffer)

  const advertencias: AdvertenciaLaptops[] = []
  const filas: FilaLaptop[] = []

  for (const config of HOJAS) {
    const hoja = libro.getWorksheet(config.nombre)
    if (!hoja) {
      advertencias.push({
        hoja: config.nombre,
        fila: null,
        mensaje: `No se encontró la hoja "${config.nombre}".`,
      })
      continue
    }
    filas.push(...leerHojaPrincipal(hoja, config, advertencias))
  }

  const hoja1 = libro.getWorksheet('Hoja1')
  const almacenP100 = hoja1 ? leerHoja1(hoja1) : []
  if (!hoja1) {
    advertencias.push({
      hoja: 'Hoja1',
      fila: null,
      mensaje: 'No se encontró Hoja1 (ALMACEN P100).',
    })
  }

  return {
    filas,
    almacenP100,
    advertencias,
    resumen: {
      total: filas.length,
      almacenP100: almacenP100.length,
      porPropiedad: contarPor(filas, 'propiedad'),
      porEstado: contarPor(filas, 'estado'),
    },
  }
}
