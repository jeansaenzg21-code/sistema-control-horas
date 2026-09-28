'use client'

// Alta de cliente con presupuesto.
//
// El Excel ya trae el cliente y el área, así que no tiene sentido escribirlos a
// mano y luego volver a subir el mismo archivo. Este paso lee el presupuesto
// primero, enseña lo que encontró y rellena el formulario. El usuario revisa y
// corrige lo que quiera; solo al guardar se crea el cliente y se importa el
// presupuesto.
//
// Importar NO exige presupuesto. Sigue estando el alta manual para quien solo
// quiere registrar un cliente.

import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'

export type PrevisualizacionPresupuesto = {
  cliente: {
    nombre: string | null
    areaDetectada: string | null
    areaId: number | null
    areaCoincide: boolean
  }
  clienteYaExiste: { id: number; nombre: string } | null
  puedeImportar: boolean
  motivoPermiso: string
  resumen: {
    hojas: number
    serviciosDetallado: number
    serviciosConsolidado: number
    horasDetallado: number
    horasConsolidado: number
    horasComplementario: number
    observaciones: number
    observacionesBloqueantes: number
  }
  areasDisponibles: { id: number; nombre: string }[]
  archivoBase64: string
  nombreArchivo: string
}

export function ImportadorPresupuesto({
  onListo,
  onCancelar,
}: {
  /** El usuario confirma: se le pasa el Excel ya leído para crear el cliente. */
  onListo: (datos: {
    nombre: string
    areaId: number
    archivoBase64: string
    nombreArchivo: string
    horas: number
  }) => void
  onCancelar: () => void
}) {
  const [previa, setPrevia] = useState<PrevisualizacionPresupuesto | null>(null)
  const [nombre, setNombre] = useState('')
  const [areaId, setAreaId] = useState<number | ''>('')
  const [analizando, setAnalizando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const analizar = useCallback(async (archivo: File) => {
    setAnalizando(true)
    setError(null)
    try {
      const datos = new FormData()
      datos.append('archivo', archivo)
      const respuesta = await fetch('/api/presupuestos/previsualizar', {
        method: 'POST',
        body: datos,
      })
      const cuerpo = await respuesta.json()
      if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se pudo leer el Excel.')

      const p = cuerpo as PrevisualizacionPresupuesto
      setPrevia(p)
      // Se rellena con lo que trae el documento, pero queda editable.
      if (p.cliente.nombre) setNombre(p.cliente.nombre)
      if (p.cliente.areaId) setAreaId(p.cliente.areaId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el Excel.')
    } finally {
      setAnalizando(false)
      if (inputArchivo.current) inputArchivo.current.value = ''
    }
  }, [])

  const listo = previa !== null && nombre.trim() !== '' && areaId !== ''

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileSpreadsheet size={15} className="text-[#a78bfa]" />
          Nuevo cliente desde presupuesto
        </h2>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Cerrar importador"
        >
          <X size={15} />
        </button>
      </div>

      {previa === null ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setArrastrando(true)
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastrando(false)
            const archivo = e.dataTransfer.files?.[0]
            if (archivo) void analizar(archivo)
          }}
          className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            arrastrando ? 'border-[#7c3aed] bg-[#7c3aed]/5' : 'border-border'
          }`}
        >
          <input
            ref={inputArchivo}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => {
              const archivo = e.target.files?.[0]
              if (archivo) void analizar(archivo)
            }}
          />
          {analizando ? (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              Leyendo el Excel...
            </p>
          ) : (
            <>
              <Upload size={22} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Sube el presupuesto en Excel
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Se leerá el cliente y el área del documento, y se rellenará el
                formulario. Podrás corregirlo antes de guardar.
              </p>
              <button
                type="button"
                onClick={() => inputArchivo.current?.click()}
                className="mt-3 rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9]"
              >
                Seleccionar archivo
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            <CheckCircle2 size={14} className="mt-0.5 flex-none text-emerald-500" />
            <span className="min-w-0">
              Leído <strong className="text-foreground">{previa.nombreArchivo}</strong> ·{' '}
              {previa.resumen.hojas} hojas · {previa.resumen.serviciosDetallado} servicios ·{' '}
              <strong className="text-foreground">{previa.resumen.horasDetallado} h</strong>{' '}
              contratadas
              {previa.resumen.horasConsolidado > 0 && (
                <> (el consolidado dice {previa.resumen.horasConsolidado} h, no se suman)</>
              )}
            </span>
          </p>

          {previa.clienteYaExiste && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              <AlertTriangle size={14} className="mt-0.5 flex-none" />
              Ya existe un cliente llamado «{previa.clienteYaExiste.nombre}». Si creas otro
              más con el mismo nombre quedará duplicado; en ese caso conviene cancelar y
              usar el botón «Presupuestos» del cliente existente.
            </p>
          )}

          {!previa.cliente.areaCoincide && previa.cliente.areaDetectada && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              <AlertTriangle size={14} className="mt-0.5 flex-none" />
              El Excel dice «{previa.cliente.areaDetectada}» y esa área no existe en la
              empresa (o hay varias que coinciden). Elige a cuál pertenece.
            </p>
          )}

          {!previa.puedeImportar && (
            <p className="flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
              <AlertTriangle size={14} className="mt-0.5 flex-none" />
              {previa.motivoPermiso}
            </p>
          )}

          {previa.resumen.observacionesBloqueantes > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              <AlertTriangle size={14} className="mt-0.5 flex-none" />
              Hay {previa.resumen.observacionesBloqueantes}{' '}
              {previa.resumen.observacionesBloqueantes === 1 ? 'observación' : 'observaciones'}{' '}
              bloqueantes y {previa.resumen.horasComplementario} h por confirmar. El
              presupuesto se guardará, pero no se podrá aprobar hasta resolverlas.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">
                Nombre del cliente *
              </span>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre del cliente"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]/30"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">
                División *
              </span>
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : '')}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
              >
                <option value="">Selecciona una división...</option>
                {previa.areasDisponibles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!listo || !previa.puedeImportar}
              onClick={() =>
                previa &&
                onListo({
                  nombre: nombre.trim(),
                  areaId: Number(areaId),
                  archivoBase64: previa.archivoBase64,
                  nombreArchivo: previa.nombreArchivo,
                  horas: previa.resumen.horasDetallado + previa.resumen.horasComplementario,
                })
              }
              className="rounded-lg bg-[#7c3aed] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Crear cliente e importar presupuesto
            </button>
            <button
              type="button"
              onClick={() => {
                setPrevia(null)
                setError(null)
              }}
              className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Cambiar el archivo
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400"
        >
          {error}
        </p>
      )}
    </div>
  )
}
