'use client'

import { useMemo, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import { opcionesApi } from '@/lib/api-cliente'
import {
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileUp,
  KeyRound,
  Loader2,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { NOMBRES_DIAS } from '@/lib/dias'

interface Props {
  areas: Array<{ id: number; nombre: string }>
  onClose: () => void
}

interface FilaParseada {
  nombre: string
  correo: string
  usuario: string
  contrasena: string
  cargo: string
  area_nombre?: string
  horario: Array<{ dia_semana: number; hora_inicio: string; hora_fin: string }>
  fila_archivo?: number
}

interface ResultadoImportacion {
  creados: number
  actualizados?: number
  omitidos: number
  jefes?: number
  supervisores?: number
  errores: Array<{ fila: number; error: string }>
}

type TipoArchivo = 'csv' | 'xlsx'

const CABECERA_CSV = [
  'nombre', 'correo', 'usuario', 'contrasena', 'cargo',
  'lun_entrada', 'lun_salida',
  'mar_entrada', 'mar_salida',
  'mie_entrada', 'mie_salida',
  'jue_entrada', 'jue_salida',
  'vie_entrada', 'vie_salida',
  'sab_entrada', 'sab_salida',
  'dom_entrada', 'dom_salida',
]

const ALIAS_XLSX = {
  nombre: ['apellidos y nombres', 'apellidos y nombre', 'nombre completo', 'nombre'],
  correo: ['mail- paredescano', 'mail paredescano', 'correo', 'email'],
  dni: ['dni', 'documento'],
  area: ['area', 'área', 'división', 'division'],
  cargo: ['puesto actual', 'puesto', 'cargo'],
}

function textoCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  return String(valor).trim()
}

function normalizarTexto(valor: unknown): string {
  return textoCelda(valor)
    .replace(/\uFFFD/g, 'I')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function claveTexto(valor: unknown): string {
  return normalizarTexto(valor).replace(/[^a-z0-9]/g, '')
}

function encontrarColumna(encabezados: unknown[], alias: string[]): number {
  const claves = alias.map(claveTexto)
  return encabezados.findIndex((encabezado) => {
    const clave = claveTexto(encabezado)
    return claves.some((aliasColumna) => clave === aliasColumna || (aliasColumna.length >= 4 && clave.includes(aliasColumna)))
  })
}

function normalizarHora(valor: string): string {
  return String(valor ?? '').trim().split(':').slice(0, 2).join(':')
}

function csvEscape(valor: string): string {
  if (/[",\n\r]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`
  return valor
}

function descargarPlantilla() {
  const ejemplo = [
    'Juan Perez,juan.perez@paredescano.com,j.perez,clave123,Analista contable,09:00,18:00,09:00,18:00,09:00,18:00,09:00,18:00,09:00,18:00,,,',
    'Maria Lopez,maria.lopez@paredescano.com,m.lopez,clave456,Asistente de auditoría,08:00,17:00,08:00,17:00,08:00,17:00,08:00,17:00,08:00,17:00,,,',
  ]
  const filas = [CABECERA_CSV.map(csvEscape).join(','), ...ejemplo]
  const blob = new Blob([`\uFEFF${filas.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla_personal.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function parsearCsv(texto: string): string[][] {
  const filas: string[][] = []
  let actual: string[] = []
  let campo = ''
  let enComillas = false
  const contenido = texto.replace(/^\uFEFF/, '')
  for (let i = 0; i < contenido.length; i++) {
    const ch = contenido[i]
    if (enComillas) {
      if (ch === '"') {
        if (contenido[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          enComillas = false
        }
      } else {
        campo += ch
      }
    } else if (ch === '"') {
      enComillas = true
    } else if (ch === ',') {
      actual.push(campo)
      campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && contenido[i + 1] === '\n') i++
      if (campo !== '' || actual.length > 0) {
        actual.push(campo)
        filas.push(actual)
      }
      actual = []
      campo = ''
    } else {
      campo += ch
    }
  }
  if (campo !== '' || actual.length > 0) {
    actual.push(campo)
    filas.push(actual)
  }
  return filas
}

function mapearBaseDatos(filas: unknown[][]): FilaParseada[] {
  const encabezados = filas[0] ?? []
  const indices = {
    nombre: encontrarColumna(encabezados, ALIAS_XLSX.nombre),
    correo: encontrarColumna(encabezados, ALIAS_XLSX.correo),
    dni: encontrarColumna(encabezados, ALIAS_XLSX.dni),
    area: encontrarColumna(encabezados, ALIAS_XLSX.area),
    cargo: encontrarColumna(encabezados, ALIAS_XLSX.cargo),
  }

  if (indices.nombre < 0) throw new Error('No se encontró la columna de nombres en el archivo.')
  if (indices.area < 0) throw new Error('No se encontró la columna División en el archivo.')
  if (indices.dni < 0) throw new Error('No se encontró la columna DNI en el archivo.')

  const dnisUsados = new Set<string>()
  const lineas: FilaParseada[] = []
  for (let indice = 1; indice < filas.length; indice++) {
    const fila = filas[indice]
    if (!fila || fila.every((valor) => textoCelda(valor) === '')) continue
    const numeroFila = indice + 1
    const nombre = textoCelda(fila[indices.nombre])
    const areaNombre = textoCelda(fila[indices.area])
    if (!nombre) throw new Error(`La fila ${numeroFila} no tiene nombre.`)
    if (!areaNombre) throw new Error(`La fila ${numeroFila} no tiene división.`)

    const correoOriginal = indices.correo >= 0 ? textoCelda(fila[indices.correo]) : ''
    const correo = correoOriginal.includes('@') ? correoOriginal : ''
    const dni = textoCelda(fila[indices.dni]).replace(/\s+/g, '')
    if (!dni) throw new Error(`La fila ${numeroFila} no tiene DNI.`)
    if (dnisUsados.has(dni)) throw new Error(`El DNI ${dni} está repetido en el archivo.`)
    dnisUsados.add(dni)
    const cargo = indices.cargo >= 0 ? textoCelda(fila[indices.cargo]) : ''

    lineas.push({
      nombre,
      correo,
      usuario: dni,
      contrasena: dni,
      cargo,
      area_nombre: areaNombre,
      horario: [],
      fila_archivo: numeroFila,
    })
  }

  if (lineas.length === 0) throw new Error('El archivo no contiene filas válidas para importar.')
  return lineas
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SettingsImportarPersonal({ areas, onClose }: Props) {
  const { cargarUsuarios } = useAuth()
  const [areaId, setAreaId] = useState<string>(areas[0] ? String(areas[0].id) : '')
  const [tipoArchivo, setTipoArchivo] = useState<TipoArchivo | null>(null)
  const [archivoNombre, setArchivoNombre] = useState('')
  const [archivoTamano, setArchivoTamano] = useState(0)
  const [csvVisible, setCsvVisible] = useState(false)
  const [filas, setFilas] = useState<FilaParseada[] | null>(null)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const espejoDias = useMemo(() => {
    const mapa = new Map<number, number>()
    NOMBRES_DIAS.forEach((d, i) => mapa.set(i, d.dia_semana))
    return mapa
  }, [])

  const manejarArchivo = async (file: File | null) => {
    setResultado(null)
    setMensaje(null)
    setFilas(null)
    setArchivoNombre('')
    setArchivoTamano(0)
    if (!file) {
      setTipoArchivo(null)
      return
    }

    const extension = file.name.toLowerCase().split('.').pop()
    if (extension === 'xlsx') {
      setTipoArchivo('xlsx')
      setCsvVisible(false)
      setArchivoNombre(file.name)
      setArchivoTamano(file.size)
      try {
        const datos = await readSheet(file)
        const lineas = mapearBaseDatos(datos as unknown[][])
        setFilas(lineas)
        setMensaje({ tipo: 'ok', texto: `${lineas.length} personas detectadas en el archivo.` })
      } catch (error) {
        setMensaje({ tipo: 'error', texto: error instanceof Error ? error.message : 'No se pudo leer el archivo .xlsx.' })
      }
      return
    }

    if (extension !== 'csv') {
      setTipoArchivo(null)
      setMensaje({ tipo: 'error', texto: 'Selecciona un archivo .xlsx o .csv.' })
      return
    }

    setTipoArchivo('csv')
    setCsvVisible(true)
    setArchivoNombre(file.name)
    setArchivoTamano(file.size)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const texto = String(reader.result ?? '')
        const crudas = parsearCsv(texto)
        const inicio = crudas.length > 0 && crudas[0][0]?.trim().toLowerCase() === 'nombre' ? 1 : 0
        const lineas: FilaParseada[] = []
        let errorParseo: string | null = null
        for (let i = inicio; i < crudas.length; i++) {
          const cols = crudas[i]
          const numeroFila = i + 1
          if (!cols[0]?.trim() && !cols[2]?.trim()) continue
          const horario: FilaParseada['horario'] = []
          let incompleto = false
          espejoDias.forEach((diaSemana, idx) => {
            const entrada = normalizarHora(cols[5 + idx * 2] ?? '')
            const salida = normalizarHora(cols[6 + idx * 2] ?? '')
            if ((entrada && !salida) || (!entrada && salida)) {
              incompleto = true
              return
            }
            if (entrada && salida) horario.push({ dia_semana: diaSemana, hora_inicio: entrada, hora_fin: salida })
          })
          if (incompleto) {
            errorParseo = `La fila ${numeroFila} tiene una franja de horario incompleta.`
            break
          }
          lineas.push({
            nombre: cols[0]?.trim() ?? '',
            correo: (cols[1] ?? '').trim(),
            usuario: cols[2]?.trim() ?? '',
            contrasena: cols[3] ?? '',
            cargo: (cols[4] ?? '').trim(),
            horario,
            fila_archivo: numeroFila,
          })
        }
        if (errorParseo) {
          setMensaje({ tipo: 'error', texto: errorParseo })
          setFilas(null)
          return
        }
        if (lineas.length === 0) {
          setMensaje({ tipo: 'error', texto: 'El archivo no contiene filas válidas para importar.' })
          setFilas(null)
          return
        }
        setFilas(lineas)
        setMensaje({ tipo: 'ok', texto: `${lineas.length} personas detectadas en el archivo.` })
      } catch {
        setMensaje({ tipo: 'error', texto: 'No se pudo leer el archivo CSV.' })
        setFilas(null)
      }
    }
    reader.onerror = () => setMensaje({ tipo: 'error', texto: 'No se pudo leer el archivo.' })
    reader.readAsText(file, 'utf-8')
  }

  const importar = async () => {
    if (tipoArchivo !== 'xlsx' && !areaId) {
      setMensaje({ tipo: 'error', texto: 'Selecciona la división de destino para el CSV.' })
      return
    }
    if (!filas || filas.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Selecciona un archivo .xlsx o .csv.' })
      return
    }

    setImportando(true)
    setMensaje(null)
    try {
      const body = tipoArchivo === 'xlsx'
        ? { filas }
        : { area_id: Number(areaId), filas }
      const res = await fetch('/api/usuarios/importar', opcionesApi({ method: 'POST', body }))
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: data.error || 'No se pudo importar.' })
        return
      }
      const errores = Array.isArray(data.errores)
        ? (data.errores as ResultadoImportacion['errores'])
        : []
      if (errores.length === 0) {
        await cargarUsuarios()
        onClose()
        return
      }
      setResultado({ creados: data.creados ?? 0, actualizados: data.actualizados ?? 0, omitidos: data.omitidos ?? 0, jefes: data.jefes ?? 0, supervisores: data.supervisores ?? 0, errores })
      await cargarUsuarios()
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión al importar.' })
    } finally {
      setImportando(false)
    }
  }

  const areasDetectadas = filas ? new Set(filas.map((fila) => fila.area_nombre).filter(Boolean)).size : 0
  const correosDetectados = filas?.filter((fila) => fila.correo).length ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[72vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7c3aed]/15 text-[#c4b5fd]">
              <FileSpreadsheet size={17} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Importar personal</h2>
              <p className="truncate text-xs text-muted-foreground">Carga colaboradores desde RRHH</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Cerrar"
          >
            <X size={17} />
          </button>
        </div>

        <div className="space-y-2.5 px-4 py-3">
          {!filas ? (
            <div
              className="rounded-2xl border border-dashed border-[#7c3aed]/40 bg-[#7c3aed]/[0.04] px-4 py-4 text-center transition-colors hover:bg-[#7c3aed]/[0.08]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void manejarArchivo(e.dataTransfer.files[0] ?? null)
              }}
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#7c3aed]/15 text-[#c4b5fd]">
                <FileUp size={19} />
              </div>
              <h3 className="mt-2 text-xs font-semibold text-foreground">Arrastra tu archivo aquí</h3>
              <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-muted-foreground">
                Usa <span className="font-medium text-foreground">BASE DE DATOS.xlsx</span> para cargar nombres, correos, divisiones y cargos. Los cargos de jefe y gerente se clasifican automáticamente según la división.
              </p>
              <label
                htmlFor="archivo-personal"
                className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#6d28d9]"
              >
                <FileUp size={14} />
                Seleccionar archivo
              </label>
              <p className="mt-3 text-[10px] text-muted-foreground">También acepta archivos CSV con horarios</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-muted/10">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{archivoNombre}</p>
                  <p className="text-[10px] text-muted-foreground">{formatBytes(archivoTamano)} · listo para revisar</p>
                </div>
                <label
                  htmlFor="archivo-personal"
                  className="cursor-pointer rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Cambiar
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[10px] text-muted-foreground">
                <span><strong className="text-foreground">{filas.length}</strong> personas</span>
                <span><strong className="text-foreground">{areasDetectadas}</strong> divisiones</span>
                <span><strong className="text-foreground">{correosDetectados}</strong> correos</span>
              </div>
            </div>
          )}

          <input
            id="archivo-personal"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => { void manejarArchivo(e.target.files?.[0] ?? null) }}
          />

          {tipoArchivo === 'xlsx' && filas && (
            <div className="flex items-center gap-2 rounded-lg border border-[#7c3aed]/25 bg-[#7c3aed]/[0.06] px-3 py-2 text-[10px] text-muted-foreground">
              <KeyRound size={13} className="shrink-0 text-[#c4b5fd]" />
              <span>El usuario y la contraseña inicial se toman del DNI de cada persona.</span>
            </div>
          )}

          {tipoArchivo === 'csv' && (
            <div className="overflow-hidden rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setCsvVisible((visible) => !visible)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/30"
              >
                <span>
                  <span className="block text-xs font-semibold text-foreground">Importación CSV con horarios</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">Opción alternativa para archivos con usuario, contraseña y jornada</span>
                </span>
                <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${csvVisible ? 'rotate-180' : ''}`} />
              </button>
              {csvVisible && (
                <div className="space-y-3 border-t border-border bg-muted/10 px-4 py-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">División de destino</label>
                    <select
                      value={areaId}
                      onChange={(e) => setAreaId(e.target.value)}
                      className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:border-[#7c3aed]/50 focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/20"
                    >
                      {areas.map((area) => <option key={area.id} value={String(area.id)}>{area.nombre}</option>)}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={descargarPlantilla}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <Download size={13} />
                    Descargar plantilla CSV
                  </button>
                </div>
              )}
            </div>
          )}

          {mensaje && (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px] ${mensaje.tipo === 'ok' ? 'border border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400' : 'border border-rose-500/25 bg-rose-500/[0.08] text-rose-400'}`}>
              {mensaje.tipo === 'ok' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
              <span>{mensaje.texto}</span>
            </div>
          )}

          {resultado && (
            <div className="rounded-xl border border-border bg-muted/10 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 size={16} className="text-emerald-400" />
                Importación finalizada: {resultado.creados} creado(s)
                {resultado.actualizados ? ` · ${resultado.actualizados} actualizado(s)` : ''}
                {resultado.jefes ? ` · ${resultado.jefes} jefe(s)` : ''}
                {resultado.supervisores ? ` · ${resultado.supervisores} supervisor(es)` : ''}
                {resultado.omitidos > 0 && ` · ${resultado.omitidos} ya existente(s) omitido(s)`}
              </div>
              {resultado.errores.length > 0 && (
                <>
                  <p className="mt-1 text-[11px] text-rose-400">{resultado.errores.length} fila(s) necesitan atención.</p>
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto pl-4 text-[10px] text-rose-400 list-disc">
                    {resultado.errores.map((error, i) => <li key={i}>Fila {error.fila}: {error.error}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Cancelar</button>
            <button
              type="button"
              onClick={importar}
              disabled={importando || !filas}
              className="inline-flex items-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importando ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
              {filas ? `Importar ${filas.length} persona${filas.length === 1 ? '' : 's'}` : 'Importar personal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
