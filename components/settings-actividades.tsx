'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import { opcionesApi } from '@/lib/api-cliente'
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  Info,
  ListChecks,
  Loader2,
  Upload,
  X,
} from 'lucide-react'
import { analizarCatalogoActividades, type AnalisisCatalogo } from '@/lib/actividades/catalogo-excel'

interface AreaCatalogo {
  id: number
  nombre: string
  activo: number
  activas: number
  inactivas: number
  con_codigo: number
  en_uso: number
}

interface GeneralCatalogo {
  id: number
  nombre: string
}

interface Catalogo {
  conCodigo: boolean
  areas: AreaCatalogo[]
  generales: GeneralCatalogo[]
}

interface ResultadoImportacion {
  ok: boolean
  error?: string
  total: number
  creadas: number
  actualizadas: number
  desactivadas: number
  conUso: number
  areasCreadas: string[]
  areas: Array<{ area: string; creadas: number; actualizadas: number; desactivadas: number; conUso: number }>
  errores: Array<{ area: string; detalle: string }>
}

function ordinal(total: number): string {
  return `${total} ${total === 1 ? 'actividad' : 'actividades'}`
}

export function SettingsActividades() {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null)

  const [modal, setModal] = useState(false)
  const [archivoNombre, setArchivoNombre] = useState('')
  const [analisis, setAnalisis] = useState<AnalisisCatalogo | null>(null)
  const [importando, setImportando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setErrorCatalogo(null)
    try {
      const res = await fetch('/api/tipos-actividad/catalogo', opcionesApi())
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorCatalogo(data.error || 'No se pudo cargar el catálogo.')
        return
      }
      setCatalogo(data as Catalogo)
    } catch {
      setErrorCatalogo('Error de conexión al cargar el catálogo.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const manejarArchivo = async (file: File | null) => {
    setAnalisis(null)
    setResultado(null)
    setMensaje(null)
    setArchivoNombre('')
    if (!file) return
    const extension = file.name.toLowerCase().split('.').pop()
    if (extension !== 'xlsx') {
      setMensaje({ tipo: 'error', texto: 'Selecciona el archivo .xlsx del catálogo de actividades.' })
      return
    }
    setArchivoNombre(file.name)
    try {
      const datos = await readSheet(file)
      const filas = (datos as unknown[][]).map((fila) => [fila[0], fila[1]])
      const leido = analizarCatalogoActividades(filas)
      if (leido.total === 0) {
        setMensaje({
          tipo: 'error',
          texto: 'No se encontró ninguna actividad. El archivo debe tener una columna CODIGO y otra ACTIVIDAD, con las áreas separadas por una fila tipo "---- NOMBRE ----".',
        })
        return
      }
      setAnalisis(leido)
    } catch (error) {
      setMensaje({
        tipo: 'error',
        texto: error instanceof Error ? error.message : 'No se pudo leer el archivo.',
      })
    }
  }

  const cerrar = () => {
    setModal(false)
    setAnalisis(null)
    setResultado(null)
    setMensaje(null)
    setArchivoNombre('')
  }

  const importar = async () => {
    if (!analisis) return
    setImportando(true)
    setMensaje(null)
    try {
      const secciones = analisis.secciones
        .filter((seccion) => seccion.actividades.length > 0)
        .map((seccion) => ({
          area: seccion.area,
          crearArea: seccion.crearArea,
          actividades: seccion.actividades.map((actividad) => ({
            codigo: actividad.codigo,
            nombre: actividad.nombre,
          })),
        }))
      const res = await fetch('/api/tipos-actividad/importar', opcionesApi({
        method: 'POST',
        body: { secciones },
      }))
      const data = (await res.json().catch(() => ({}))) as ResultadoImportacion
      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: data.error || 'No se pudo importar.' })
        return
      }
      setResultado(data)
      await cargar()
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión al importar.' })
    } finally {
      setImportando(false)
    }
  }

  const bloqueantes = useMemo(
    () => (analisis?.observaciones ?? []).filter((o) => o.severidad === 'BLOQUEANTE'),
    [analisis]
  )
  const aRevisar = useMemo(
    () => (analisis?.observaciones ?? []).filter((o) => o.severidad === 'REVISAR'),
    [analisis]
  )
  const informativas = useMemo(
    () => (analisis?.observaciones ?? []).filter((o) => o.severidad === 'INFO'),
    [analisis]
  )

  const conCatalogo = catalogo?.areas.filter((area) => area.activas > 0) ?? []
  const sinCatalogo = catalogo?.areas.filter((area) => area.activas === 0) ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Catálogo de actividades</h2>
          <p className="text-sm text-muted-foreground">
            Las {catalogo?.generales.length ?? 5} actividades generales están disponibles para todas las
            divisiones. Cada división puede además tener las suyas propias.
          </p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
        >
          <Upload size={16} />
          Importar catálogo
        </button>
      </div>

      {cargando && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Cargando catálogo...
        </p>
      )}
      {errorCatalogo && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
          {errorCatalogo}
        </p>
      )}

      {catalogo && !catalogo.conCodigo && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Falta la columna <code className="font-mono">codigo</code>. Ejecuta{' '}
          <code className="font-mono">sql/actividades_codigo.sql</code> para poder importar el catálogo con
          sus códigos.
        </p>
      )}

      {catalogo && catalogo.conCodigo && (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">División</th>
                <th className="px-3 py-2 text-right font-medium">Actividades</th>
                <th className="px-3 py-2 text-right font-medium">Con código</th>
                <th className="px-3 py-2 text-right font-medium">Inactivas</th>
                <th className="px-3 py-2 text-right font-medium">Con horas</th>
              </tr>
            </thead>
            <tbody>
              {conCatalogo.map((area) => (
                <tr key={area.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-foreground">
                    {area.nombre}
                    {!area.activo && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        desactivada
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">{area.activas}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{area.con_codigo}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{area.inactivas}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{area.en_uso}</td>
                </tr>
              ))}
              {sinCatalogo.map((area) => (
                <tr key={area.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">
                    {area.nombre}
                    {!area.activo && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        desactivada
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">0</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{area.inactivas}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{area.en_uso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {catalogo && (
        <p className="text-xs text-muted-foreground">
          Las divisiones con 0 actividades solo pueden registrar las {catalogo.generales.length} generales.
        </p>
      )}

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={cerrar}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7c3aed]/15 text-[#c4b5fd]">
                  <FileSpreadsheet size={17} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">Importar catálogo de actividades</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    TIME CONTROL - ACTIVIDADES.xlsx
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={cerrar}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Cerrar"
              >
                <X size={17} />
              </button>
            </div>

            <div className="space-y-3 px-4 py-3">
              <input
                id="archivo-actividades"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  void manejarArchivo(e.target.files?.[0] ?? null)
                }}
              />

              {!analisis ? (
                <label
                  htmlFor="archivo-actividades"
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-[#7c3aed]/40 bg-[#7c3aed]/[0.04] px-4 py-8 text-center transition-colors hover:bg-[#7c3aed]/[0.08]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7c3aed]/15 text-[#c4b5fd]">
                    <FileUp size={19} />
                  </div>
                  <span className="text-xs font-semibold text-foreground">
                    Selecciona el archivo del catálogo
                  </span>
                  <span className="max-w-sm text-[11px] leading-relaxed text-muted-foreground">
                    Una hoja con dos columnas, CODIGO y ACTIVIDAD, y las áreas separadas por una fila tipo{' '}
                    <span className="font-mono text-foreground">---- AUDITORIA ----</span>.
                  </span>
                </label>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{archivoNombre}</span>
                    <span>
                      <strong className="text-foreground">{analisis.total}</strong> actividades
                    </span>
                    <span>
                      en <strong className="text-foreground">{analisis.secciones.length}</strong> áreas
                    </span>
                    <label
                      htmlFor="archivo-actividades"
                      className="ml-auto cursor-pointer rounded-md border border-border px-2 py-1 text-[10px] font-medium transition-colors hover:bg-muted hover:text-foreground"
                    >
                      Cambiar archivo
                    </label>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-1.5 font-medium">Área de destino</th>
                          <th className="px-3 py-1.5 font-medium">Sección del archivo</th>
                          <th className="px-3 py-1.5 text-right font-medium">Actividades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analisis.secciones
                          .filter((seccion) => seccion.actividades.length > 0)
                          .map((seccion) => (
                            <tr key={seccion.titulo} className="border-b border-border/60 last:border-0">
                              <td className="px-3 py-1.5">
                                {seccion.area ? (
                                  <span className="text-foreground">{seccion.area}</span>
                                ) : (
                                  <span className="text-rose-400">Sin área de destino</span>
                                )}
                                {seccion.crearArea && (
                                  <span className="ml-1.5 rounded bg-[#7c3aed]/15 px-1.5 py-0.5 text-[10px] text-[#c4b5fd]">
                                    se crea
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">{seccion.titulo}</td>
                              <td className="px-3 py-1.5 text-right text-foreground">
                                {seccion.actividades.length}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Las actividades que el área ya tenga y no aparezcan en el archivo se{' '}
                    <strong className="text-foreground">desactivan</strong>, no se borran: las horas ya
                    registradas siguen mostrando su nombre. Volver a importar el mismo archivo actualiza el
                    catálogo sin duplicarlo.
                  </p>

                  {bloqueantes.length > 0 && (
                    <ListaObservaciones
                      titulo="Bloquean la importación"
                      icono={<AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                      tono="rose"
                      observaciones={bloqueantes}
                    />
                  )}
                  {aRevisar.length > 0 && (
                    <ListaObservaciones
                      titulo={`${aRevisar.length} para revisar`}
                      icono={<AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                      tono="amber"
                      observaciones={aRevisar}
                    />
                  )}
                  {informativas.length > 0 && (
                    <ListaObservaciones
                      titulo="Cambios aplicados al leer el archivo"
                      icono={<Info size={14} className="mt-0.5 shrink-0" />}
                      tono="muted"
                      observaciones={informativas}
                    />
                  )}

                  <p className="text-[11px] text-muted-foreground">
                      Se importarán <strong className="text-foreground">{analisis.total}</strong> actividades
                      en {analisis.areasDestino.length} áreas. Las secciones sin área de destino se ignoran.
                    </p>
                </>
              )}

              {mensaje && (
                <div
                  className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px] ${
                    mensaje.tipo === 'ok'
                      ? 'border border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400'
                      : 'border border-rose-500/25 bg-rose-500/[0.08] text-rose-400'
                  }`}
                >
                  {mensaje.tipo === 'ok' ? (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                  ) : (
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                  )}
                  <span>{mensaje.texto}</span>
                </div>
              )}

              {resultado && (
                <div className="space-y-2 rounded-xl border border-border bg-muted/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CheckCircle2 size={16} className="text-emerald-400" />
                    Importación finalizada: {resultado.total} actividades
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>
                      <strong className="text-foreground">{resultado.creadas}</strong> creadas
                    </span>
                    <span>
                      <strong className="text-foreground">{resultado.actualizadas}</strong> actualizadas
                    </span>
                    <span>
                      <strong className="text-foreground">{resultado.desactivadas}</strong> desactivadas
                    </span>
                    {resultado.areasCreadas.length > 0 && (
                      <span>
                        divisiones creadas:{' '}
                        <strong className="text-foreground">{resultado.areasCreadas.join(', ')}</strong>
                      </span>
                    )}
                    {resultado.conUso > 0 && (
                      <span className="text-amber-400">
                        {resultado.conUso} tienen horas ya registradas
                      </span>
                    )}
                  </div>
                  {resultado.errores.length > 0 && (
                    <ul className="space-y-0.5 text-[10px] text-rose-400 list-disc pl-4">
                      {resultado.errores.map((error, i) => (
                        <li key={i}>
                          {error.area}: {error.detalle}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={cerrar}
                className="rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {resultado ? 'Cerrar' : 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={importar}
                disabled={importando || !analisis || bloqueantes.length > 0}
                className="inline-flex items-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#7c3aed]/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importando ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ListChecks size={14} />
                )}
                {resultado
                  ? 'Volver a importar'
                  : analisis
                    ? `Importar ${ordinal(analisis.total)}`
                    : 'Importar catálogo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ListaObservaciones({
  titulo,
  icono,
  tono,
  observaciones,
}: {
  titulo: string
  icono: React.ReactNode
  tono: 'rose' | 'amber' | 'muted'
  observaciones: AnalisisCatalogo['observaciones']
}) {
  const [abierto, setAbierto] = useState(tono !== 'muted')
  const clases =
    tono === 'rose'
      ? 'border-rose-500/25 bg-rose-500/[0.06] text-rose-400'
      : tono === 'amber'
        ? 'border-amber-500/25 bg-amber-500/[0.06] text-amber-300'
        : 'border-border bg-muted/20 text-muted-foreground'

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${clases}`}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-[11px] font-semibold"
      >
        {icono}
        {titulo}
      </button>
      {abierto && (
        <ul className="mt-1.5 space-y-1 pl-5 text-[10px] leading-relaxed list-disc">
          {observaciones.map((observacion, indice) => (
            <li key={indice}>{observacion.mensaje}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
