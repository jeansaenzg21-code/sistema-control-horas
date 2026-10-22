'use client'

// Importación masiva de presupuestos.
//
// El jefe de área recibe un Excel por cliente y antes tenía que darlos de alta
// uno por uno. Aquí elige varios archivos y, por cada uno, se lee el nombre y la
// división del propio documento, se crea el cliente si no existe y se importa su
// presupuesto. Todo pasa por las mismas rutas que el alta individual, así que los
// permisos y las validaciones siguen siendo los del servidor.
//
// La pantalla tiene tres fases para que la carga se sienta como un proceso y no
// como un formulario que se queda colgado: elegir archivos, ver el avance y,
// cuando termina, un resumen claro de lo registrado. La zona de subida solo se
// muestra en la primera fase; una vez elegidos los archivos desaparece.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Plus,
  Upload,
  X,
} from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { notifyClientesChange } from '@/lib/events'

type Estado = 'pendiente' | 'procesando' | 'ok' | 'error'

type Fila = {
  id: string
  nombre: string
  estado: Estado
  detalle: string
  creado: boolean
}

type Fase = 'seleccion' | 'procesando' | 'completado'

type Previsualizacion = {
  cliente: { nombre: string | null; areaId: number | null }
  clienteYaExiste: { id: number; nombre: string; areaId: number | null } | null
  puedeImportar: boolean
  motivoPermiso: string
}

export function ImportarPresupuestosMasivo({
  onCerrar,
  onCompletado,
}: {
  onCerrar: () => void
  onCompletado?: () => void
}) {
  const { usuario } = useAuth()
  const esJefeArea = usuario?.rol === 'jefe_area'
  const [filas, setFilas] = useState<Fila[]>([])
  const [fase, setFase] = useState<Fase>('seleccion')
  const [arrastrando, setArrastrando] = useState(false)
  const [resumenAbierto, setResumenAbierto] = useState(true)
  const inputArchivo = useRef<HTMLInputElement>(null)
  const procesando = fase === 'procesando'

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !procesando) onCerrar()
    }
    document.addEventListener('keydown', alPresionar)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alPresionar)
      document.body.style.overflow = overflow
    }
  }, [onCerrar, procesando])

  const actualizar = useCallback((id: string, cambios: Partial<Fila>) => {
    setFilas((anteriores) => anteriores.map((fila) => (fila.id === id ? { ...fila, ...cambios } : fila)))
  }, [])

  const procesarArchivo = useCallback(
    async (archivo: File, fila: Fila) => {
      const previo = new FormData()
      previo.append('archivo', archivo)
      const respuestaPrevia = await fetch('/api/presupuestos/previsualizar', {
        method: 'POST',
        body: previo,
      })
      const previa = (await respuestaPrevia.json()) as Previsualizacion & { error?: string }
      if (!respuestaPrevia.ok) throw new Error(previa.error ?? 'No se pudo leer el Excel.')

      const nombre = String(previa.cliente?.nombre ?? '').trim()
      if (!nombre) throw new Error('El Excel no indica el nombre del cliente.')

      // Si el documento trae la división se respeta. Si no, el jefe de área solo
      // puede dar de alta en la suya; un administrador tendría que corregir el
      // Excel porque no hay forma de adivinar la división.
      const areaDetectada = Number(previa.cliente?.areaId ?? 0) || null
      const areaId = areaDetectada ?? (esJefeArea ? usuario?.area_id ?? null : null)
      if (!areaId) throw new Error('No se pudo detectar la división. Corrige el Excel o usa el alta manual.')
      if (esJefeArea && areaId !== usuario?.area_id) {
        throw new Error('El cliente pertenece a otra división.')
      }
      if (!previa.puedeImportar && !esJefeArea) {
        throw new Error(previa.motivoPermiso || 'No tienes permiso para importar este presupuesto.')
      }

      // El nombre puede existir en otra división: ahí no sirve reutilizarlo, hay
      // que crear el cliente en la división del Excel.
      const existente = previa.clienteYaExiste
      const usarExistente = existente != null && (existente.areaId == null || existente.areaId === areaId)
      let clienteId = usarExistente ? existente.id : null
      let creado = false

      if (clienteId == null) {
        const alta = await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre,
            area_id: areaId,
            horas_contratadas: 0,
            ruc: null,
            correo: null,
            telefono: null,
            direccion: null,
          }),
        })
        const cuerpo = (await alta.json()) as { id?: number; error?: string }
        if (!alta.ok || !cuerpo.id) {
          throw new Error(cuerpo.error ?? 'No se pudo crear el cliente.')
        }
        clienteId = Number(cuerpo.id)
        creado = true
      }

      const importacion = new FormData()
      importacion.append('archivo', archivo)
      importacion.append('cliente_id', String(clienteId))
      const respuestaImportacion = await fetch('/api/presupuestos', {
        method: 'POST',
        body: importacion,
      })
      const resultado = (await respuestaImportacion.json()) as {
        error?: string
        version?: number
        serviciosDetallados?: number
        yaExistia?: boolean
      }
      if (!respuestaImportacion.ok) {
        throw new Error(resultado.error ?? 'No se pudo importar el presupuesto.')
      }

      actualizar(fila.id, {
        estado: 'ok',
        creado,
        detalle: `${creado ? 'Cliente creado' : 'Cliente existente'} · versión ${
          resultado.version ?? '—'
        } · ${resultado.serviciosDetallados ?? 0} servicios`,
      })
    },
    [actualizar, esJefeArea, usuario?.area_id],
  )

  const analizar = useCallback(
    async (archivos: File[]) => {
      if (!usuario || archivos.length === 0 || procesando) return
      const nuevas: Fila[] = archivos.map((archivo, indice) => ({
        id: `${Date.now()}-${indice}-${Math.random().toString(36).slice(2, 8)}`,
        nombre: archivo.name,
        estado: 'pendiente',
        detalle: 'En cola',
        creado: false,
      }))
      setFilas(nuevas)
      setResumenAbierto(true)
      setFase('procesando')
      for (let indice = 0; indice < archivos.length; indice++) {
        const fila = nuevas[indice]
        actualizar(fila.id, { estado: 'procesando', detalle: 'Leyendo y guardando...' })
        try {
          await procesarArchivo(archivos[indice], fila)
        } catch (error) {
          actualizar(fila.id, {
            estado: 'error',
            detalle: error instanceof Error ? error.message : 'No se pudo importar.',
          })
        }
      }
      setFase('completado')
      notifyClientesChange()
      onCompletado?.()
      if (inputArchivo.current) inputArchivo.current.value = ''
    },
    [actualizar, onCompletado, procesando, procesarArchivo, usuario],
  )

  const reiniciar = useCallback(() => {
    setFilas([])
    setFase('seleccion')
    setResumenAbierto(true)
    if (inputArchivo.current) inputArchivo.current.value = ''
  }, [])

  const correctos = filas.filter((fila) => fila.estado === 'ok').length
  const fallidos = filas.filter((fila) => fila.estado === 'error').length
  const creados = filas.filter((fila) => fila.estado === 'ok' && fila.creado).length
  const procesados = correctos + fallidos
  const total = filas.length
  const avance = total > 0 ? Math.round((procesados / total) * 100) : 0
  const actual = filas.find((fila) => fila.estado === 'procesando') ?? null

  const tituloExito =
    correctos === 0
      ? 'No se pudo importar ningún presupuesto'
      : creados > 0
        ? `Se registraron ${creados} ${creados === 1 ? 'cliente' : 'clientes'} correctamente`
        : `Se ${correctos === 1 ? 'importó' : 'importaron'} ${correctos} ${
            correctos === 1 ? 'presupuesto' : 'presupuestos'
          } correctamente`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!procesando) onCerrar()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Importar clientes"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_70px_rgba(0,0,0,0.6)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileSpreadsheet size={16} className="text-[#ab83fb]" />
            {fase === 'completado' ? 'Resumen de la importación' : 'Importar clientes'}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {fase === 'seleccion' && (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setArrastrando(true)
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault()
                setArrastrando(false)
                const archivos = Array.from(e.dataTransfer.files ?? []).filter((archivo) =>
                  /\.(xlsx|xlsm)$/i.test(archivo.name),
                )
                if (archivos.length > 0) void analizar(archivos)
              }}
              className={`rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
                arrastrando ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <input
                ref={inputArchivo}
                type="file"
                accept=".xlsx,.xlsm"
                multiple
                className="hidden"
                onChange={(e) => {
                  const archivos = Array.from(e.target.files ?? [])
                  if (archivos.length > 0) void analizar(archivos)
                }}
              />
              <Upload size={24} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Sube uno o varios Excel de clientes</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Se lee el cliente y la división de cada documento. Si el cliente no existe se crea, y
                su presupuesto se importa en el mismo paso.
              </p>
              <button
                type="button"
                onClick={() => inputArchivo.current?.click()}
                className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                Seleccionar archivos
              </button>
              <p className="mt-2 text-[11px] text-muted-foreground">También puedes arrastrarlos aquí.</p>
            </div>
          )}

          {fase === 'procesando' && (
            <div className="animate-in space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-4 py-3">
                <Loader2 size={22} className="shrink-0 animate-spin text-[#ab83fb]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Importando presupuestos...</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {actual ? actual.nombre : 'Preparando archivos'}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {procesados}/{total}
                </span>
              </div>

              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={avance}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Avance de la importación"
              >
                <div
                  className="h-full rounded-full bg-[#7c3aed] transition-all duration-300"
                  style={{ width: `${avance}%` }}
                />
              </div>

              <ListaResultados filas={filas} />
            </div>
          )}

          {fase === 'completado' && (
            <div className="animate-in space-y-4">
              <div
                className={`slide-in-from-bottom-4 flex items-start gap-3 rounded-xl border px-4 py-4 ${
                  correctos > 0
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-rose-500/30 bg-rose-500/10'
                }`}
                role="status"
              >
                <span
                  className={`success-pop flex size-11 shrink-0 items-center justify-center rounded-full ${
                    correctos > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                  }`}
                >
                  {correctos > 0 ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-foreground">{tituloExito}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {correctos} de {total} {total === 1 ? 'archivo procesado' : 'archivos procesados'}
                    {fallidos > 0 && (
                      <>
                        {' '}
                        · <span className="font-medium text-rose-300">{fallidos} con error</span>
                      </>
                    )}
                    {creados > 0 && correctos > 0 && (
                      <span className="block text-emerald-300">
                        {correctos - creados} se importaron sobre clientes que ya existían.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setResumenAbierto((valor) => !valor)}
                  className="mb-2 text-xs font-medium text-violet-300 hover:text-violet-200"
                  aria-expanded={resumenAbierto}
                >
                  {resumenAbierto ? 'Ocultar detalle' : 'Ver detalle por archivo'}
                </button>
                {resumenAbierto && <ListaResultados filas={filas} />}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          {fase === 'seleccion' && (
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
          )}
          {fase === 'procesando' && (
            <span className="px-1 text-xs text-muted-foreground">
              Espera a que terminen los archivos para cerrar.
            </span>
          )}
          {fase === 'completado' && (
            <>
              <button
                type="button"
                onClick={onCerrar}
                className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={reiniciar}
                className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                <Plus size={15} />
                Importar más
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ListaResultados({ filas }: { filas: Fila[] }) {
  if (filas.length === 0) return null
  return (
    <ul className="space-y-1.5" aria-live="polite">
      {filas.map((fila) => (
        <li
          key={fila.id}
          className="flex items-start gap-2.5 rounded-lg border border-border bg-background/60 px-3 py-2"
        >
          <span className="mt-0.5 flex-none">
            {fila.estado === 'procesando' ? (
              <Loader2 size={15} className="animate-spin text-[#ab83fb]" />
            ) : fila.estado === 'ok' ? (
              <CheckCircle2 size={15} className="text-emerald-400" />
            ) : fila.estado === 'error' ? (
              <AlertTriangle size={15} className="text-rose-400" />
            ) : (
              <FileSpreadsheet size={15} className="text-muted-foreground" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-foreground" title={fila.nombre}>
              {fila.nombre}
            </span>
            <span
              className={`mt-0.5 block text-[11px] ${
                fila.estado === 'error'
                  ? 'text-rose-300'
                  : fila.estado === 'ok'
                    ? 'text-emerald-300'
                    : 'text-muted-foreground'
              }`}
            >
              {fila.detalle}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
